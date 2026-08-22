import test from "node:test";
import assert from "node:assert/strict";

import {
  beginVoiceTurnFinalization,
  createVoiceTurn,
  expireVoiceTurn,
  recordVoiceTurnCandidate,
  voiceTurnSecondsLeft,
} from "../voice-turn.js";

test("보이스 토론은 제한 시간 동안 여러 발언을 받고 마지막 명확한 입장을 남긴다", () => {
  let turn = createVoiceTurn({ stage: "accusation", phase: "lie", now: 1_000 });
  assert.equal(voiceTurnSecondsLeft(turn, 1_000), 40);

  turn = recordVoiceTurnCandidate(turn, {
    message: "미나가 수상해",
    utteranceId: "u1",
    interpretation: { accusedId: "mina", claimId: "changed" },
  });
  turn = recordVoiceTurnCandidate(turn, {
    message: "아니, 최종은 노엘. 공구가 있었어",
    utteranceId: "u2",
    interpretation: { accusedId: "noel", claimId: "machine" },
  });

  assert.equal(turn.playerTurns, 2);
  assert.deepEqual(turn.candidate.interpretation, { accusedId: "noel", claimId: "machine" });
  assert.equal(voiceTurnSecondsLeft(turn, 41_000), 0);
});

test("모든 보이스 토론 단계는 40초 안에서 여러 번 주고받는다", () => {
  for (const stage of ["accusation", "response", "hard-response", "hard-final"]) {
    const turn = createVoiceTurn({ stage, phase: `phase-${stage}`, now: 5_000 });
    assert.equal(turn.durationSeconds, 40);
    assert.equal(voiceTurnSecondsLeft(turn, 44_999), 1);
  }
});

test("시간이 끝난 보이스 턴은 추가 후보를 받지 않고 한 번만 마감된다", () => {
  const active = createVoiceTurn({ stage: "response", phase: "challenge", now: 0, durationSeconds: 10 });
  const expired = expireVoiceTurn(active);
  const unchanged = recordVoiceTurnCandidate(expired, {
    message: "기록 보자",
    interpretation: { responseId: "check-time" },
  });
  assert.strictEqual(unchanged, expired);

  const finalizing = beginVoiceTurnFinalization(expired);
  assert.equal(finalizing.expired, true);
  assert.equal(finalizing.finalizing, true);
});
