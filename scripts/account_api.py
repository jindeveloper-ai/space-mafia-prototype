"""Supabase-backed authentication and durable account APIs for MARS.NET."""

from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request as UrlRequest, urlopen
from uuid import UUID

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, Response
except ImportError:  # Data sanitizers and merge tests do not require the web framework.
    FastAPI = Request = JSONResponse = Response = Any

try:
    import jwt
    from jwt import PyJWKClient
except ImportError:  # Tests and local guest mode can run before optional auth dependencies are installed.
    jwt = None
    PyJWKClient = None


ACCOUNT_BODY_BYTES = 800_000
CREW_IDS = ("mina", "juno", "noel")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATA_URL_PATTERN = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$")


class AccountError(Exception):
    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    token: str
    claims: dict[str, Any]


def _is_dict(value: Any) -> bool:
    return isinstance(value, dict)


def _bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    return max(minimum, min(maximum, int(value)))


def _unique_strings(values: Any, limit: int, pattern: re.Pattern[str] | None = None) -> list[str]:
    result: list[str] = []
    for value in values if isinstance(values, list) else []:
        if not isinstance(value, str) or not value or len(value) > 100 or (pattern and not pattern.fullmatch(value)):
            continue
        if value not in result:
            result.append(value)
    return result[-limit:]


def sanitize_profile(raw: Any) -> dict[str, Any]:
    source = raw if _is_dict(raw) else {}
    avatar_path = source.get("avatarPath") if isinstance(source.get("avatarPath"), str) else ""
    return {
        "name": str(source.get("name", "")).strip()[:12],
        "locale": "en" if source.get("locale") == "en" else "ko",
        "avatarPath": avatar_path[:220],
        "updatedAt": _bounded_int(source.get("updatedAt"), 0, 9_999_999_999_999, 0),
    }


def sanitize_progression(raw: Any) -> dict[str, Any]:
    source = raw if _is_dict(raw) else {}
    affinity = source.get("affinity") if _is_dict(source.get("affinity")) else {}
    levels = source.get("crewLevels") if _is_dict(source.get("crewLevels")) else {}
    clues = []
    for clue in source.get("clues", []) if isinstance(source.get("clues"), list) else []:
        if not _is_dict(clue) or not re.fullmatch(r"private-detective-[1-5]", str(clue.get("id", ""))):
            continue
        date = clue.get("date")
        if not isinstance(date, str) or not DATE_PATTERN.fullmatch(date):
            continue
        character_id = clue.get("characterId") if clue.get("characterId") in (*CREW_IDS, "group") else "group"
        clues.append({
            "id": clue["id"],
            "date": date,
            "characterId": character_id,
            "outcome": clue.get("outcome") if clue.get("outcome") in ("win", "lose", "draw") else None,
            "selectedId": clue.get("selectedId") if clue.get("selectedId") in (*CREW_IDS, "player") else None,
        })
    active_quest = source.get("activeQuest") if _is_dict(source.get("activeQuest")) else None
    if active_quest:
        active_quest = json.loads(json.dumps(active_quest))
        if len(json.dumps(active_quest, ensure_ascii=False)) > 4_000:
            active_quest = None
    unlocked_jobs = [job for job in _unique_strings(source.get("unlockedJobs"), 5) if job == "private-detective"]
    equipped = "private-detective" if source.get("equippedJob") == "private-detective" and unlocked_jobs else None
    return {
        "version": 2,
        "affinity": {crew_id: _bounded_int(affinity.get(crew_id), 0, 999, 0) for crew_id in CREW_IDS},
        "crewLevels": {crew_id: _bounded_int(levels.get(crew_id), 1, 50, {"mina": 2, "juno": 4, "noel": 3}[crew_id]) for crew_id in CREW_IDS},
        "difficultyMode": "hard" if source.get("difficultyMode") == "hard" else "normal",
        "leveledRoundIds": _unique_strings(source.get("leveledRoundIds"), 100),
        "activeQuest": active_quest,
        "rewardedQuestIds": _unique_strings(source.get("rewardedQuestIds"), 200),
        "clueDates": _unique_strings(source.get("clueDates"), 5, DATE_PATTERN),
        "clues": clues[:5],
        "unlockedJobs": unlocked_jobs,
        "equippedJob": equipped,
    }


