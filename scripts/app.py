#!/usr/bin/env python3
"""ASGI server for MARS.NET static files, solo API, and Friend Mode rooms."""

from __future__ import annotations

from argparse import ArgumentParser
import asyncio
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import socket
import time
from urllib.parse import unquote

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

try:
    from .multiplayer import AVATAR_IDS, RoomError, RoomManager
    from .multiplayer_ai import generate_ai_reply, interpret_message
    from .serve import MAX_BODY_BYTES, generate_chat, rate_limited, validate_payload
except ImportError:  # Direct execution: python3 scripts/app.py
    from multiplayer import AVATAR_IDS, RoomError, RoomManager
    from multiplayer_ai import generate_ai_reply, interpret_message
    from serve import MAX_BODY_BYTES, generate_chat, rate_limited, validate_payload


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ROOM_MANAGER = RoomManager()
CREATE_LIMIT_PER_MINUTE = 8
JOIN_LIMIT_PER_MINUTE = 24
ABUSE_BUCKETS: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def safe_error(error: Exception) -> str:
    return str(error) if isinstance(error, RoomError) else "invalid_request"


def abuse_limited(kind: str, client_ip: str, limit: int) -> bool:
    now = time.monotonic()
    bucket = ABUSE_BUCKETS[(kind, client_ip)]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= limit:
        return True
    bucket.append(now)
    return False


async def read_json(request: Request) -> dict:
    content_length = request.headers.get("content-length")
    try:
        if content_length and int(content_length) > MAX_BODY_BYTES:
            raise RoomError("invalid_size")
    except ValueError as error:
        raise RoomError("invalid_size") from error
    body = await request.body()
    if not body or len(body) > MAX_BODY_BYTES:
        raise RoomError("invalid_size")
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RoomError("invalid_json") from error
    if not isinstance(value, dict):
        raise RoomError("invalid_json")
    return value


def token_from(request: Request, payload: dict | None = None) -> str:
    token = request.headers.get("x-participant-token") or (payload or {}).get("token")
    if not isinstance(token, str):
        raise RoomError("invalid_participant")
    return token


class ConnectionHub:
    def __init__(self) -> None:
        self.connections: dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self.queues: dict[str, asyncio.Queue] = {}
        self.workers: dict[str, asyncio.Task] = {}

    async def connect(self, room, player, websocket: WebSocket) -> None:
        existing = self.connections[room.code].get(player.token)
        if existing and existing is not websocket:
            await existing.close(code=4001, reason="replaced")
        self.connections[room.code][player.token] = websocket
        ROOM_MANAGER.set_connected(room, player, True)
        await self.broadcast(room)

    async def disconnect(self, room, player, websocket: WebSocket) -> None:
        if self.connections.get(room.code, {}).get(player.token) is not websocket:
            return
        self.connections[room.code].pop(player.token, None)
        ROOM_MANAGER.set_connected(room, player, False)
        await self.broadcast(room)

    async def broadcast(self, room) -> None:
        stale = []
        for player in room.players:
            websocket = self.connections.get(room.code, {}).get(player.token)
            if websocket is None:
                continue
            try:
                await websocket.send_json({"type": "snapshot", "snapshot": ROOM_MANAGER.snapshot(room, player)})
            except (RuntimeError, WebSocketDisconnect):
                stale.append((player, websocket))
        for player, websocket in stale:
            if self.connections.get(room.code, {}).get(player.token) is websocket:
                self.connections[room.code].pop(player.token, None)
                ROOM_MANAGER.set_connected(room, player, False)

    async def enqueue_message(self, room, player, transcript_item) -> None:
        queue = self.queues.setdefault(room.code, asyncio.Queue())
        await queue.put((player.id, transcript_item))
        worker = self.workers.get(room.code)
        if worker is None or worker.done():
            self.workers[room.code] = asyncio.create_task(self._message_worker(room.code))

    async def _message_worker(self, room_code: str) -> None:
        queue = self.queues[room_code]
        while True:
            try:
                speaker_id, item = await asyncio.wait_for(queue.get(), timeout=60)
            except TimeoutError:
                break
            try:
                room = ROOM_MANAGER.get_room(room_code)
            except RoomError:
                break
            if room.phase != "chat":
                queue.task_done()
                continue
            interpretation, interpretation_calls = await interpret_message(room, speaker_id, item["text"])
            ROOM_MANAGER.apply_message_interpretation(
                room,
                speaker_id=speaker_id,
                message_id=item["id"],
                interpretation=interpretation,
            )
            reply_results = await asyncio.gather(*[
                generate_ai_reply(room, ai_id, speaker_id, item["text"], interpretation)
                for ai_id in room.ai_ids
            ])
            request_count = interpretation_calls + sum(count for _, count in reply_results)
            ROOM_MANAGER.record_request_count(room, item["id"], request_count)
            for index, (ai_id, (message, _)) in enumerate(zip(room.ai_ids, reply_results, strict=True)):
                await asyncio.sleep(0.42 + (index * 0.28))
                ROOM_MANAGER.add_ai_reply(room, ai_id=ai_id, message=message, reply_to=item["id"])
                await self.broadcast(room)
            queue.task_done()
        self.queues.pop(room_code, None)
        self.workers.pop(room_code, None)

    async def stop(self) -> None:
        for task in self.workers.values():
            task.cancel()
        if self.workers:
            await asyncio.gather(*self.workers.values(), return_exceptions=True)
        self.workers.clear()
        self.queues.clear()


