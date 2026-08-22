export const VOICE_STATES = Object.freeze([
  "idle",
  "requesting_permission",
  "connecting",
  "listening",
  "player_speaking",
  "processing",
  "ai_speaking",
  "paused",
  "reconnecting",
  "ended",
  "fallback_text",
]);

const VOICE_STATE_SET = new Set(VOICE_STATES);

export function createVoiceStateMachine(onChange = () => {}) {
  let state = "idle";
  return {
    get state() {
      return state;
    },
    transition(nextState, detail = null) {
      if (!VOICE_STATE_SET.has(nextState)) throw new TypeError(`Unknown voice state: ${nextState}`);
      if (state === nextState && detail === null) return state;
      const previousState = state;
      state = nextState;
      onChange({ state, previousState, detail });
      return state;
    },
  };
}

export function createFinalTranscriptGate(handler) {
  const completedIds = new Set();
  let pending = Promise.resolve();
  return {
    accept({ id, text }) {
      const utteranceId = String(id ?? "").trim();
      const transcript = String(text ?? "").trim();
      if (!utteranceId || !transcript || completedIds.has(utteranceId)) return false;
      completedIds.add(utteranceId);
      pending = pending.then(() => handler({ id: utteranceId, text: transcript }));
      return true;
    },
    has(id) {
      return completedIds.has(id);
    },
    whenIdle() {
      return pending;
    },
    clear() {
      completedIds.clear();
    },
  };
}

export function createLocalVoiceActivityDetector(options = {}) {
  const threshold = options.threshold ?? 0.08;
  const silenceMs = options.silenceMs ?? 750;
  const minimumSpeechMs = options.minimumSpeechMs ?? 180;
  let active = false;
  let startedAt = 0;
  let lastVoiceAt = 0;

  function sample(level, now) {
    const timestamp = Number(now) || 0;
    if (Number(level) >= threshold) {
      lastVoiceAt = timestamp;
      if (active) return null;
      active = true;
      startedAt = timestamp;
      return { type: "speech_started" };
    }
    if (!active || timestamp - lastVoiceAt < silenceMs) return null;
    const durationMs = Math.max(0, lastVoiceAt - startedAt);
    active = false;
    startedAt = 0;
    lastVoiceAt = 0;
    return { type: "speech_stopped", commit: durationMs >= minimumSpeechMs, durationMs };
  }

  function reset() {
    active = false;
    startedAt = 0;
    lastVoiceAt = 0;
  }

  return {
    sample,
    reset,
    get active() {
      return active;
    },
  };
}

export function createSpeakerQueue(worker, callbacks = {}) {
  const queue = [];
  let active = null;
  let running = false;
  let generation = 0;

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      const entry = queue.shift();
      const currentGeneration = generation;
      active = entry;
      callbacks.onActive?.(entry.item);
      try {
        const result = await worker(entry.item);
        entry.resolve(result);
      } catch (error) {
        entry.reject(error);
      } finally {
        if (currentGeneration === generation) callbacks.onInactive?.(entry.item);
        active = null;
      }
    }
    running = false;
    callbacks.onIdle?.();
  }

  return {
    enqueue(item) {
      return new Promise((resolve, reject) => {
        queue.push({ item, resolve, reject });
        void drain();
      });
    },
    interrupt(reason = "interrupted") {
      generation += 1;
      callbacks.onInterrupt?.(active?.item ?? null);
      const interrupted = queue.splice(0);
      interrupted.forEach((entry) => entry.resolve({ completed: false, reason }));
      return active?.item ?? null;
    },
    clear(reason = "cleared") {
      generation += 1;
      const removed = queue.splice(0);
      removed.forEach((entry) => entry.resolve({ completed: false, reason }));
    },
    get active() {
      return active?.item ?? null;
    },
    get size() {
      return queue.length + (active ? 1 : 0);
    },
  };
}

export function createVoiceMetrics() {
  return {
    transcriptionSessions: 0,
    speechSessions: 0,
    maxConcurrentSessions: 0,
    concurrentSessions: 0,
    finalizedUtterances: 0,
    outputAudioTokens: 0,
    inputAudioTokens: 0,
    transcriptionStartedAt: null,
    transcriptionSeconds: 0,
  };
}

export function estimateVoiceCost(metrics) {
  const transcriptionMinutes = Math.max(0, Number(metrics.transcriptionSeconds) || 0) / 60;
  const inputAudioTokens = Math.max(0, Number(metrics.inputAudioTokens) || 0);
  const outputAudioTokens = Math.max(0, Number(metrics.outputAudioTokens) || 0);
  return Number((
    (transcriptionMinutes * 0.017)
    + (inputAudioTokens * 10 / 1_000_000)
    + (outputAudioTokens * 20 / 1_000_000)
  ).toFixed(6));
}

export function recordSessionStarted(metrics, purpose, now = Date.now()) {
  metrics.concurrentSessions += 1;
  metrics.maxConcurrentSessions = Math.max(metrics.maxConcurrentSessions, metrics.concurrentSessions);
  if (purpose === "transcription") {
    metrics.transcriptionSessions += 1;
    metrics.transcriptionStartedAt = now;
  } else {
    metrics.speechSessions += 1;
  }
}

export function recordSessionEnded(metrics, purpose, now = Date.now()) {
  metrics.concurrentSessions = Math.max(0, metrics.concurrentSessions - 1);
  if (purpose === "transcription" && metrics.transcriptionStartedAt !== null) {
    metrics.transcriptionSeconds += Math.max(0, now - metrics.transcriptionStartedAt) / 1000;
    metrics.transcriptionStartedAt = null;
  }
}