def sanitize_archive_dates(raw: Any) -> list[str]:
    values = raw if isinstance(raw, list) else []
    return sorted(set(_unique_strings(values, 365, DATE_PATTERN)))[-365:]


def sanitize_match(raw: Any) -> dict[str, Any] | None:
    if not _is_dict(raw) or not isinstance(raw.get("roundId"), str) or not raw["roundId"].strip():
        return None
    votes = []
    for vote in raw.get("votes", []) if isinstance(raw.get("votes"), list) else []:
        if _is_dict(vote) and vote.get("voterId") in CREW_IDS and vote.get("candidateId") in (*CREW_IDS, "player"):
            votes.append({"voterId": vote["voterId"], "candidateId": vote["candidateId"]})
    return {
        "roundId": raw["roundId"].strip()[:100],
        "mode": "friend" if raw.get("mode") == "friend" else "solo",
        "difficulty": "hard" if raw.get("difficulty") == "hard" else "normal",
        "role": "citizen" if raw.get("role") == "citizen" else "mafia",
        "outcome": raw.get("outcome") if raw.get("outcome") in ("win", "lose", "draw") else "draw",
        "evidenceTargetId": raw.get("evidenceTargetId") if raw.get("evidenceTargetId") in CREW_IDS else None,
        "accusedId": raw.get("accusedId") if raw.get("accusedId") in CREW_IDS else None,
        "claimId": raw.get("claimId") if raw.get("claimId") in ("seen", "machine", "changed") else None,
        "responseId": raw.get("responseId") if raw.get("responseId") in ("double-down", "return-evidence", "check-time") else None,
        "selectedId": raw.get("selectedId") if raw.get("selectedId") in (*CREW_IDS, "player") else None,
        "votes": votes[:6],
        "voteShiftCount": _bounded_int(raw.get("voteShiftCount"), 0, 3, 0),
        "stars": _bounded_int(raw.get("stars"), 0, 3, 0),
        "engineVersion": str(raw.get("engineVersion", "unknown"))[:40],
        "authoritative": raw.get("authoritative") is True,
        "playedAt": str(raw.get("playedAt", datetime.now(timezone.utc).isoformat()))[:35],
    }


def sanitize_chat_messages(character_id: str, raw: Any) -> list[dict[str, Any]]:
    if character_id not in CREW_IDS:
        return []
    result: dict[str, dict[str, Any]] = {}
    for item in raw if isinstance(raw, list) else []:
        if not _is_dict(item) or not isinstance(item.get("id"), str):
            continue
        sender = item.get("sender") if item.get("sender") in ("player", "character") else None
        body = str(item.get("body", "")).strip()[:1_000]
        if not sender or not body:
            continue
        client_id = item["id"].strip()[:100]
        if not client_id:
            continue
        result[client_id] = {
            "id": client_id,
            "sender": sender,
            "body": body,
            "createdAt": str(item.get("createdAt", datetime.now(timezone.utc).isoformat()))[:35],
            "modelMode": "live" if item.get("modelMode") == "live" else "mock",
        }
    return list(result.values())[-500:]


def merge_progression(local_raw: Any, cloud_raw: Any) -> dict[str, Any]:
    local = sanitize_progression(local_raw)
    cloud = sanitize_progression(cloud_raw)
    clues = {item["id"]: item for item in [*local["clues"], *cloud["clues"]]}
    unlocked = list(dict.fromkeys([*local["unlockedJobs"], *cloud["unlockedJobs"]]))
    equipped_candidate = cloud.get("equippedJob") or local.get("equippedJob")
    merged = {
        **local,
        **cloud,
        "affinity": {crew_id: max(local["affinity"][crew_id], cloud["affinity"][crew_id]) for crew_id in CREW_IDS},
        "crewLevels": {crew_id: max(local["crewLevels"][crew_id], cloud["crewLevels"][crew_id]) for crew_id in CREW_IDS},
        "leveledRoundIds": list(dict.fromkeys([*local["leveledRoundIds"], *cloud["leveledRoundIds"]]))[-100:],
        "activeQuest": cloud.get("activeQuest") or local.get("activeQuest"),
        "rewardedQuestIds": list(dict.fromkeys([*local["rewardedQuestIds"], *cloud["rewardedQuestIds"]]))[-200:],
        "clueDates": list(dict.fromkeys([*local["clueDates"], *cloud["clueDates"]]))[-5:],
        "clues": list(clues.values())[:5],
        "unlockedJobs": unlocked,
        "equippedJob": equipped_candidate if equipped_candidate in unlocked else None,
    }
    return sanitize_progression(merged)


