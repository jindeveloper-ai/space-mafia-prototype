import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const projectRoot = new URL("../", import.meta.url);

async function startServer() {
  const child = spawn("./scripts/serve", ["--port", "0", "--quiet"], {
    cwd: projectRoot,
    env: { ...process.env, OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server start timeout: ${output}`)), 10_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Serving .* at (http:\/\/[^/]+:\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => reject(new Error(`server exited ${code}: ${output}`)));
  });
  return { child, baseUrl };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function openRoomSocket(baseUrl, code, token) {
  const url = `${baseUrl.replace("http", "ws")}/ws/rooms/${code}`;
  const socket = new WebSocket(url);
  const snapshots = [];
  const waiters = [];
  const notify = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const match = [...snapshots].reverse().find(waiter.predicate);
      if (match) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timeout);
        waiter.resolve(match);
      }
    }
  };
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(event.data);
    if (value.type === "ping") return socket.send(JSON.stringify({ type: "pong" }));
    if (value.type === "snapshot") {
      snapshots.push(value.snapshot);
      notify();
    }
  });
  const ready = once(socket, "open").then(() => socket.send(JSON.stringify({ type: "authenticate", token, lastSeq: 0 })));
  const waitFor = (predicate, timeoutMs = 7_000) => new Promise((resolve, reject) => {
    const existing = [...snapshots].reverse().find(predicate);
    if (existing) return resolve(existing);
    const waiter = { predicate, resolve, timeout: setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error("snapshot wait timeout"));
    }, timeoutMs) };
    waiters.push(waiter);
  });
  return { socket, ready, waitFor, latest: () => snapshots.at(-1) };
}

function actionBody(snapshot, action, extra = {}) {
  return JSON.stringify({ action, actionId: crypto.randomUUID(), expectedSeq: snapshot.eventSeq, ...extra });
}

async function refresh(baseUrl, room, token) {
  return jsonRequest(baseUrl, `/api/rooms/${room}/snapshot`, { headers: { "x-participant-token": token } });
}

async function postAction(baseUrl, room, token, snapshot, action, extra = {}) {
  return jsonRequest(baseUrl, `/api/rooms/${room}/actions`, {
    method: "POST",
    headers: { "x-participant-token": token },
    body: actionBody(snapshot, action, extra),
  });
}

test("두 실제 플레이어가 비밀 역할·채팅·투표·재연결·역할 교대까지 완료한다", { timeout: 30_000 }, async () => {
  const { child, baseUrl } = await startServer();
  const sockets = [];
  try {
    const host = await jsonRequest(baseUrl, "/api/rooms", { method: "POST", body: JSON.stringify({ name: "Host", avatarId: "astronaut-purple", locale: "ko" }) });
    const guest = await jsonRequest(baseUrl, `/api/rooms/${host.code}/join`, { method: "POST", body: JSON.stringify({ name: "Guest", avatarId: "astronaut-green" }) });
    const hostWs = openRoomSocket(baseUrl, host.code, host.token);
    const guestWs = openRoomSocket(baseUrl, host.code, guest.token);
    sockets.push(hostWs.socket, guestWs.socket);
    await Promise.all([hostWs.ready, guestWs.ready]);
    await Promise.all([hostWs.waitFor((value) => value.players.every((player) => player.connected)), guestWs.waitFor((value) => value.players.every((player) => player.connected))]);

    let hostView = await refresh(baseUrl, host.code, host.token);
    await jsonRequest(baseUrl, `/api/rooms/${host.code}/ready`, { method: "POST", headers: { "x-participant-token": host.token }, body: JSON.stringify({ ready: true, actionId: crypto.randomUUID(), expectedSeq: hostView.eventSeq }) });
    let guestView = await refresh(baseUrl, host.code, guest.token);
    await jsonRequest(baseUrl, `/api/rooms/${host.code}/ready`, { method: "POST", headers: { "x-participant-token": guest.token }, body: JSON.stringify({ ready: true, actionId: crypto.randomUUID(), expectedSeq: guestView.eventSeq }) });
    [hostView, guestView] = await Promise.all([refresh(baseUrl, host.code, host.token), refresh(baseUrl, host.code, guest.token)]);
    assert.equal(hostView.phase, "role");
    assert.deepEqual(new Set([hostView.self.role, guestView.self.role]), new Set(["mafia", "citizen"]));
    assert.ok(hostView.players.every((player) => !("role" in player)));

    await postAction(baseUrl, host.code, host.token, hostView, "ack_role");
    guestView = await refresh(baseUrl, host.code, guest.token);
    await postAction(baseUrl, host.code, guest.token, guestView, "ack_role");
    [hostView, guestView] = await Promise.all([refresh(baseUrl, host.code, host.token), refresh(baseUrl, host.code, guest.token)]);
    const mafia = hostView.self.role === "mafia" ? { token: host.token, view: hostView } : { token: guest.token, view: guestView };
    const citizen = hostView.self.role === "citizen" ? { token: host.token, view: hostView } : { token: guest.token, view: guestView };
    assert.equal(mafia.view.privateAction.type, "plant_evidence");
    assert.equal(citizen.view.privateAction, undefined);
    const plantTarget = mafia.view.privateAction.candidateIds[0];
    await postAction(baseUrl, host.code, mafia.token, mafia.view, "plant_evidence", { targetId: plantTarget });

    hostView = await refresh(baseUrl, host.code, host.token);
    await postAction(baseUrl, host.code, host.token, hostView, "ack_facts");
    guestView = await refresh(baseUrl, host.code, guest.token);
    await postAction(baseUrl, host.code, guest.token, guestView, "ack_facts");
    [hostView, guestView] = await Promise.all([refresh(baseUrl, host.code, host.token), refresh(baseUrl, host.code, guest.token)]);
    const mafiaSocket = hostView.self.role === "mafia" ? hostWs : guestWs;
    const chatView = hostView.self.role === "mafia" ? hostView : guestView;
    const accused = chatView.characters[0];
    const humanMessage = `${accused.name}가 시간을 바꿔 말했어`;
    const before = performance.now();
    mafiaSocket.socket.send(JSON.stringify({ type: "action", action: "chat", message: humanMessage, actionId: crypto.randomUUID(), expectedSeq: chatView.eventSeq }));
    const immediate = await mafiaSocket.waitFor((value) => value.transcript.some((item) => item.kind === "human" && item.text === humanMessage));
    assert.ok(performance.now() - before < 1_000, "human message should broadcast before AI generation");
    const messageId = immediate.transcript.find((item) => item.kind === "human" && item.text === humanMessage).id;
    const replied = await mafiaSocket.waitFor((value) => value.transcript.filter((item) => item.replyTo === messageId).length === 2);
    assert.equal(replied.transcript.filter((item) => item.replyTo === messageId).length, 2);
    assert.ok(replied.claims.some((claim) => claim.speakerId === replied.self.id && claim.targetId === accused.id));

    const citizenView = await refresh(baseUrl, host.code, citizen.token);
    assert.equal(citizenView.self.canVote, true);
    const mafiaId = citizenView.players.find((player) => player.id !== citizenView.self.id).id;
    const resultView = await postAction(baseUrl, host.code, citizen.token, citizenView, "vote", { targetId: mafiaId });
    assert.equal(resultView.phase, "result");
    assert.equal(resultView.result.votes.length, 3);
    assert.ok(resultView.result.votes.some((vote) => vote.voterId === citizenView.self.id && vote.candidateId === mafiaId));
    const otherResult = await refresh(baseUrl, host.code, mafia.token);
    assert.deepEqual(otherResult.result, resultView.result);

    const firstMafiaId = resultView.result.roles.find((item) => item.role === "mafia").participantId;
    hostView = await refresh(baseUrl, host.code, host.token);
    await postAction(baseUrl, host.code, host.token, hostView, "rematch");
    guestView = await refresh(baseUrl, host.code, guest.token);
    const rematch = await postAction(baseUrl, host.code, guest.token, guestView, "rematch");
    assert.equal(rematch.roundNumber, 2);
    assert.equal(rematch.result, null);
    const secondHost = await refresh(baseUrl, host.code, host.token);
    const secondGuest = await refresh(baseUrl, host.code, guest.token);
    const secondMafiaId = secondHost.self.role === "mafia" ? secondHost.self.id : secondGuest.self.id;
    assert.notEqual(secondMafiaId, firstMafiaId);

    hostWs.socket.close();
    await guestWs.waitFor((value) => value.players.some((player) => player.id === host.playerId && !player.connected));
    const restoredHostWs = openRoomSocket(baseUrl, host.code, host.token);
    sockets.push(restoredHostWs.socket);
    await restoredHostWs.ready;
    const restored = await restoredHostWs.waitFor((value) => value.players.some((player) => player.id === host.playerId && player.connected));
    assert.equal(restored.roundNumber, 2);
  } finally {
    sockets.forEach((socket) => socket.close());
    await stopServer(child);
  }
});
