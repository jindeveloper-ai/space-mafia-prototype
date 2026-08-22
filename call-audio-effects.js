export const CALL_EFFECTS_STORAGE_KEY = "mars-net-call-effects-v1";

const DEFAULT_ENABLED = true;
const PHONE_NOISE_GAIN = 10 ** (-42 / 20);
const CHARACTER_PROFILES = Object.freeze({
  mina: Object.freeze({
    highpassHz: 300,
    lowpassHz: 3_800,
    compressorThreshold: -28,
    compressorKnee: 14,
    compressorRatio: 1.8,
    compressorAttack: 0.006,
    compressorRelease: 0.16,
    outputGain: 0.9,
  }),
  juno: Object.freeze({
    highpassHz: 280,
    lowpassHz: 3_650,
    compressorThreshold: -30,
    compressorKnee: 16,
    compressorRatio: 2.1,
    compressorAttack: 0.008,
    compressorRelease: 0.2,
    outputGain: 0.92,
  }),
  noel: Object.freeze({
    highpassHz: 300,
    lowpassHz: 3_550,
    compressorThreshold: -31,
    compressorKnee: 18,
    compressorRatio: 2.7,
    compressorAttack: 0.005,
    compressorRelease: 0.18,
    outputGain: 0.88,
  }),
});

function safeDisconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Audio nodes may already be disconnected during page teardown.
  }
}

function setAudioParam(param, value) {
  if (param && Number.isFinite(value)) param.value = value;
}

export function getCharacterCallEffectProfile(characterId) {
  return CHARACTER_PROFILES[characterId] ?? CHARACTER_PROFILES.juno;
}

export function readCallEffectsEnabled(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem?.(CALL_EFFECTS_STORAGE_KEY);
    if (stored === null || stored === undefined) return DEFAULT_ENABLED;
    const parsed = JSON.parse(stored);
    return typeof parsed === "boolean" ? parsed : DEFAULT_ENABLED;
  } catch {
    return DEFAULT_ENABLED;
  }
}