def merge_snapshots(local_raw: Any, cloud_raw: Any) -> dict[str, Any]:
    local = local_raw if _is_dict(local_raw) else {}
    cloud = cloud_raw if _is_dict(cloud_raw) else {}
    local_profile = sanitize_profile(local.get("profile"))
    cloud_profile = sanitize_profile(cloud.get("profile"))
    profile = cloud_profile if cloud_profile["updatedAt"] >= local_profile["updatedAt"] else local_profile
    matches: dict[str, dict[str, Any]] = {}
    for raw in [*(local.get("matches") or []), *(cloud.get("matches") or [])]:
        item = sanitize_match(raw)
        if item:
            matches[item["roundId"]] = item
    chats = {}
    local_chats = local.get("chats") if _is_dict(local.get("chats")) else {}
    cloud_chats = cloud.get("chats") if _is_dict(cloud.get("chats")) else {}
    for crew_id in CREW_IDS:
        chats[crew_id] = sanitize_chat_messages(crew_id, [*(local_chats.get(crew_id) or []), *(cloud_chats.get(crew_id) or [])])
    return {
        "version": 1,
        "profile": profile,
        "progression": merge_progression(local.get("progression"), cloud.get("progression")),
        "archiveDates": sanitize_archive_dates([*(local.get("archiveDates") or []), *(cloud.get("archiveDates") or [])]),
        "matches": list(matches.values())[-200:],
        "chats": chats,
        "revision": _bounded_int(cloud.get("revision"), 0, 2_147_483_647, 0),
    }


