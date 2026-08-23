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

class FakeAudio {
  static instances = [];

  constructor(src = "") {
    this.src = src;
    this.loop = false;
    this.preload = "";
    this.playsInline = false;
    this.currentTime = 0;
    this.played = false;
    this.paused = false;
    FakeAudio.instances.push(this);
  }

  play() {
    this.played = true;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = "running";
    this.sampleRate = 8_000;
    this.destination = new FakeNode();
    this.mediaStreams = [];
    this.mediaElements = [];
    this.bufferSources = [];
    this.closed = false;
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamSource(stream) {
    this.mediaStreams.push(stream);
    return new FakeNode();
  }

  createMediaElementSource(element) {
    this.mediaElements.push(element);
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
    noiseAssetId: null,
    noiseKind: null,
  });
});

test("AI 원격 출력만 전화 효과 체인을 통과하고 마이크 스트림은 건드리지 않는다", () => {
  FakeAudioContext.instances = [];
  FakeAudio.instances = [];
  const micStream = { id: "microphone" };
  const remoteStream = { id: "remote-ai" };
  const audio = { muted: false };
  const controller = createCallAudioEffectsController({
    AudioContextClass: FakeAudioContext,
    AudioClass: FakeAudio,
    enabled: true,
    random: () => 0.5,
    storage: memoryStorage(),
  });
  controller.setActive(true);
  const handle = controller.attach(remoteStream, { characterId: "juno", audioElement: audio });
  const context = FakeAudioContext.instances[0];
  assert.deepEqual(context.mediaStreams, [remoteStream]);
  assert.ok(!context.mediaStreams.includes(micStream));
  assert.equal(context.mediaElements.length, 1);
  assert.equal(context.bufferSources.length, 0);
  assert.equal(FakeAudio.instances[0].loop, true);
  assert.match(FakeAudio.instances[0].src, /call-air-vent-27167\.mp3$/);
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
  FakeAudio.instances = [];
  const firstAudio = { muted: false };
  const secondAudio = { muted: false };
  const controller = createCallAudioEffectsController({
    AudioContextClass: FakeAudioContext,
    AudioClass: FakeAudio,
    enabled: true,
    random: () => 0.5,
    storage: memoryStorage(),
  });
  controller.setActive(true);
  const first = controller.attach({ id: "first" }, { characterId: "mina", audioElement: firstAudio });
  first.detach();
  controller.attach({ id: "second" }, { characterId: "noel", audioElement: secondAudio });
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(FakeAudioContext.instances[0].mediaElements.length, 1);
  controller.dispose();
  assert.equal(FakeAudio.instances[0].paused, true);
  assert.equal(FakeAudioContext.instances[0].closed, true);
  assert.equal(secondAudio.muted, false);
  assert.equal(controller.snapshot().noiseActive, false);
  assert.equal(controller.snapshot().attachmentCount, 0);
});

test("각 캐릭터의 다음 통화는 두 Pixabay 백색소음을 번갈아 사용한다", () => {
  FakeAudioContext.instances = [];
  FakeAudio.instances = [];
  const storage = memoryStorage();
  const connectOnce = (characterId) => {
    const controller = createCallAudioEffectsController({
      AudioContextClass: FakeAudioContext,
      AudioClass: FakeAudio,
      enabled: true,
      storage,
    });
    controller.setActive(true);
    controller.attach({ id: characterId }, { characterId });
    const assetId = controller.snapshot().noiseAssetId;
    controller.dispose();
    return assetId;
  };

  assert.deepEqual(
    [connectOnce("mina"), connectOnce("mina"), connectOnce("mina")],
    ["fan-573497", "air-vent-27167", "fan-573497"],
  );
  assert.deepEqual(
    [connectOnce("juno"), connectOnce("juno")],
    ["air-vent-27167", "fan-573497"],
  );
});

test("마피아 보이스 연결은 첫 AI 대사 전부터 두 노이즈를 통화마다 교대한다", () => {
  FakeAudioContext.instances = [];
  FakeAudio.instances = [];
  const storage = memoryStorage();
  const connectGameOnce = () => {
    const controller = createCallAudioEffectsController({
      AudioContextClass: FakeAudioContext,
      AudioClass: FakeAudio,
      enabled: true,
      rotationScope: "mafia",
      storage,
    });
    controller.setActive(true);
    const snapshot = controller.snapshot();
    controller.dispose();
    return snapshot;
  };

  const first = connectGameOnce();
  const second = connectGameOnce();
  assert.equal(first.noiseActive, true);
  assert.equal(second.noiseActive, true);
  assert.deepEqual(
    [first.noiseAssetId, second.noiseAssetId],
    ["air-vent-27167", "fan-573497"],
  );
});
