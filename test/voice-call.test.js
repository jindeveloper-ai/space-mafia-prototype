import test from "node:test";
import assert from "node:assert/strict";

import { createVoiceCallController } from "../voice-call.js";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    const wrapped = options.once
      ? (...args) => {
          this.listeners.get(type)?.delete(wrapped);
          handler(...args);
        }
      : handler;
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(wrapped);
  }

  emit(type, value = {}) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(value);
  }
}

class FakeDataChannel extends FakeTarget {
  constructor() {
    super();
    this.readyState = "open";
    this.sent = [];
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = "closed";
  }
}

class FakePeerConnection {
  static instances = [];

  constructor() {
    this.channel = new FakeDataChannel();
    this.connectionState = "connected";
    this.closed = false;
    FakePeerConnection.instances.push(this);
  }

  createDataChannel() {
    return this.channel;
  }

  addTrack(track) {
    this.track = track;
  }

  addTransceiver(kind, options) {
    this.transceiver = { kind, options };
  }

  async createOffer() {
    return { type: "offer", sdp: "fake-offer" };
  }

  async setLocalDescription(offer) {
    this.localDescription = offer;
  }

  async setRemoteDescription(answer) {
    this.remoteDescription = answer;
  }

  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

class FakeAudio extends FakeTarget {
  constructor() {
    super();
    this.paused = true;
    this.srcObject = null;
  }

  async play() {
    this.paused = false;
    this.emit("playing");
  }

  pause() {
    this.paused = true;
  }

  remove() {}
}

class FakeAudioContext {
  constructor() {
    this.state = "suspended";
    this.resumeCalls = 0;
  }

  async resume() {
    this.resumeCalls += 1;
    this.state = "running";
  }

  createAnalyser() {
    return {
      frequencyBinCount: 32,
      getByteFrequencyData(values) { values.fill(0); },
      connect() {},
    };
  }

  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }

  async close() {
    this.state = "closed";
  }
}

function fakeResponse({ ok = true, json = null, text = "fake-answer" } = {}) {
  return {
    ok,
    json: async () => json ?? {},
    text: async () => text,
  };
}

function createHarness({
  denyMicrophone = false,
  failNegotiation = false,
  withAudioContext = false,
  transcriptionTimeoutMs,
  outputTimeoutMs = 100,
  controllerOptions = {},
} = {}) {
  FakePeerConnection.instances = [];
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const fetchCalls = [];
  const finalTranscripts = [];
  const fallbacks = [];
  const soundDucking = [];
  const controller = createVoiceCallController({
    locale: "ko",
    PeerConnection: FakePeerConnection,
    AudioElement: FakeAudio,
    AudioContextClass: withAudioContext ? FakeAudioContext : null,
    transcriptionTimeoutMs,
    outputTimeoutMs,
    mediaDevices: {
      async getUserMedia() {
        if (denyMicrophone) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        return stream;
      },
    },
    async fetchImpl(url, options) {
      fetchCalls.push({ url, options });
      if (url === "/api/realtime/client-secret") {
        return fakeResponse({ json: { value: "ek_test_ephemeral" } });
      }
      return fakeResponse({ ok: !failNegotiation });
    },
    async onFinalTranscript(utterance) {
      finalTranscripts.push(utterance);
    },
    onFallback(code) {
      fallbacks.push(code);
    },
    soundController: {
      setDucking(value) {
        soundDucking.push(value);
      },
    },
    ...controllerOptions,
  });
  return { controller, track, stream, fetchCalls, finalTranscripts, fallbacks, soundDucking };
}

function createPendingMicrophoneHarness() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  let resolveMedia;
  const controller = createVoiceCallController({
    PeerConnection: FakePeerConnection,
    fetchImpl: async () => fakeResponse({ json: { value: "ek_test_ephemeral" } }),
    permissionTimeoutMs: 1,
    mediaDevices: {
      getUserMedia() {
        return new Promise((resolve) => { resolveMedia = resolve; });
      },
    },
  });
  return { controller, track, resolveMedia: (stream) => resolveMedia(stream) };
}

