import assert from "node:assert/strict";
import test from "node:test";

import { createFriendCallController, friendCallOpeningLine } from "../friend-call.js";

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

function createHarness({ remainingSeconds = 300, locale = "ko", mediaDevices = null, setTimer = null } = {}) {
  FakePeerConnection.instances = [];
  const intervals = new Map();
  let timerId = 0;
  const usage = [];
  const ended = [];
  const fallbacks = [];
  const requests = [];
  const track = { enabled: true, stop() { this.stopped = true; } };
  const controller = createFriendCallController({
    characterId: "mina",
    locale,
    remainingSeconds,
    PeerConnection: FakePeerConnection,
    AudioElement: FakeAudio,
    AudioContextClass: null,
    mediaDevices: mediaDevices ?? { async getUserMedia() { return { getAudioTracks: () => [track], getTracks: () => [track] }; } },
    async requestSecret(payload) {
      requests.push(payload);
      return { value: "ek_test", remainingSeconds, dateKey: "2050-04-01" };
    },
    async fetchImpl() { return { ok: true, text: async () => "answer" }; },
    setTimer: setTimer ?? ((handler) => { queueMicrotask(handler); return ++timerId; }),
    clearTimer() {},
    setRepeating(handler) { const id = ++timerId; intervals.set(id, handler); return id; },
    clearRepeating(id) { intervals.delete(id); },
    onUsage(value) { usage.push(value); },
    onEnded(value) { ended.push(value); },
    onFallback(value) { fallbacks.push(value); },
  });
  return {
    controller,
    ended,
    fallbacks,
    requests,
    track,
    usage,
    tick() { for (const handler of [...intervals.values()]) handler(); },
  };
}

test("마이크 권한 요청이 끝나지 않으면 텍스트 모드로 전환하고 늦게 열린 트랙도 닫는다", async () => {
  let resolveMicrophone;
  let timeoutHandler;
  const lateTrack = { stop() { this.stopped = true; } };
  const harness = createHarness({
    mediaDevices: {
      getUserMedia() {
        return new Promise((resolve) => { resolveMicrophone = resolve; });
      },
    },
    setTimer(handler) {
      timeoutHandler = handler;
      return 1;
    },
  });

  const started = harness.controller.start();
  await Promise.resolve();
  timeoutHandler();
  assert.equal(await started, false);
  assert.equal(harness.controller.snapshot().phase, "fallback_text");
  assert.equal(harness.controller.snapshot().error, "microphone_timeout");

  resolveMicrophone({ getTracks: () => [lateTrack] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(lateTrack.stopped, true);
});

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
  assert.match(channel.sent[0].response.instructions, /Earth-based player/);
  assert.doesNotMatch(channel.sent[0].response.instructions, /add one brief/);

  channel.emit("message", { data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  assert.equal(harness.controller.snapshot().phase, "player_speaking");
  channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.started" }) });
  assert.equal(harness.controller.snapshot().phase, "ai_speaking");
  channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.stopped" }) });
  assert.equal(harness.controller.snapshot().phase, "listening");

  assert.equal(harness.controller.sendText("어제 판 얘기해줘"), true);
  assert.deepEqual(channel.sent.slice(-2).map((item) => item.type), ["conversation.item.create", "response.create"]);
});

test("첫 인사는 캐릭터·통화일수별 반말로 고정되고 지구 친구의 역할을 뒤집지 않는다", () => {
  assert.equal(friendCallOpeningLine("mina", "ko", 0), "여보세요? 어... 받았어. 전화는 처음이라 좀 어색하네ㅋㅋ");
  assert.match(friendCallOpeningLine("juno", "ko", 4), /^여보세요\? 오, 타이밍 괜찮네\./);
  assert.match(friendCallOpeningLine("noel", "ko", 9), /왜 이제 걸었냐/);
  assert.doesNotMatch(friendCallOpeningLine("mina", "ko", 9), /요[.?!]?$/);
  assert.match(friendCallOpeningLine("mina", "en", 0), /^Hello\?/);
  assert.match(friendCallOpeningLine("mina", "ja", 0), /^もしもし/);
  assert.match(friendCallOpeningLine("mina", "zh-CN", 0), /^喂/);
  assert.match(friendCallOpeningLine("mina", "zh-TW", 0), /真的打來了/);
  assert.match(friendCallOpeningLine("mina", "yue-Hant-HK", 0), /真係打咗嚟/);
  assert.match(friendCallOpeningLine("mina", "es-419", 0), /^¿Bueno\?/);
});

test("광둥어 코드가 그대로 서버에 전달되고 Realtime 실패 시 전사 내용을 보존해 텍스트로 전환한다", async () => {
  const harness = createHarness({ locale: "yue-Hant-HK" });
  assert.equal(await harness.controller.start(), true);
  assert.equal(harness.requests[0].locale, "yue-Hant-HK");
  const peer = FakePeerConnection.instances[0];
  peer.channel.emit("message", {
    data: JSON.stringify({ type: "conversation.item.input_audio_transcription.delta", delta: "頭先嗰句" }),
  });
  peer.channel.emit("message", {
    data: JSON.stringify({ type: "error", error: { code: "voice_response_failed" } }),
  });
  peer.channel.emit("message", {
    data: JSON.stringify({ type: "error", error: { code: "duplicate_upstream_error" } }),
  });
  const snapshot = harness.controller.snapshot();
  assert.equal(snapshot.phase, "fallback_text");
  assert.equal(snapshot.playerTranscript, "頭先嗰句");
  assert.equal(snapshot.error, "voice_response_failed");
  assert.equal(harness.fallbacks[0].playerTranscript, "頭先嗰句");
  assert.equal(harness.fallbacks.length, 1);
  assert.equal(peer.closed, true);
  assert.equal(harness.track.stopped, true);
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