class SupabaseBackend:
    def __init__(self) -> None:
        raw_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        parsed_url = urlsplit(raw_url)
        is_local_http = parsed_url.scheme == "http" and parsed_url.hostname in {"127.0.0.1", "localhost"}
        is_safe_url = (
            (parsed_url.scheme == "https" or is_local_http)
            and bool(parsed_url.hostname)
            and parsed_url.username is None
            and parsed_url.password is None
            and parsed_url.path in {"", "/"}
            and not parsed_url.query
            and not parsed_url.fragment
        )
        self.url = raw_url if is_safe_url else ""
        self.publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.google_enabled = os.environ.get("SUPABASE_GOOGLE_ENABLED", "").lower() in ("1", "true", "yes")
        self.email_enabled = os.environ.get("SUPABASE_EMAIL_ENABLED", "true").lower() in ("1", "true", "yes")
        self.jwk_client = PyJWKClient(f"{self.url}/auth/v1/.well-known/jwks.json", cache_keys=True) if self.url and PyJWKClient else None

    @property
    def configured(self) -> bool:
        return bool(self.url and self.publishable_key and self.jwk_client)

    def public_config(self) -> dict[str, Any]:
        enabled = self.configured
        return {
            "enabled": enabled,
            "supabaseUrl": self.url if enabled else "",
            "publishableKey": self.publishable_key if enabled else "",
            "providers": {
                "google": bool(enabled and self.google_enabled),
                "email": bool(enabled and self.email_enabled),
            },
        }

    async def verify(self, request: Request) -> AuthenticatedUser:
        if not self.configured or jwt is None:
            raise AccountError("account_service_unavailable", 503)
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise AccountError("authentication_required", 401)
        token = authorization.removeprefix("Bearer ").strip()
        try:
            signing_key = await asyncio.to_thread(self.jwk_client.get_signing_key_from_jwt, token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256", "EdDSA"],
                audience=os.environ.get("SUPABASE_JWT_AUDIENCE", "authenticated"),
                issuer=f"{self.url}/auth/v1",
                options={"require": ["exp", "iat", "sub"]},
            )
            user_id = str(UUID(str(claims["sub"])))
        except Exception as error:
            raise AccountError("invalid_access_token", 401) from error
        return AuthenticatedUser(user_id=user_id, token=token, claims=claims)

    def _request_sync(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        service: bool = False,
        body: Any = None,
        content_type: str = "application/json",
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[int, Any, dict[str, str]]:
        key = self.service_key if service else self.publishable_key
        if not key:
            raise AccountError("account_service_unavailable", 503)
        if not path.startswith("/") or path.startswith("//") or "://" in path or "\\" in path:
            raise AccountError("invalid_upstream_path", 400)
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {self.service_key if service else token}",
            "Accept": "application/json",
            **(extra_headers or {}),
        }
        encoded: bytes | None = None
        if body is not None:
            encoded = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = content_type
        request = UrlRequest(f"{self.url}{path}", data=encoded, headers=headers, method=method)
        try:
            # The base URL and relative path are constrained above; file and alternate URL schemes are rejected.
            with urlopen(request, timeout=12) as response:  # nosemgrep: python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected
                raw = response.read()
                parsed = json.loads(raw) if raw and "json" in response.headers.get("content-type", "") else raw
                return response.status, parsed, dict(response.headers)
        except HTTPError as error:
            raw = error.read()
            try:
                parsed = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                parsed = {"message": "upstream_error"}
            return error.code, parsed, dict(error.headers)
        except (OSError, URLError, TimeoutError) as error:
            raise AccountError("cloud_unavailable", 503) from error

    async def request(self, *args, **kwargs) -> tuple[int, Any, dict[str, str]]:
        return await asyncio.to_thread(self._request_sync, *args, **kwargs)

    async def rest(self, method: str, path: str, user: AuthenticatedUser, body: Any = None, headers: dict[str, str] | None = None) -> Any:
        status, data, _ = await self.request(method, f"/rest/v1/{path}", token=user.token, body=body, extra_headers=headers)
        if status >= 400:
            raise AccountError("cloud_request_failed", 503 if status >= 500 else 400)
        return data

    async def snapshot(self, user: AuthenticatedUser, include_history: bool = True) -> dict[str, Any]:
        encoded_id = quote(user.user_id, safe="")
        profile_rows, state_rows = await asyncio.gather(
            self.rest("GET", f"profiles?user_id=eq.{encoded_id}&select=display_name,locale,avatar_path,client_updated_at", user),
            self.rest("GET", f"player_state?user_id=eq.{encoded_id}&select=progression,archive_visit_dates,revision", user),
        )
        profile_row = profile_rows[0] if profile_rows else {}
        state_row = state_rows[0] if state_rows else {}
        snapshot = {
            "version": 1,
            "profile": {
                "name": profile_row.get("display_name", ""),
                "locale": profile_row.get("locale", "ko"),
                "avatarPath": profile_row.get("avatar_path", ""),
                "updatedAt": profile_row.get("client_updated_at", 0),
            },
            "progression": state_row.get("progression", {}),
            "archiveDates": state_row.get("archive_visit_dates", []),
            "revision": state_row.get("revision", 0),
            "matches": [],
            "chats": {crew_id: [] for crew_id in CREW_IDS},
        }
        if not include_history:
            return snapshot
        match_rows, chat_rows = await asyncio.gather(
            self.rest("GET", f"match_history?user_id=eq.{encoded_id}&select=*&order=played_at.asc&limit=200", user),
            self.rest("GET", f"chat_messages?user_id=eq.{encoded_id}&select=*&order=created_at.asc&limit=500", user),
        )
        snapshot["matches"] = [db_match_to_client(item) for item in match_rows]
        for item in chat_rows:
            character_id = item.get("character_id")
            if character_id in CREW_IDS:
                snapshot["chats"][character_id].append(db_chat_to_client(item))
        return snapshot


