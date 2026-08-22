import test from "node:test";
import assert from "node:assert/strict";

import {
  VOICE_STATES,
  createFinalTranscriptGate,
  createSpeakerQueue,
  createVoiceMetrics,
  createVoiceStateMachine,
  estimateVoiceCost,
  recordSessionEnded,
  recordSessionStarted,
} from "../voice-call-core.js";

test("보이스콜 상태 머신은 명시된 상태만 허용한다", () => {
  const changes = [];
  const machine = createVoiceStateMachine((change) => changes.push(change));

  for (const state of VOICE_STATES.slice(1)) machine.transition(state);

  assert.deepEqual(changes.map((change) => change.state), VOICE_STATES.slice(1));
  assert.throws(() => machine.transition("invented"), /Unknown voice state/);
});

test("중간 자막은 판정하지 않고 확정 발화 ID는 한 번만 직렬 처리한다", async () => {
  const received = [];
  const gate = createFinalTranscriptGate(async (utterance) => {
    received.push(utterance);
  });

  assert.equal(gate.accept({ id: "", text: "중간 자막" }), false);
  assert.equal(gate.accept({ id: "utterance-1", text: "미나를 의심해" }), true);
  assert.equal(gate.accept({ id: "utterance-1", text: "중복 재전송" }), false);
  assert.equal(gate.accept({ id: "utterance-2", text: "기록부터 확인하자" }), true);
  await gate.whenIdle();

  assert.deepEqual(received, [
    { id: "utterance-1", text: "미나를 의심해" },
    { id: "utterance-2", text: "기록부터 확인하자" },
  ]);
});

test("캐릭터 발화 큐는 FIFO로 한 명씩 처리하고 대기 발화를 중단한다", async () => {
  const order = [];
  let releaseFirst;
  const queue = createSpeakerQueue(async (item) => {
    order.push(`start:${item}`);
    if (item === "mina") await new Promise((resolve) => { releaseFirst = resolve; });
    order.push(`end:${item}`);
    return { completed: true };
  });

  const mina = queue.enqueue("mina");
  const juno = queue.enqueue("juno");
  const noel = queue.enqueue("noel");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["start:mina"]);
  assert.equal(queue.size, 3);

  queue.interrupt("barge_in");
  releaseFirst();
  assert.deepEqual(await juno, { completed: false, reason: "barge_in" });
  assert.deepEqual(await noel, { completed: false, reason: "barge_in" });
  assert.deepEqual(await mina, { completed: true });
  assert.deepEqual(order, ["start:mina", "end:mina"]);
});

test("비용 계측은 동시 세션 상한과 실제 음성 사용량만 합산한다", () => {
  const metrics = createVoiceMetrics();
  recordSessionStarted(metrics, "transcription", 1_000);
  recordSessionStarted(metrics, "speech", 1_100);
  recordSessionEnded(metrics, "speech", 2_000);
  recordSessionEnded(metrics, "transcription", 61_000);
  metrics.inputAudioTokens = 1_000;
  metrics.outputAudioTokens = 2_000;

  assert.equal(metrics.maxConcurrentSessions, 2);
  assert.equal(metrics.transcriptionSeconds, 60);
  assert.equal(estimateVoiceCost(metrics), 0.067);
});