async function waitFor(predicate, message = "condition") {
  for (let index = 0; index < 40; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${message}`);
}

function emitRealtime(peer, event) {
  peer.channel.emit("message", { data: JSON.stringify(event) });
}

test("마이크 권한 거절과 WebRTC 실패는 텍스트 모드 폴백으로 끝난다", async () => {
  const denied = createHarness({ denyMicrophone: true });
  assert.equal(await denied.controller.prepare(), false);
  assert.equal(denied.controller.snapshot().state, "fallback_text");
  assert.deepEqual(denied.fallbacks, ["microphone_denied"]);

  const failed = createHarness({ failNegotiation: true });
  assert.equal(await failed.controller.connect(), false);
  assert.equal(failed.controller.snapshot().state, "fallback_text");
  assert.equal(failed.track.stopped, true);
  assert.deepEqual(failed.soundDucking, [true, false]);
});

test("마이크 권한 응답이 멈춰도 대기 화면에 갇히지 않고 늦게 열린 트랙을 닫는다", async () => {
  const harness = createPendingMicrophoneHarness();
  assert.equal(await harness.controller.prepare(), false);
  assert.equal(harness.controller.snapshot().state, "fallback_text");
  assert.equal(harness.controller.snapshot().error, "microphone_timeout");
  harness.resolveMedia({ getTracks: () => [harness.track] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.track.stopped, true);
});

test("확정 자막만 발화 ID당 한 번 판정하고 음소거는 마이크 트랙을 끈다", async () => {
  const harness = createHarness();
  assert.equal(await harness.controller.connect(), true);
  const transcriptionPeer = FakePeerConnection.instances[0];
  assert.equal(harness.track.enabled, true);

  emitRealtime(transcriptionPeer, {
    type: "conversation.item.input_audio_transcription.delta",
    item_id: "u1",
    delta: "미나",
  });
  assert.equal(harness.finalTranscripts.length, 0);
  emitRealtime(transcriptionPeer, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "u1",
    transcript: "미나를 의심해",
  });
  emitRealtime(transcriptionPeer, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "u1",
    transcript: "중복 발화",
  });
  await harness.controller.whenTranscriptsIdle();
  assert.deepEqual(harness.finalTranscripts, [{ id: "u1", text: "미나를 의심해" }]);

  assert.equal(harness.controller.setMuted(true), true);
  assert.equal(harness.track.enabled, false);
  assert.equal(harness.controller.setMuted(false), false);
  assert.equal(harness.track.enabled, true);
  harness.controller.end();
  assert.equal(harness.track.stopped, true);
  assert.equal(transcriptionPeer.closed, true);
  assert.deepEqual(harness.soundDucking, [true, false]);
});

test("브라우저 자동 감지가 멈춰도 수동 말하기 버튼이 전사 버퍼를 확정한다", async () => {
  const harness = createHarness({ withAudioContext: true });
  assert.equal(await harness.controller.connect(), true);
  const transcriptionPeer = FakePeerConnection.instances[0];
  assert.equal(harness.controller.snapshot().audioContextState, "running");

  assert.equal(harness.controller.toggleTalking(), true);
  assert.equal(harness.controller.snapshot().manualTurnActive, true);
  assert.equal(harness.controller.snapshot().state, "player_speaking");
  assert.deepEqual(transcriptionPeer.channel.sent.at(-1), { type: "input_audio_buffer.clear" });

  assert.equal(harness.controller.toggleTalking(), true);
  assert.equal(harness.controller.snapshot().manualTurnActive, false);
  assert.equal(harness.controller.snapshot().state, "processing");
  assert.deepEqual(transcriptionPeer.channel.sent.at(-1), { type: "input_audio_buffer.commit" });
  harness.controller.end();
});

test("서버 VAD가 버튼 없이 발화 시작과 종료를 감지해 확정 자막을 처리한다", async () => {
  const harness = createHarness();
  assert.equal(await harness.controller.connect(), true);
  const transcriptionPeer = FakePeerConnection.instances[0];

  emitRealtime(transcriptionPeer, { type: "input_audio_buffer.speech_started" });
  assert.equal(harness.controller.snapshot().state, "player_speaking");

  emitRealtime(transcriptionPeer, { type: "input_audio_buffer.speech_stopped" });
  assert.equal(harness.controller.snapshot().state, "processing");
  assert.equal(
    transcriptionPeer.channel.sent.some((event) => event.type === "input_audio_buffer.commit"),
    false,
  );

  emitRealtime(transcriptionPeer, {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "auto-turn-1",
    transcript: "노엘이 시간을 바꿔 말했어",
  });
  await harness.controller.whenTranscriptsIdle();
  assert.deepEqual(harness.finalTranscripts, [{
    id: "auto-turn-1",
    text: "노엘이 시간을 바꿔 말했어",
  }]);
  assert.equal(harness.controller.snapshot().state, "listening");
  harness.controller.end();
});

test("서버 감지가 늦으면 브라우저 음량 감지가 버튼 없이 발화를 확정한다", async () => {
  let timestamp = 0;
  let loud = false;
  const frames = [];
  class LocalVadAudioContext extends FakeAudioContext {
    createAnalyser() {
      return {
        fftSize: 512,
        smoothingTimeConstant: 0,
        connect() {},
        getByteTimeDomainData(values) { values.fill(loud ? 132 : 128); },
      };
    }
  }
  const harness = createHarness({
    controllerOptions: {
      AudioContextClass: LocalVadAudioContext,
      requestFrame(callback) { frames.push(callback); return frames.length; },
      cancelFrame() {},
      now: () => timestamp,
      localVadStartMs: 1,
      localVadStopMs: 1,
    },
  });
  await harness.controller.connect();
  const transcriptionPeer = FakePeerConnection.instances[0];
  const runFrame = (advance, nextLoud) => {
    timestamp += advance;
    loud = nextLoud;
    frames.shift()?.();
  };
  runFrame(0, true);
  runFrame(5, true);
  assert.equal(harness.controller.snapshot().state, "player_speaking");
  runFrame(5, false);
  runFrame(5, false);
  assert.equal(harness.controller.snapshot().state, "processing");
  assert.equal(
    transcriptionPeer.channel.sent.some((event) => event.type === "input_audio_buffer.commit"),
    true,
  );
  harness.controller.end();
});

test("무음 발화는 처리 중에 갇히지 않고 다시 듣기 상태로 돌아간다", async () => {
  const harness = createHarness({ transcriptionTimeoutMs: 1 });
  await harness.controller.connect();
  harness.controller.toggleTalking();
  harness.controller.toggleTalking();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.controller.snapshot().error, "no_speech_detected");
  harness.controller.end();
});

test("빈 수동 버퍼 오류는 연결을 끊지 않고 자동 듣기로 복귀한다", async () => {
  const harness = createHarness();
  await harness.controller.connect();
  const transcriptionPeer = FakePeerConnection.instances[0];
  harness.controller.toggleTalking();
  harness.controller.toggleTalking();
  emitRealtime(transcriptionPeer, {
    type: "error",
    error: { code: "input_audio_buffer_commit_empty" },
  });
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.controller.snapshot().error, "no_speech_detected");
  assert.equal(transcriptionPeer.closed, false);
  harness.controller.end();
});

test("빈 확정 자막도 처리 중에 갇히지 않고 다시 듣는다", async () => {
  const harness = createHarness();
  await harness.controller.connect();
  harness.controller.toggleTalking();
  harness.controller.toggleTalking();
  emitRealtime(FakePeerConnection.instances[0], {
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "empty-utterance",
    transcript: "",
  });
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.deepEqual(harness.finalTranscripts, []);
  harness.controller.end();
});

test("미나·주노·노엘은 실제 오디오 이벤트에 맞춰 한 명씩 말하고 최대 동시 세션은 2개다", async () => {
  const harness = createHarness();
  await harness.controller.connect();
  const queued = [
    harness.controller.speak("mina", "미나 대사"),
    harness.controller.speak("juno", "주노 대사"),
    harness.controller.speak("noel", "노엘 대사"),
  ];

  for (const [index, speakerId] of ["mina", "juno", "noel"].entries()) {
    await waitFor(() => FakePeerConnection.instances.length === index + 2, `${speakerId} output session`);
    const peer = FakePeerConnection.instances[index + 1];
    assert.equal(peer.transceiver.options.direction, "recvonly");
    assert.equal(harness.controller.snapshot().activeSpeakerId, null);
    peer.ontrack({ streams: [{ id: `${speakerId}-stream` }] });
    await peer.channel.sent.find((event) => event.type === "response.create");
    peer.channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.started" }) });
    assert.equal(harness.controller.snapshot().activeSpeakerId, speakerId);
    peer.channel.emit("message", { data: JSON.stringify({ type: "output_audio_buffer.stopped" }) });
    assert.deepEqual(await queued[index], { completed: true, reason: "completed", transcript: "" });
  }

  const final = harness.controller.end();
  assert.equal(final.metrics.speechSessions, 3);
  assert.equal(final.metrics.transcriptionSessions, 1);
  assert.equal(final.metrics.maxConcurrentSessions, 2);
  assert.equal(FakePeerConnection.instances.every((peer) => peer.closed), true);
});

test("response.done 뒤에도 실제 오디오 종료 전에는 긴 대사를 끊지 않는다", { concurrency: false }, async () => {
  const harness = createHarness();
  await harness.controller.connect();
  let settled = false;
  const speech = harness.controller.speak("mina", "3초보다 긴 대사도 끝까지 재생되어야 합니다.");
  speech.finally(() => { settled = true; });
  await waitFor(() => FakePeerConnection.instances.length === 2, "Mina output session");
  const outputPeer = FakePeerConnection.instances[1];
  await waitFor(
    () => outputPeer.channel.sent.some((event) => event.type === "response.create"),
    "Mina response request",
  );
  outputPeer.ontrack({ streams: [{ id: "long-line-stream" }] });
  emitRealtime(outputPeer, { type: "output_audio_buffer.started" });
  emitRealtime(outputPeer, { type: "response.done", response: { status: "completed" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  emitRealtime(outputPeer, { type: "output_audio_buffer.stopped" });
  assert.deepEqual(await speech, { completed: true, reason: "completed", transcript: "" });
  harness.controller.end();
});

test("AI 답변은 겹치지 않고 앞 화자가 끝난 뒤 다음 화자로 넘어간다", { concurrency: false }, async () => {
  const harness = createHarness();
  await harness.controller.connect();
  const speeches = [
    harness.controller.speak("mina", "그 기록부터 다시 봐", { emotion: "heated" }),
    harness.controller.speak("juno", "반례가 아직 남아 있음", { emotion: "skeptical" }),
    harness.controller.speak("noel", "둘 다 방금 말 달라졌는데", { emotion: "amused" }),
  ];
  for (const [index, speakerId] of ["mina", "juno", "noel"].entries()) {
    await waitFor(() => FakePeerConnection.instances.length === index + 2, `${speakerId} output session`);
    assert.equal(FakePeerConnection.instances.length, index + 2);
    const peer = FakePeerConnection.instances[index + 1];
    peer.ontrack({ streams: [{ id: `${speakerId}-sequential` }] });
    emitRealtime(peer, { type: "output_audio_buffer.started" });
    assert.deepEqual(harness.controller.snapshot().activeSpeakerIds, [speakerId]);
    emitRealtime(peer, { type: "output_audio_buffer.stopped" });
    assert.equal((await speeches[index]).completed, true);
  }
  const final = harness.controller.end();
  assert.equal(final.metrics.maxConcurrentSessions, 2);
});

test("AI가 말하는 동안 마이크와 전사 버퍼를 격리하고 끝난 뒤 새 버퍼로 듣는다", { concurrency: false }, async () => {
  const harness = createHarness();
  await harness.controller.connect();
  const transcriptionPeer = FakePeerConnection.instances[0];
  const mina = harness.controller.speak("mina", "내 대사가 사용자 입력으로 들어가면 안 됨");
  await waitFor(() => FakePeerConnection.instances.length === 2, "Mina output session");
  const outputPeer = FakePeerConnection.instances[1];
  await waitFor(
    () => outputPeer.channel.sent.some((event) => event.type === "response.create"),
    "Mina response request",
  );
  assert.equal(harness.track.enabled, false);
  assert.equal(
    transcriptionPeer.channel.sent.some((event) => event.type === "input_audio_buffer.clear"),
    true,
  );
  outputPeer.ontrack({ streams: [{ id: "mina-stream" }] });
  emitRealtime(outputPeer, { type: "output_audio_buffer.started" });

  emitRealtime(transcriptionPeer, { type: "input_audio_buffer.speech_started" });
  assert.equal(harness.controller.snapshot().state, "ai_speaking");
  assert.equal(outputPeer.channel.sent.some((event) => event.type === "response.cancel"), false);

  emitRealtime(outputPeer, { type: "output_audio_buffer.stopped" });
  assert.deepEqual(await mina, { completed: true, reason: "completed", transcript: "" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.track.enabled, true);
  assert.equal(transcriptionPeer.channel.sent.at(-1).type, "input_audio_buffer.clear");
  assert.equal(harness.controller.snapshot().state, "listening");
  harness.controller.end();
});