def db_match_to_client(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "roundId": item.get("round_id"),
        "mode": item.get("mode"),
        "difficulty": item.get("difficulty"),
        "role": item.get("role"),
        "outcome": item.get("outcome"),
        "evidenceTargetId": item.get("evidence_target_id"),
        "accusedId": item.get("accused_id"),
        "claimId": item.get("claim_id"),
        "responseId": item.get("response_id"),
        "selectedId": item.get("selected_id"),
        "votes": item.get("votes", []),
        "voteShiftCount": item.get("vote_shift_count", 0),
        "stars": item.get("stars", 0),
        "engineVersion": item.get("engine_version", "unknown"),
        "authoritative": item.get("authoritative", False),
        "playedAt": item.get("played_at"),
    }


def db_chat_to_client(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("client_message_id"),
        "sender": item.get("sender"),
        "body": item.get("body"),
        "createdAt": item.get("created_at"),
        "modelMode": item.get("model_mode", "mock"),
    }


async def read_body(request: Request) -> dict[str, Any]:
    body = await request.body()
    if not body or len(body) > ACCOUNT_BODY_BYTES:
        raise AccountError("invalid_request", 400)
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AccountError("invalid_request", 400) from error
    if not isinstance(payload, dict):
        raise AccountError("invalid_request", 400)
    return payload


def parse_mutation_id(value: Any) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError) as error:
        raise AccountError("invalid_mutation_id", 400) from error


def account_response(error: AccountError) -> JSONResponse:
    return JSONResponse({"error": error.code}, status_code=error.status)