HUB = ConnectionHub()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_loop())
    yield
    cleanup_task.cancel()
    await asyncio.gather(cleanup_task, return_exceptions=True)
    await HUB.stop()


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(30)
        ROOM_MANAGER.cleanup()


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/api/chat")
async def solo_chat(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if rate_limited(client_ip):
        return JSONResponse({"error": "rate_limited", "mode": "mock"}, status_code=429)
    try:
        payload = validate_payload(await read_json(request))
    except (RoomError, ValueError):
        return JSONResponse({"error": "invalid_request", "mode": "mock"}, status_code=400)
    if not os.environ.get("OPENAI_API_KEY"):
        return JSONResponse({"error": "ai_unavailable", "mode": "mock"}, status_code=503)
    try:
        return await asyncio.to_thread(generate_chat, payload)
    except (OSError, RuntimeError, TimeoutError, ValueError, json.JSONDecodeError):
        return JSONResponse({"error": "ai_failed", "mode": "mock"}, status_code=502)


@app.post("/api/rooms")
async def create_room(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if abuse_limited("create", client_ip, CREATE_LIMIT_PER_MINUTE):
        return JSONResponse({"error": "rate_limited"}, status_code=429)
    try:
        payload = await read_json(request)
        room, player = ROOM_MANAGER.create_room(
            name=payload.get("name"),
            avatar_id=payload.get("avatarId", AVATAR_IDS[0]),
            locale=payload.get("locale"),
        )
        return {"code": room.code, "playerId": player.id, "token": player.token, "snapshot": ROOM_MANAGER.snapshot(room, player)}
    except RoomError as error:
        return JSONResponse({"error": safe_error(error)}, status_code=400)


@app.post("/api/rooms/{code}/join")
async def join_room(code: str, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if abuse_limited("join", client_ip, JOIN_LIMIT_PER_MINUTE):
        return JSONResponse({"error": "rate_limited"}, status_code=429)
    try:
        payload = await read_json(request)
        room, player = ROOM_MANAGER.join_room(code, name=payload.get("name"), avatar_id=payload.get("avatarId", AVATAR_IDS[1]))
        await HUB.broadcast(room)
        return {"code": room.code, "playerId": player.id, "token": player.token, "snapshot": ROOM_MANAGER.snapshot(room, player)}
    except RoomError as error:
        return JSONResponse({"error": safe_error(error)}, status_code=404 if safe_error(error) in ("room_expired", "room_not_found") else 400)


@app.get("/api/rooms/{code}/snapshot")
async def room_snapshot(code: str, request: Request):
    try:
        room, player = ROOM_MANAGER.authenticate(code, token_from(request))
        return ROOM_MANAGER.snapshot(room, player)
    except RoomError as error:
        return JSONResponse({"error": safe_error(error)}, status_code=404 if safe_error(error) in ("room_expired", "room_not_found") else 403)


@app.post("/api/rooms/{code}/ready")
async def ready_room(code: str, request: Request):
    try:
        payload = await read_json(request)
        room, player = ROOM_MANAGER.authenticate(code, token_from(request, payload))
        ROOM_MANAGER.set_ready(
            room,
            player,
            ready=payload.get("ready", True),
            action_id=payload.get("actionId"),
            expected_seq=payload.get("expectedSeq"),
        )
        await HUB.broadcast(room)
        return ROOM_MANAGER.snapshot(room, player)
    except RoomError as error:
        return JSONResponse({"error": safe_error(error)}, status_code=409)


@app.post("/api/rooms/{code}/actions")
async def room_action(code: str, request: Request):
    try:
        payload = await read_json(request)
        room, player = ROOM_MANAGER.authenticate(code, token_from(request, payload))
        common = {"action_id": payload.get("actionId"), "expected_seq": payload.get("expectedSeq")}
        action = payload.get("action")
        if action == "ack_role":
            ROOM_MANAGER.acknowledge_role(room, player, **common)
        elif action == "plant_evidence":
            ROOM_MANAGER.plant_evidence(room, player, target_id=payload.get("targetId"), **common)
        elif action == "ack_facts":
            ROOM_MANAGER.acknowledge_facts(room, player, **common)
        elif action == "vote":
            ROOM_MANAGER.cast_vote(room, player, target_id=payload.get("targetId"), **common)
        elif action == "rematch":
            ROOM_MANAGER.request_rematch(room, player, **common)
        elif action == "end_disconnected":
            ROOM_MANAGER.end_after_disconnect(room, player, **common)
        else:
            raise RoomError("invalid_action")
        await HUB.broadcast(room)
        return ROOM_MANAGER.snapshot(room, player)
    except RoomError as error:
        return JSONResponse({"error": safe_error(error)}, status_code=409)


@app.websocket("/ws/rooms/{code}")
async def room_socket(websocket: WebSocket, code: str):
    await websocket.accept()
    room = None
    player = None
    try:
        client_ip = websocket.client.host if websocket.client else "unknown"
        if abuse_limited("ws-auth", client_ip, JOIN_LIMIT_PER_MINUTE):
            await websocket.close(code=4408, reason="rate_limited")
            return
        authentication = await asyncio.wait_for(websocket.receive_json(), timeout=8)
        if authentication.get("type") != "authenticate":
            raise RoomError("authentication_required")
        room, player = ROOM_MANAGER.authenticate(code, authentication.get("token"))
        await HUB.connect(room, player, websocket)
        missed_pongs = 0
        while True:
            try:
                payload = await asyncio.wait_for(websocket.receive_json(), timeout=20)
            except TimeoutError:
                missed_pongs += 1
                if missed_pongs >= 2:
                    await websocket.close(code=4408, reason="heartbeat_timeout")
                    break
                await websocket.send_json({"type": "ping", "at": int(time.time())})
                continue
            if payload.get("type") == "pong":
                missed_pongs = 0
                continue
            missed_pongs = 0
            if payload.get("type") != "action" or payload.get("action") != "chat":
                await websocket.send_json({"type": "error", "error": "invalid_action"})
                continue
            try:
                item = ROOM_MANAGER.add_human_message(
                    room,
                    player,
                    message=payload.get("message"),
                    action_id=payload.get("actionId"),
                    expected_seq=payload.get("expectedSeq"),
                )
            except RoomError as error:
                await websocket.send_json({"type": "error", "error": safe_error(error)})
                continue
            ROOM_MANAGER.set_typing(room, list(room.ai_ids))
            await HUB.broadcast(room)
            await HUB.enqueue_message(room, player, item)
    except (RoomError, WebSocketDisconnect, TimeoutError):
        pass
    finally:
        if room is not None and player is not None:
            await HUB.disconnect(room, player, websocket)


@app.api_route("/{asset_path:path}", methods=["GET", "HEAD"])
async def static_asset(asset_path: str, request: Request):
    requested = unquote(asset_path or "index.html")
    candidate = (PROJECT_ROOT / requested).resolve()
    if PROJECT_ROOT not in candidate.parents and candidate != PROJECT_ROOT:
        return JSONResponse({"error": "not_found"}, status_code=404)
    if candidate.is_dir():
        candidate = candidate / "index.html"
    if not candidate.is_file():
        return JSONResponse({"error": "not_found"}, status_code=404)
    response = FileResponse(candidate)
    if candidate.suffix == ".html":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "4173")))
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    server_socket = None
    actual_port = args.port
    if args.port == 0:
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((args.bind, 0))
        server_socket.listen(2048)
        actual_port = server_socket.getsockname()[1]
    mode = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna") if os.environ.get("OPENAI_API_KEY") else "mock fallback"
    print(f"Serving {PROJECT_ROOT} at http://{args.bind}:{actual_port}/ ({mode})", flush=True)
    configuration = uvicorn.Config(
        app,
        host=args.bind,
        port=actual_port,
        log_level="error" if args.quiet else "info",
        access_log=not args.quiet,
        ws_max_size=32_768,
    )
    server = uvicorn.Server(configuration)
    if server_socket is None:
        server.run()
    else:
        server.run(sockets=[server_socket])


if __name__ == "__main__":
    main()
