import test from "node:test";
import assert from "node:assert/strict";

import {
  buildChatPayload,
  fallbackAccusation,
  fallbackResponse,
  normalizeInterpretation,
} from "../chat-adapter.js";
import { createGame, getCrew, getIncident, plantEvidence, startGame } from "../game-engine.js";

function preparedState(locale = "ko") {
  return plantEvidence(startGame(createGame({ caseIndex: 0, subquestId: "redirect", locale })), "mina");
}

test("자유 문장에서 한국어·영어 지목과 주장 방식을 복구한다", () => {
  const koState = preparedState("ko");
  const koCrew = getCrew("ko");
  assert.deepEqual(fallbackAccusation("노엘이 정화기 만지는 거 봤음", koState, koCrew), {
    accusedId: "noel",
    claimId: "machine",
  });

  const enState = preparedState("en");
  const enCrew = getCrew("en");
  assert.deepEqual(fallbackAccusation("Juno changed the time in his story", enState, enCrew), {
    accusedId: "juno",
    claimId: "changed",
  });
});

test("반박 자유 문장을 세 전략 중 하나로 복구한다", () => {
  assert.deepEqual(fallbackResponse("22:10 로그부터 다시 보자"), { responseId: "check-time" });
  assert.deepEqual(fallbackResponse("카드가 사물함에서 나왔잖아"), { responseId: "return-evidence" });
  assert.deepEqual(fallbackResponse("내가 직접 봤다니까"), { responseId: "double-down" });
});

test("모델 판정값이 잘못돼도 허용된 엔진 ID로 정규화한다", () => {
  const state = preparedState("ko");
  const crew = getCrew("ko");
  const result = normalizeInterpretation(
    "accusation",
    { accusedId: "intruder", claimId: "invented" },
    "미나가 시간을 바꿨어",
    state,
    crew,
  );
  assert.deepEqual(result, { accusedId: "mina", claimId: "changed" });

  const explicit = normalizeInterpretation(
    "accusation",
    { accusedId: "juno", claimId: "seen" },
    "노엘이 정화기를 만지는 걸 직접 봤음",
    state,
    crew,
  );
  assert.deepEqual(explicit, { accusedId: "noel", claimId: "machine" });
});

test("서버 payload는 공개 상태와 최근 대화 12개만 포함한다", () => {
  const state = preparedState("ko");
  const crew = getCrew("ko");
  const transcript = Array.from({ length: 15 }, (_, index) => ({ speakerId: "player", text: `message ${index}` }));
  const payload = buildChatPayload({
    locale: "ko",
    stage: "accusation",
    message: "노엘이 수상함",
    state,
    crew,
    incident: getIncident("ko"),
    transcript,
  });

  assert.equal(payload.transcript.length, 12);
  assert.equal(payload.transcript[0].text, "message 3");
  assert.deepEqual(payload.crew.map((member) => member.id), ["mina", "juno", "noel"]);
  assert.equal(payload.targetId, "mina");
  assert.deepEqual(payload.round, { caseIndex: 0, subquestId: "redirect", turn: 15 });
});

test("친구 채팅 payload는 선택한 캐릭터와 대화 차수를 전달한다", () => {
  const state = preparedState("ko");
  const transcript = [
    { speakerId: "juno", text: "왔네." },
    { speakerId: "player", text: "오늘 뭐함?" },
  ];
  const payload = buildChatPayload({
    locale: "ko",
    stage: "friend",
    message: "오늘 뭐함?",
    state,
    crew: getCrew("ko"),
    incident: getIncident("ko"),
    transcript,
    friendId: "juno",
  });

  assert.equal(payload.friendId, "juno");
  assert.equal(payload.round.turn, 1);
});
