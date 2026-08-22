import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function startApp(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (extraEnv.OPENAI_API_KEY === undefined) delete env.OPENAI_API_KEY;
  const child = spawn("./scripts/serve", ["--port", "0", "--quiet"], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`app start timeout: ${output}`)), 10_000);
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
    child.once("exit", (code) => reject(new Error(`app exited ${code}: ${output}`)));
  });
  return { child, baseUrl };
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function startRealtimeUpstream() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({
        path: request.url,
        authorization: request.headers.authorization,
        safetyIdentifier: request.headers["openai-safety-identifier"],
        body: JSON.parse(body),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ value: "ek_test_short_lived", expires_at: 999_999 }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, requests, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

function secretRequest(baseUrl, payload, origin = baseUrl) {
  return fetch(`${baseUrl}/api/realtime/client-secret`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
}

test("Realtime 시크릿은 동일 출처·짧은 수명·서버 전용 영구 키를 지킨다", async () => {
  const upstream = await startRealtimeUpstream();
  const app = await startApp({
    OPENAI_API_KEY: "server-only-test-key",
    OPENAI_REALTIME_API_BASE: upstream.baseUrl,
    OPENAI_REALTIME_MODEL: "gpt-realtime-2.1-mini",
    OPENAI_TRANSCRIBE_MODEL: "gpt-live-transcribe",
    OPENAI_SAFETY_SALT: "test-salt",
  });
  try {
    const transcription = await secretRequest(app.baseUrl, { purpose: "transcription", locale: "ko" });
    assert.equal(transcription.status, 200);
    const transcriptionBody = await transcription.json();
    assert.deepEqual(transcriptionBody, {
      value: "ek_test_short_lived",
      expiresAt: 999_999,
      purpose: "transcription",
      speakerId: null,
      model: "gpt-live-transcribe",
    });
    assert.doesNotMatch(JSON.stringify(transcriptionBody), /server-only-test-key|instructions|prompt/i);

    const speech = await secretRequest(app.baseUrl, { purpose: "speech", locale: "en", speakerId: "juno" });
    assert.equal(speech.status, 200);
    const speechBody = await speech.json();
    assert.equal(speechBody.model, "gpt-realtime-2.1-mini");
    assert.equal(speechBody.speakerId, "juno");

    assert.equal(upstream.requests.length, 2);
    assert.equal(upstream.requests[0].path, "/v1/realtime/client_secrets");
    assert.equal(upstream.requests[0].authorization, "Bearer server-only-test-key");
    assert.equal(typeof upstream.requests[0].safetyIdentifier, "string");
    assert.equal(upstream.requests[0].safetyIdentifier.length, 64);
    assert.equal(upstream.requests[0].body.expires_after.seconds, 300);
    assert.equal(upstream.requests[0].body.session.type, "transcription");
    assert.equal(upstream.requests[0].body.session.audio.input.transcription.model, "gpt-live-transcribe");
    assert.equal(upstream.requests[0].body.session.audio.input.transcription.delay, "low");
    assert.equal(upstream.requests[0].body.session.audio.input.turn_detection, null);
    assert.equal(upstream.requests[1].body.session.audio.output.voice, "cedar");

    const blocked = await secretRequest(app.baseUrl, { purpose: "speech", locale: "ko", speakerId: "mina" }, "https://evil.example");
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: "origin_not_allowed" });

    const page = await fetch(`${app.baseUrl}/`);
    assert.match(page.headers.get("permissions-policy"), /microphone=\(self\)/);
    assert.match(page.headers.get("content-security-policy"), /connect-src 'self' https:\/\/api\.openai\.com/);
  } finally {
    await stopApp(app.child);
    upstream.server.close();
    await once(upstream.server, "close");
  }
});

test("Realtime 엔드포인트는 키 없음·잘못된 화자·호출 상한을 안전하게 처리한다", async () => {
  const noKey = await startApp();
  try {
    const unavailable = await secretRequest(noKey.baseUrl, { purpose: "transcription", locale: "ko" });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "voice_unavailable" });
    const invalidSpeaker = await secretRequest(noKey.baseUrl, { purpose: "speech", locale: "ko", speakerId: "player" });
    assert.equal(invalidSpeaker.status, 400);
    const unauthenticatedFriendCall = await secretRequest(noKey.baseUrl, {
      purpose: "friend-call",
      locale: "ko",
      speakerId: "mina",
      timezoneOffsetMinutes: -540,
    });
    assert.equal(unauthenticatedFriendCall.status, 503);
    assert.deepEqual(await unauthenticatedFriendCall.json(), { error: "account_service_unavailable" });
  } finally {
    await stopApp(noKey.child);
  }

  const upstream = await startRealtimeUpstream();
  const limited = await startApp({
    OPENAI_API_KEY: "server-only-test-key",
    OPENAI_REALTIME_API_BASE: upstream.baseUrl,
  });
  try {
    for (let index = 0; index < 4; index += 1) {
      const response = await secretRequest(limited.baseUrl, { purpose: "transcription", locale: "ko" });
      assert.equal(response.status, 200);
    }
    const rateLimited = await secretRequest(limited.baseUrl, { purpose: "transcription", locale: "ko" });
    assert.equal(rateLimited.status, 429);
    assert.deepEqual(await rateLimited.json(), { error: "rate_limited" });
  } finally {
    await stopApp(limited.child);
    upstream.server.close();
    await once(upstream.server, "close");
  }
});