def register_account_routes(app: FastAPI) -> None:
    backend = SupabaseBackend()

    @app.get("/api/auth/config")
    async def auth_config():
        return backend.public_config()

    async def apply_snapshot(user: AuthenticatedUser, snapshot: dict[str, Any], mutation_id: str, base_revision: int) -> dict[str, Any]:
        profile = sanitize_profile(snapshot.get("profile"))
        payload = {
            "p_base_revision": base_revision,
            "p_mutation_id": mutation_id,
            "p_progression": sanitize_progression(snapshot.get("progression")),
            "p_archive_dates": sanitize_archive_dates(snapshot.get("archiveDates")),
            "p_profile": profile,
        }
        result = await backend.rest("POST", "rpc/mars_apply_player_state", user, payload)
        if not _is_dict(result) or result.get("conflict"):
            raise AccountError("revision_conflict", 409)
        return result

    async def upsert_matches(user: AuthenticatedUser, matches: Any) -> None:
        rows = []
        for raw in matches if isinstance(matches, list) else []:
            item = sanitize_match(raw)
            if not item:
                continue
            rows.append({
                "user_id": user.user_id,
                "round_id": item["roundId"],
                "mode": item["mode"],
                "difficulty": item["difficulty"],
                "role": item["role"],
                "outcome": item["outcome"],
                "evidence_target_id": item["evidenceTargetId"],
                "accused_id": item["accusedId"],
                "claim_id": item["claimId"],
                "response_id": item["responseId"],
                "selected_id": item["selectedId"],
                "votes": item["votes"],
                "vote_shift_count": item["voteShiftCount"],
                "stars": item["stars"],
                "engine_version": item["engineVersion"],
                "authoritative": item["authoritative"],
                "played_at": item["playedAt"],
            })
        if rows:
            await backend.rest("POST", "match_history?on_conflict=user_id,round_id", user, rows, {"Prefer": "resolution=merge-duplicates,return=minimal"})

    async def upsert_chats(user: AuthenticatedUser, chats: Any) -> None:
        if not _is_dict(chats):
            return
        rows = []
        for character_id in CREW_IDS:
            for item in sanitize_chat_messages(character_id, chats.get(character_id)):
                rows.append({
                    "user_id": user.user_id,
                    "client_message_id": item["id"],
                    "character_id": character_id,
                    "sender": item["sender"],
                    "body": item["body"],
                    "model_mode": item["modelMode"],
                    "created_at": item["createdAt"],
                })
        if rows:
            await backend.rest("POST", "chat_messages?on_conflict=user_id,client_message_id", user, rows, {"Prefer": "resolution=merge-duplicates,return=minimal"})

    @app.post("/api/account/bootstrap")
    async def bootstrap_account(request: Request):
        try:
            user = await backend.verify(request)
            payload = await read_body(request)
            mutation_id = parse_mutation_id(payload.get("mutationId"))
            local = payload.get("snapshot") if _is_dict(payload.get("snapshot")) else {}
            cloud = await backend.snapshot(user)
            merged = merge_snapshots(local, cloud)
            try:
                await apply_snapshot(user, merged, mutation_id, merged["revision"])
            except AccountError as error:
                if error.status != 409:
                    raise
                cloud = await backend.snapshot(user)
                merged = merge_snapshots(local, cloud)
                await apply_snapshot(user, merged, mutation_id, merged["revision"])
            await asyncio.gather(upsert_matches(user, merged["matches"]), upsert_chats(user, merged["chats"]))
            return {"snapshot": await backend.snapshot(user)}
        except AccountError as error:
            return account_response(error)

    @app.get("/api/account/state")
    async def get_account_state(request: Request):
        try:
            user = await backend.verify(request)
            return {"snapshot": await backend.snapshot(user, include_history=False)}
        except AccountError as error:
            return account_response(error)

    @app.patch("/api/account/state")
    async def patch_account_state(request: Request):
        try:
            user = await backend.verify(request)
            payload = await read_body(request)
            mutation_id = parse_mutation_id(payload.get("mutationId"))
            base_revision = _bounded_int(payload.get("baseRevision"), 0, 2_147_483_647, 0)
            snapshot = payload.get("snapshot") if _is_dict(payload.get("snapshot")) else {}
            result = await apply_snapshot(user, snapshot, mutation_id, base_revision)
            return {"revision": result.get("revision", base_revision + 1)}
        except AccountError as error:
            return account_response(error)

    @app.get("/api/account/matches")
    async def get_matches(request: Request, before: str | None = None, limit: int = 50):
        try:
            user = await backend.verify(request)
            query = {"user_id": f"eq.{user.user_id}", "select": "*", "order": "played_at.desc", "limit": str(max(1, min(100, limit)))}
            if before:
                query["played_at"] = f"lt.{before[:35]}"
            rows = await backend.rest("GET", f"match_history?{urlencode(query)}", user)
            page_limit = max(1, min(100, limit))
            return {
                "matches": [db_match_to_client(item) for item in rows],
                "nextCursor": rows[-1].get("played_at") if len(rows) == page_limit else None,
            }
        except AccountError as error:
            return account_response(error)

    @app.post("/api/account/matches")
    async def post_match(request: Request):
        try:
            user = await backend.verify(request)
            payload = await read_body(request)
            await upsert_matches(user, [payload])
            return {"saved": True}
        except AccountError as error:
            return account_response(error)

    @app.get("/api/account/chats/{character_id}")
    async def get_chats(character_id: str, request: Request, before: str | None = None, limit: int = 50):
        try:
            if character_id not in CREW_IDS:
                raise AccountError("invalid_character", 404)
            user = await backend.verify(request)
            query = {
                "user_id": f"eq.{user.user_id}",
                "character_id": f"eq.{character_id}",
                "select": "client_message_id,sender,body,model_mode,created_at",
                "order": "created_at.desc",
                "limit": str(max(1, min(100, limit))),
            }
            if before:
                query["created_at"] = f"lt.{before[:35]}"
            rows = await backend.rest("GET", f"chat_messages?{urlencode(query)}", user)
            messages = [db_chat_to_client(item) for item in reversed(rows)]
            page_limit = max(1, min(100, limit))
            return {
                "messages": messages,
                "nextCursor": rows[-1].get("created_at") if len(rows) == page_limit else None,
            }
        except AccountError as error:
            return account_response(error)

    @app.post("/api/account/chats/{character_id}")
    async def post_chats(character_id: str, request: Request):
        try:
            if character_id not in CREW_IDS:
                raise AccountError("invalid_character", 404)
            user = await backend.verify(request)
            payload = await read_body(request)
            await upsert_chats(user, {character_id: payload.get("messages")})
            return {"saved": True}
        except AccountError as error:
            return account_response(error)

    @app.delete("/api/account/chats/{character_id}")
    async def delete_chats(character_id: str, request: Request):
        try:
            if character_id not in CREW_IDS:
                raise AccountError("invalid_character", 404)
            user = await backend.verify(request)
            await backend.rest("DELETE", f"chat_messages?user_id=eq.{quote(user.user_id)}&character_id=eq.{character_id}", user, headers={"Prefer": "return=minimal"})
            return {"deleted": True}
        except AccountError as error:
            return account_response(error)

    @app.get("/api/account/export")
    async def export_account(request: Request):
        try:
            user = await backend.verify(request)
            return {"exportedAt": datetime.now(timezone.utc).isoformat(), "snapshot": await backend.snapshot(user)}
        except AccountError as error:
            return account_response(error)

    @app.put("/api/account/avatar")
    async def put_avatar(request: Request):
        try:
            user = await backend.verify(request)
            if not backend.service_key:
                raise AccountError("avatar_service_unavailable", 503)
            payload = await read_body(request)
            match = DATA_URL_PATTERN.fullmatch(str(payload.get("dataUrl", "")))
            if not match:
                raise AccountError("invalid_avatar", 400)
            content_type, encoded = match.groups()
            raw = base64.b64decode(encoded, validate=True)
            if not raw or len(raw) > 1_000_000:
                raise AccountError("invalid_avatar", 400)
            extension = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[content_type]
            path = f"{user.user_id}/profile.{extension}"
            status, _, _ = await backend.request(
                "POST",
                f"/storage/v1/object/avatars/{quote(path)}",
                service=True,
                body=raw,
                content_type=content_type,
                extra_headers={"x-upsert": "true"},
            )
            if status >= 400:
                raise AccountError("avatar_upload_failed", 503)
            await backend.rest("PATCH", f"profiles?user_id=eq.{quote(user.user_id)}", user, {"avatar_path": path}, {"Prefer": "return=minimal"})
            return {"path": path}
        except (ValueError, AccountError) as error:
            return account_response(error if isinstance(error, AccountError) else AccountError("invalid_avatar", 400))

    @app.get("/api/account/avatar")
    async def get_avatar(request: Request):
        try:
            user = await backend.verify(request)
            profile_rows = await backend.rest("GET", f"profiles?user_id=eq.{quote(user.user_id)}&select=avatar_path", user)
            path = profile_rows[0].get("avatar_path") if profile_rows else None
            if not path:
                raise AccountError("avatar_not_found", 404)
            status, data, headers = await backend.request("GET", f"/storage/v1/object/authenticated/avatars/{quote(path)}", token=user.token)
            if status >= 400 or not isinstance(data, bytes):
                raise AccountError("avatar_not_found", 404)
            return Response(data, media_type=headers.get("Content-Type", "image/webp"), headers={"Cache-Control": "private, max-age=300"})
        except AccountError as error:
            return account_response(error)

    @app.delete("/api/account")
    async def delete_account(request: Request):
        try:
            user = await backend.verify(request)
            issued_at = _bounded_int(user.claims.get("auth_time", user.claims.get("iat")), 0, 4_102_444_800, 0)
            if datetime.now(timezone.utc).timestamp() - issued_at > 10 * 60:
                raise AccountError("recent_authentication_required", 401)
            if not backend.service_key:
                raise AccountError("account_deletion_unavailable", 503)
            profile_rows = await backend.rest("GET", f"profiles?user_id=eq.{quote(user.user_id)}&select=avatar_path", user)
            avatar_path = profile_rows[0].get("avatar_path") if profile_rows else None
            if avatar_path:
                await backend.request("DELETE", "/storage/v1/object/avatars", service=True, body={"prefixes": [avatar_path]})
            status, _, _ = await backend.request("DELETE", f"/auth/v1/admin/users/{quote(user.user_id)}", service=True)
            if status >= 400:
                raise AccountError("account_deletion_failed", 503)
            return {"deleted": True}
        except AccountError as error:
            return account_response(error)