export function writeCallEffectsEnabled(enabled, storage = globalThis.localStorage) {
  const normalized = Boolean(enabled);
  try {
    storage?.setItem?.(CALL_EFFECTS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Calls still work when private browsing blocks local storage.
  }
  return normalized;
}

export function createCallAudioEffectsController(options = {}) {
  const AudioContextClass = options.AudioContextClass
    ?? globalThis.AudioContext
    ?? globalThis.webkitAudioContext;
  const random = options.random ?? Math.random;
  let enabled = typeof options.enabled === "boolean" ? options.enabled : DEFAULT_ENABLED;
  let active = false;
  let paused = false;
  let disposed = false;
  let audioContext = null;
  let noiseSource = null;
  let noiseGain = null;
  const attachments = new Set();

  function ensureContext() {
    if (!enabled || disposed || !AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") void audioContext.resume?.().catch?.(() => {});
    return audioContext;
  }

  function stopNoise() {
    try {
      noiseSource?.stop?.();
    } catch {
      // Buffer sources can only be stopped once.
    }
    safeDisconnect(noiseSource);
    safeDisconnect(noiseGain);
    noiseSource = null;
    noiseGain = null;
  }

  function startNoise() {
    if (!active || !enabled || noiseSource) return;
    try {
      const context = ensureContext();
      if (!context?.createBuffer || !context?.createBufferSource || !context?.createGain) return;
      const sampleRate = Math.max(8_000, Number(context.sampleRate) || 48_000);
      const buffer = context.createBuffer(1, sampleRate * 2, sampleRate);
      const samples = buffer.getChannelData(0);
      let pink = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const white = (random() * 2) - 1;
        pink = (pink * 0.98) + (white * 0.02);
        samples[index] = Math.max(-1, Math.min(1, pink * 2.4));
      }
      noiseSource = context.createBufferSource();
      noiseGain = context.createGain();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      setAudioParam(noiseGain.gain, PHONE_NOISE_GAIN);
      noiseSource.connect(noiseGain);
      noiseGain.connect(context.destination);
      noiseSource.start();
    } catch {
      stopNoise();
    }
  }

  function destroyGraph(attachment) {
    for (const node of attachment.nodes ?? []) safeDisconnect(node);
    attachment.nodes = [];
    if (attachment.audioElement) attachment.audioElement.muted = false;
  }

  function buildGraph(attachment) {
    if (!enabled || disposed || attachment.nodes.length) return;
    const nodes = [];
    try {
      const context = ensureContext();
      if (!context?.createMediaStreamSource || !attachment.stream) return;
      const profile = getCharacterCallEffectProfile(attachment.characterId);
      const source = context.createMediaStreamSource(attachment.stream);
      const highpass = context.createBiquadFilter();
      const lowpass = context.createBiquadFilter();
      const compressor = context.createDynamicsCompressor();
      const output = context.createGain();
      nodes.push(source, highpass, lowpass, compressor, output);
      highpass.type = "highpass";
      lowpass.type = "lowpass";
      setAudioParam(highpass.frequency, profile.highpassHz);
      setAudioParam(lowpass.frequency, profile.lowpassHz);
      setAudioParam(compressor.threshold, profile.compressorThreshold);
      setAudioParam(compressor.knee, profile.compressorKnee);
      setAudioParam(compressor.ratio, profile.compressorRatio);
      setAudioParam(compressor.attack, profile.compressorAttack);
      setAudioParam(compressor.release, profile.compressorRelease);
      setAudioParam(output.gain, paused ? 0 : profile.outputGain);
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(output);
      output.connect(context.destination);
      attachment.nodes = nodes;
      attachment.output = output;
      if (attachment.audioElement) attachment.audioElement.muted = true;
    } catch {
      for (const node of nodes) safeDisconnect(node);
      attachment.nodes = [];
      attachment.output = null;
      if (attachment.audioElement) attachment.audioElement.muted = false;
    }
  }

  function attach(stream, { characterId = "juno", audioElement = null } = {}) {
    const attachment = { stream, characterId, audioElement, nodes: [], output: null };
    attachments.add(attachment);
    buildGraph(attachment);
    startNoise();
    return {
      detach() {
        if (!attachments.delete(attachment)) return;
        destroyGraph(attachment);
      },
    };
  }

  function setActive(nextActive) {
    active = Boolean(nextActive) && !disposed;
    if (active) startNoise();
    else stopNoise();
    return active;
  }

  function setPaused(nextPaused) {
    paused = Boolean(nextPaused);
    for (const attachment of attachments) {
      const profile = getCharacterCallEffectProfile(attachment.characterId);
      setAudioParam(attachment.output?.gain, paused ? 0 : profile.outputGain);
    }
    return paused;
  }

  function setEnabled(nextEnabled) {
    const normalized = Boolean(nextEnabled);
    if (enabled === normalized || disposed) return enabled;
    enabled = normalized;
    if (!enabled) {
      for (const attachment of attachments) destroyGraph(attachment);
      stopNoise();
      void audioContext?.close?.().catch?.(() => {});
      audioContext = null;
    } else {
      for (const attachment of attachments) buildGraph(attachment);
      startNoise();
    }
    return enabled;
  }

  function snapshot() {
    return {
      enabled,
      active,
      paused,
      contextCreated: Boolean(audioContext),
      attachmentCount: attachments.size,
      processedAttachmentCount: [...attachments].filter((item) => item.nodes.length > 0).length,
      noiseActive: Boolean(noiseSource),
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    for (const attachment of attachments) destroyGraph(attachment);
    attachments.clear();
    stopNoise();
    void audioContext?.close?.().catch?.(() => {});
    audioContext = null;
  }

  return { attach, dispose, setActive, setEnabled, setPaused, snapshot };
}
