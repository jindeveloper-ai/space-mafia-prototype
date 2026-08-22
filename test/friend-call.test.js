import assert from "node:assert/strict";
import test from "node:test";

import { createFriendCallController } from "../friend-call.js";

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  emit(type, value = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(value);
  }
}

class FakeChannel extends FakeTarget {
  constructor() { super(); this.readyState = "open"; this.sent = []; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = "closed"; }
}

class FakePeerConnection {
  static instances = [];
  constructor() {
    this.channel = new FakeChannel();
    FakePeerConnection.instances.push(this);
  }
  createDataChannel() { return this.channel; }
  addTrack(track) { this.track = track; }
  async createOffer() { return { type: "offer", sdp: "offer" }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  close() { this.closed = true; }
}

class FakeAudio {
  async play() {}
  pause() {}
  remove() {}
}

function createHarness({ remainingSeconds = 300 } = {}) {
  FakePeerConnection.instances = [];
  const intervals = new Map();
  let timerId = 0;
  const usage = [];
  const ended = [];
  const requests = [];
  const track = { enabled: true, stop() { this.stopped = true; } };
  const controller = createFriendCallController({
    characterId: "mina",
    locale: "ko",
    remainingSeconds,
    PeerConnection: FakePeerConnection,
    AudioElement: FakeAudio,
    AudioContextClass: null,
    mediaDevices: { async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; } },
    async requestSecret(payload) {
      requests.push(payload);
      return { value: "ek_test", remainingSeconds, dateKey: "2050-04-01" };
    },
    async fetchImpl() { return { ok: true, text: async () => "answer" }; },
    setTimer(handler) { queueMicrotask(handler); return ++timerId; },
    clearTimer() {},
    setRepeating(handler) { const id = ++timerId; intervals.set(id, handler); return id; },
    clearRepeating(id) { intervals.delete(id); },
    onUsage(value) { usage.push(value); },
    onEnded(value) { ended.push(value); },
  });
  return {
    controller,
    ended,
    requests,
    track,
    usage,
    tick() { for (const handler of [...intervals.values()]) handler(); },
  };
}

test("개인 보이스톡은 한 Realtime 세션에서 전화 인사와 연속 대화를 시작한다", async () => {
  const harness = createHarness();
  assert.equal(await harness.controller.start(), true);
  assert.deepEqual(harness.requests[0], {
    purpose: "friend-call",
    locale: "ko",
    speakerId: "mina",
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
  const channel = FakePeerConnection.instances[0].channel;
  assert.equal(channel.sent[0].type, "response.create");
  assert.match(channel.sent[0].response.instructions, /여보세요\?/);

  channel.emit("message", { data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  assert.equal(harness.controller.snapshot().phase, "player_speaking");
  channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.started" }) });
  assert.equal(harness.controller.snapshot().phase, "ai_speaking");
  channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.stopped" }) });
  assert.equal(harness.controller.snapshot().phase, "listening");

  assert.equal(harness.controller.sendText("어제 판 얘기해줘"), true);
  assert.deepEqual(channel.sent.slice(-2).map((item) => item.type), ["conversation.item.create", "response.create"]);
});

test("통화 시간은 연결 뒤에만 차감되고 종료·음소거가 안전하게 정리된다", async () => {
  const harness = createHarness({ remainingSeconds: 6 });
  assert.equal(await harness.controller.start(), true);
  harness.tick();
  harness.tick();
  assert.equal(harness.controller.snapshot().remainingSeconds, 4);
  assert.equal(harness.controller.setMuted(true), true);
  assert.equal(harness.track.enabled, false);
  harness.controller.end();
  assert.deepEqual(harness.usage, [{ characterId: "mina", dateKey: "2050-04-01", seconds: 2 }]);
  assert.equal(harness.track.stopped, true);
  assert.equal(harness.ended.length, 1);
});

test("남은 시간이 끝나면 하루 제한으로 자동 종료한다", async () => {
  const harness = createHarness({ remainingSeconds: 2 });
  assert.equal(await harness.controller.start(), true);
  harness.tick();
  harness.tick();
  assert.equal(harness.controller.snapshot().remainingSeconds, 0);
  assert.equal(harness.ended[0].reason, "daily_limit");
  assert.equal(harness.usage[0].seconds, 2);
});
