import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function waitForAddress(server) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 5000);
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup with code ${code}`));
    });
  });
}

async function startPrototype(extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (extraEnv.OPENAI_API_KEY === undefined) delete env.OPENAI_API_KEY;
  const server = spawn("python3", ["scripts/serve.py", "--port", "0", "--quiet"], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { server, baseUrl: await waitForAddress(server) };
}

async function stopProcess(process) {
  process.kill("SIGTERM");
  if (process.exitCode === null) await once(process, "exit");
}

function chatPayload(stage = "accusation") {
  const payload = {
    locale: "ko",
    stage,
    message: stage === "accusation" ? "노엘이 정화기를 만지는 걸 봤음" : "22:10 기록부터 다시 보자",
    crew: [
      { id: "mina", name: "미나", style: "기록형", personality: "record", fact: { id: "alibi", text: "미나는 조종실 카메라에 찍혔다." } },
      { id: "juno", name: "주노", style: "검증형", personality: "skeptic", fact: { id: "access", text: "주노에게 산소실 공구가 있다." } },
      { id: "noel", name: "노엘", style: "반응형", personality: "behavior", fact: { id: "contradiction", text: "노엘은 시간을 바꿔 말했다." } },
    ],
    incident: { place: "산소실", time: "22:10", confirmed: "안전장치 고장", evidence: "망가진 출입카드" },
    targetId: "mina",
    accusedId: stage === "response" ? "noel" : null,
    claimId: stage === "response" ? "machine" : null,
    challengeText: stage === "response" ? "그게 증거임?" : "",
    friendId: stage === "friend" ? "juno" : null,
    round: { caseIndex: 2, subquestId: "redirect", turn: 1 },
    transcript: [{ speakerId: "player", text: "노엘이 수상함" }],
  };
  if (stage === "debrief") {
    payload.debrief = {
      outcome: "win",
      targetId: "mina",
      accusedId: "noel",
      claimId: "machine",
      responseId: "check-time",
      selectedId: "noel",
      voteShiftCount: 2,
      votes: [
        { voterId: "mina", candidateId: "noel" },
        { voterId: "juno", candidateId: "noel" },
        { voterId: "noel", candidateId: "mina" },
      ],
      personalQuest: {
        questId: "mina-shift",
        characterId: "mina",
        success: true,
        affinityDelta: 3,
      },
    };
  }
  return payload;
}

test("API 키가 없으면 비밀을 요구하지 않고 mock 전환 신호를 보낸다", async () => {
  const { server, baseUrl } = await startPrototype();
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload()),
    });
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(await response.json(), { error: "ai_unavailable", mode: "mock" });
  } finally {
    await stopProcess(server);
  }
});

test("1:1 친구 채팅은 선택한 캐릭터 모델만 한 번 호출한다", async () => {
  const requests = [];
  const upstream = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message: "ㅇㅋ 오늘은 좀 한가함. 너는?" }) }] }],
      }));
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamPort = upstream.address().port;
  const { server, baseUrl } = await startPrototype({
    OPENAI_API_KEY: "test-only-key",
    OPENAI_API_BASE: `http://127.0.0.1:${upstreamPort}/v1`,
  });

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload("friend")),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.replies, [{ speakerId: "juno", message: "ㅇㅋ 오늘은 좀 한가함. 너는?" }]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].text.format.name, "friend_reply_juno");
  } finally {
    await stopProcess(server);
    upstream.close();
    await once(upstream, "close");
  }
});

test("직전 판 회상은 검증된 결과만 전달해 모델을 한 번 호출한다", async () => {
  const requests = [];
  const upstream = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              replies: [
                { speakerId: "mina", message: "노엘로 표 바뀐 거 캡처해둠 ㅋㅋ" },
                { speakerId: "juno", message: "그래도 반대 가설은 다음 판에 보자." },
                { speakerId: "noel", message: "둘이 내 반응 보는 순간 이미 끝났더라." },
              ],
            }),
          }],
        }],
      }));
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamPort = upstream.address().port;
  const { server, baseUrl } = await startPrototype({
    OPENAI_API_KEY: "test-only-key",
    OPENAI_API_BASE: `http://127.0.0.1:${upstreamPort}/v1`,
  });

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload("debrief")),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.mode, "live");
    assert.deepEqual(result.replies.map((reply) => reply.speakerId), ["mina", "juno", "noel"]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].text.format.name, "post_game_debrief");
    assert.equal(requests[0].store, false);

    const modelContext = JSON.parse(requests[0].input[1].content);
    assert.deepEqual(modelContext.result, chatPayload("debrief").debrief);
    assert.ok(["characters", "incident", "result", "world"].every((key) => key in modelContext || key === "world"));
    assert.ok(Object.keys(modelContext).every((key) => ["characters", "incident", "result", "world"].includes(key)));
    assert.ok(!("transcript" in modelContext), "직전 판 회상 요청에는 과거 자유 채팅을 재전송하지 않습니다.");
    assert.match(`${requests[0].input[0].content}\n${modelContext.world ?? ""}`, /2050.*Mars.*MARS\.NET/is);
  } finally {
    await stopProcess(server);
    upstream.close();
    await once(upstream, "close");
  }
});

test("잘못된 chat payload는 모델 호출 전에 거절한다", async () => {
  const { server, baseUrl } = await startPrototype();
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "ko", stage: "accusation", message: "" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request", mode: "mock" });

    const missingFriend = chatPayload("friend");
    missingFriend.friendId = null;
    const friendResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(missingFriend),
    });
    assert.equal(friendResponse.status, 400);

    const invalidDebrief = chatPayload("debrief");
    invalidDebrief.debrief.votes[0].candidateId = "unknown";
    const debriefResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidDebrief),
    });
    assert.equal(debriefResponse.status, 400);

    const invalidQuest = chatPayload("debrief");
    invalidQuest.debrief.personalQuest.affinityDelta = 1;
    const questResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidQuest),
    });
    assert.equal(questResponse.status, 400);
  } finally {
    await stopProcess(server);
  }
});

test("Luna 구조화 판정 뒤 세 캐릭터를 격리된 요청으로 병렬 호출한다", async () => {
  const requests = [];
  const upstream = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const schemaName = parsed.text.format.name;
      const output = schemaName === "mafia_accusation"
        ? { accusedId: "noel", claimId: "machine" }
        : {
            message: `${schemaName} reply`,
            intent: "observe",
            suspectId: "noel",
          };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
      }));
    });
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const upstreamPort = upstream.address().port;
  const { server, baseUrl } = await startPrototype({
    OPENAI_API_KEY: "test-only-key",
    OPENAI_API_BASE: `http://127.0.0.1:${upstreamPort}/v1`,
    OPENAI_MODEL: "gpt-5.6-luna",
  });

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload()),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.mode, "live");
    assert.deepEqual(result.interpretation, { accusedId: "noel", claimId: "machine" });
    assert.deepEqual(result.replies.map((reply) => reply.speakerId).sort(), ["juno", "mina", "noel"]);
    assert.equal(requests.length, 4);
    assert.ok(requests.every((item) => item.model === "gpt-5.6-luna" && item.store === false));
    assert.ok(requests.every((item) => item.text.format.type === "json_schema"));
    assert.deepEqual(
      requests.map((item) => item.text.format.name).sort(),
      ["mafia_accusation", "reply_juno", "reply_mina", "reply_noel"],
    );
  } finally {
    await stopProcess(server);
    upstream.close();
    await once(upstream, "close");
  }
});
