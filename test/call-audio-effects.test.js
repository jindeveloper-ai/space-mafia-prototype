import assert from "node:assert/strict";
import test from "node:test";

import {
  CALL_EFFECTS_STORAGE_KEY,
  createCallAudioEffectsController,
  getCharacterCallEffectProfile,
  readCallEffectsEnabled,
  writeCallEffectsEnabled,
} from "../call-audio-effects.js";

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "running";
    this.sampleRate = 8_000;
    this.destination = new FakeNode();
    this.mediaStreams = [];
    this.bufferSources = [];
    this.closed = false;
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource(stream) {
    this.mediaStreams.push(stream);
    return new FakeNode();
  }

  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: "", frequency: { value: 0 } });
  }

  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
    });
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 0 } });
  }

  createBuffer(channels, length, sampleRate) {
    const values = new Float32Array(length);
    return { channels, length, sampleRate, getChannelData: () => values };
  }

  createBufferSource() {
    const source = Object.assign(new FakeNode(), {
      started: false,
      stopped: false,
      start() { this.started = true; },
      stop() { this.stopped = true; },
    });
    this.bufferSources.push(source);
    return source;
  }

  async close() {
    this.closed = true;
    this.state = "closed";
  }
}

function memoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(CALL_EFFECTS_STORAGE_KEY, initialValue);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test("통화 효과 설정은 기본 켜짐이고 잘못된 저장값을 안전하게 복구한다", () => {
  assert.equal(readCallEffectsEnabled(memoryStorage()), true);
  assert.equal(readCallEffectsEnabled(memoryStorage("invalid-json")), true);
  assert.equal(readCallEffectsEnabled(memoryStorage(JSON.stringify({ enabled: false }))), true);
  const storage = memoryStorage();
  assert.equal(writeCallEffectsEnabled(false, storage), false);
  assert.equal(readCallEffectsEnabled(storage), false);
});

test("효과를 끄면 필터·노이즈·AudioContext를 만들지 않는다", () => {
  FakeAudioContext.instances = [];
  const audio = { muted: false };
  const controller = createCallAudioEffectsController({ AudioContextClass: FakeAudioContext, enabled: false });
  controller.setActive(true);
  controller.attach({ id: "remote" }, { characterId: "mina", audioElement: audio });
  assert.equal(FakeAudioContext.instances.length, 0);
  assert.equal(audio.muted, false);
  assert.deepEqual(controller.snapshot(), {
    enabled: false,
    active: true,
    paused: false,
    contextCreated: false,
    attachmentCount: 1,
    processedAttachmentCount: 0,
    noiseActive: false,
  });
});

test("AI 원격 출력만 전화 효과 체인을 통과하고 마이크 스트림은 건드리지 않는다", () => {
  FakeAudioContext.instances = [];
  const micStream = { id: "microphone" };
  const remoteStream = { id: "remote-ai" };
  const audio = { muted: false };
  const controller = createCallAudioEffectsController({ AudioContextClass: FakeAudioContext, enabled: true, random: () => 0.5 });
  controller.setActive(true);
  const handle = controller.attach(remoteStream, { characterId: "juno", audioElement: audio });
  const context = FakeAudioContext.instances[0];
  assert.deepEqual(context.mediaStreams, [remoteStream]);
  assert.ok(!context.mediaStreams.includes(micStream));
  assert.equal(context.bufferSources.length, 1);
  assert.equal(audio.muted, true);
  handle.detach();
  assert.equal(audio.muted, false);
});

test("캐릭터별 전화 음질 값은 명료도를 지키는 안전 범위 안에 있다", () => {
  const profiles = ["mina", "juno", "noel"].map(getCharacterCallEffectProfile);
  for (const profile of profiles) {
    assert.ok(profile.highpassHz >= 280 && profile.highpassHz <= 300);
    assert.ok(profile.lowpassHz >= 3_500 && profile.lowpassHz <= 3_800);
    assert.ok(profile.compressorRatio >= 1.5 && profile.compressorRatio <= 3);
    assert.ok(profile.outputGain >= 0.8 && profile.outputGain <= 1);
  }
  assert.ok(profiles[0].lowpassHz > profiles[1].lowpassHz);
  assert.ok(profiles[2].compressorRatio > profiles[1].compressorRatio);
});

test("재연결은 AudioContext와 노이즈를 중복 생성하지 않고 종료 시 모두 정리한다", () => {
  FakeAudioContext.instances = [];
  const firstAudio = { muted: false };
  const secondAudio = { muted: false };
  const controller = createCallAudioEffectsController({ AudioContextClass: FakeAudioContext, enabled: true, random: () => 0.5 });
  controller.setActive(true);
  const first = controller.attach({ id: "first" }, { characterId: "mina", audioElement: firstAudio });
  first.detach();
  controller.attach({ id: "second" }, { characterId: "noel", audioElement: secondAudio });
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(FakeAudioContext.instances[0].bufferSources.length, 1);
  controller.dispose();
  assert.equal(FakeAudioContext.instances[0].bufferSources[0].stopped, true);
  assert.equal(FakeAudioContext.instances[0].closed, true);
  assert.equal(secondAudio.muted, false);
  assert.equal(controller.snapshot().noiseActive, false);
  assert.equal(controller.snapshot().attachmentCount, 0);
});
