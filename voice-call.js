import {
  createFinalTranscriptGate,
  createSpeakerQueue,
  createVoiceMetrics,
  createVoiceStateMachine,
  estimateVoiceCost,
  recordSessionEnded,
  recordSessionStarted,
} from "./voice-call-core.js?v=0.18.6";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const SPEAKER_STYLE = {
  mina: "Use a bright, slightly fast fandom-chat rhythm without sounding childish.",
  juno: "Use a calm, measured rhythm and make the reasoning easy to follow.",
  noel: "Use a natural, lightly playful rhythm with an observant edge.",
};
const LOCAL_VAD_START_LEVEL = 0.02;
const LOCAL_VAD_STOP_LEVEL = 0.008;
const LOCAL_VAD_START_MS = 160;
const LOCAL_VAD_STOP_MS = 480;
const LOCAL_VAD_CALIBRATION_MS = 500;
const LOCAL_VAD_MAX_UTTERANCE_MS = 10_000;
const LOCAL_VAD_NOISE_ALPHA = 0.16;
const PLAYBACK_START_TIMEOUT_MS = 8_000;
const RECOVERABLE_TRANSCRIPTION_ERRORS = new Set([
  "input_audio_buffer_commit_empty",
]);

function estimatePlaybackDurationMs(text, locale) {
  const characterCount = [...String(text ?? "")].length;
  const millisecondsPerCharacter = locale === "ko" ? 150 : 68;
  return Math.min(32_000, Math.max(1_800, 1_100 + (characterCount * millisecondsPerCharacter)));
}

function addListener(target, type, handler, options) {
  target?.addEventListener?.(type, handler, options);
}

function safeSend(channel, event) {
  if (channel?.readyState !== "open") return false;
  channel.send(JSON.stringify(event));
  return true;
}

export function createVoiceCallController(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const PeerConnection = options.PeerConnection ?? globalThis.RTCPeerConnection;
  const AudioElement = options.AudioElement ?? globalThis.Audio;
  const AudioContextClass = options.AudioContextClass ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const setTimer = options.setTimer ?? globalThis.setTimeout?.bind(globalThis);
  const clearTimer = options.clearTimer ?? globalThis.clearTimeout?.bind(globalThis);
  const requestFrame = options.requestFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = options.cancelFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
  const now = options.now ?? Date.now;
  const permissionTimeoutMs = options.permissionTimeoutMs ?? 12_000;
  const transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? 8_000;
  const outputTimeoutMs = options.outputTimeoutMs ?? 45_000;
  const localVadStartLevel = options.localVadStartLevel ?? LOCAL_VAD_START_LEVEL;
  const localVadStopLevel = options.localVadStopLevel ?? LOCAL_VAD_STOP_LEVEL;
  const localVadStartMs = options.localVadStartMs ?? LOCAL_VAD_START_MS;
  const localVadStopMs = options.localVadStopMs ?? LOCAL_VAD_STOP_MS;
  const localVadCalibrationMs = options.localVadCalibrationMs ?? LOCAL_VAD_CALIBRATION_MS;
  const localVadMaxUtteranceMs = options.localVadMaxUtteranceMs ?? LOCAL_VAD_MAX_UTTERANCE_MS;
  const localVadNoiseAlpha = options.localVadNoiseAlpha ?? LOCAL_VAD_NOISE_ALPHA;
  const locale = options.locale === "en" ? "en" : "ko";
  const metrics = createVoiceMetrics();
  const stateMachine = createVoiceStateMachine(() => options.onUpdate?.(snapshot()));

  let micStream = null;
  let transcriptionConnection = null;
  const activeOutputs = new Map();
  let outputSequence = 0;
  let outputEpoch = 0;
  let reconnectTimer = null;
  let transcriptionTimer = null;
  let audioContext = null;
  let meterFrame = null;
  let meterGeneration = 0;
  let meterSource = null;
  let meterAnalyser = null;
  let meterSink = null;
  let meterKind = null;
  let meterBackend = "none";
  let meterError = null;
  let rtcInputLevel = 0;
  let rtcMeterPending = false;
  let rtcMeterSampledAt = Number.NEGATIVE_INFINITY;
  let rtcEnergySample = null;
  let inputLevel = 0;
  let muted = false;
  let inputEnabled = true;
  let paused = false;
  let captionsEnabled = true;
  let captionText = "";
  let activeSpeakerId = null;
  let lastSpeakerId = "mina";
  let disposed = false;
  let lastError = null;
  let manualTurnActive = false;
  let localTurnActive = false;
  let serverTurnActive = false;
  let localLoudSince = null;
  let localQuietSince = null;
  let localSpeechStartedAt = null;
  let localSpeechPeak = 0;
  let localNoiseFloor = localVadStopLevel;
  let localCalibrationStartedAt = null;

  function snapshot() {
    const speakingOutputs = [...activeOutputs.values()].filter((output) => output.started && !output.finished);
    const activeOutput = speakingOutputs.at(-1) ?? null;
    return {
      state: stateMachine.state,
      muted,
      inputEnabled,
      paused,
      captionsEnabled,
      captionText,
      activeSpeakerId: activeOutput?.item.speakerId ?? activeSpeakerId,
      activeSpeakerIds: speakingOutputs.map((output) => output.item.speakerId),
      activeEmotion: activeOutput?.item.emotion ?? "neutral",
      lastSpeakerId,
      connected: Boolean(transcriptionConnection),
      manualTurnActive,
      inputLevel,
      audioContextState: audioContext?.state ?? "unavailable",
      meterBackend,
      meterError,
      microphone: (() => {
        const track = micStream?.getAudioTracks?.()[0];
        return track ? { enabled: track.enabled, muted: track.muted, readyState: track.readyState } : null;
      })(),
      error: lastError,
      metrics: { ...metrics, estimatedUsd: estimateVoiceCost(metrics) },
    };
  }

  function updateCaption(text, speakerId = null) {
    captionText = String(text ?? "").trim();
    if (speakerId) lastSpeakerId = speakerId;
    options.onUpdate?.(snapshot());
  }

  function stopMeter() {
    meterGeneration += 1;
    const stoppedKind = meterKind;
    if (meterFrame !== null) cancelFrame?.(meterFrame);
    meterFrame = null;
    try {
      meterSource?.disconnect?.();
    } catch {
      // A disconnected Web Audio node is already clean.
    }
    try {
      meterAnalyser?.disconnect?.();
      meterSink?.disconnect?.();
    } catch {
      // A disconnected Web Audio node is already clean.
    }
    meterSource = null;
    meterAnalyser = null;
    meterSink = null;
    meterKind = null;
    meterBackend = "none";
    rtcInputLevel = 0;
    rtcMeterPending = false;
    rtcMeterSampledAt = Number.NEGATIVE_INFINITY;
    rtcEnergySample = null;
    if (stoppedKind === "input") inputLevel = 0;
    options.onMeter?.(0, { source: stoppedKind ?? "none", backend: "none", error: meterError });
  }

  function resetLocalVad() {
    localLoudSince = null;
    localQuietSince = null;
    localSpeechStartedAt = null;
    localSpeechPeak = 0;
  }

  function setMicTrackEnabled(enabled) {
    micStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = Boolean(enabled);
    });
  }

  function getInputSender() {
    return transcriptionConnection?.peer?.getSenders?.().find((sender) => sender.track?.kind === "audio") ?? null;
  }

  function sampleRtcInputLevel(timestamp, generation) {
    const sender = getInputSender();
    if (!sender?.getStats || rtcMeterPending || timestamp - rtcMeterSampledAt < 90) return;
    rtcMeterPending = true;
    rtcMeterSampledAt = timestamp;
    void sender.getStats().then((reports) => {
      if (generation !== meterGeneration || meterKind !== "input") return;
      let nextLevel = 0;
      reports?.forEach?.((report) => {
        if (report.type !== "media-source" || (report.kind ?? report.mediaType) !== "audio") return;
        if (Number.isFinite(report.audioLevel)) {
          nextLevel = Math.max(nextLevel, Math.min(1, report.audioLevel * 5));
        }
        if (!Number.isFinite(report.totalAudioEnergy) || !Number.isFinite(report.totalSamplesDuration)) return;
        if (rtcEnergySample) {
          const energyDelta = report.totalAudioEnergy - rtcEnergySample.energy;
          const durationDelta = report.totalSamplesDuration - rtcEnergySample.duration;
          if (energyDelta >= 0 && durationDelta > 0) {
            nextLevel = Math.max(nextLevel, Math.min(1, Math.sqrt(energyDelta / durationDelta) * 5));
          }
        }
        rtcEnergySample = { energy: report.totalAudioEnergy, duration: report.totalSamplesDuration };
      });
      rtcInputLevel = nextLevel;
      if (nextLevel > 0 && meterBackend === "web-audio") meterBackend = "web-audio+webrtc";
      if (nextLevel > 0 && meterBackend === "none") meterBackend = "webrtc";
    }).catch(() => {
      // Web Audio remains the primary meter when WebRTC stats are unavailable.
    }).finally(() => {
      if (generation === meterGeneration) rtcMeterPending = false;
    });
  }

  function suspendInput({ clear = true } = {}) {
    setMicTrackEnabled(false);
    stopMeter();
    resetLocalVad();
    localTurnActive = false;
    serverTurnActive = false;
    manualTurnActive = false;
    if (clear) safeSend(transcriptionConnection?.channel, { type: "input_audio_buffer.clear" });
  }

  function resumeInput() {
    if (disposed || muted || !inputEnabled || !micStream || !transcriptionConnection || speakerQueue.active || activeOutputs.size) {
      return false;
    }
    safeSend(transcriptionConnection.channel, { type: "input_audio_buffer.clear" });
    setMicTrackEnabled(true);
    localCalibrationStartedAt = null;
    startMeter(micStream, { monitorSpeech: true });
    stateMachine.transition("listening");
    return true;
  }

  function monitorLocalVad(level, timestamp = now()) {
    if (disposed || muted || !inputEnabled || !transcriptionConnection || activeOutputs.size || speakerQueue.active) {
      resetLocalVad();
      return;
    }
    if (stateMachine.state === "listening") {
      localCalibrationStartedAt ??= timestamp;
      const calibrating = timestamp - localCalibrationStartedAt < localVadCalibrationMs;
      const startThreshold = Math.max(localVadStartLevel, localNoiseFloor * 1.7);
      const likelyLateNoise = level < startThreshold * 1.4;
      if (calibrating || level < startThreshold || likelyLateNoise) {
        const noiseSample = calibrating || likelyLateNoise ? level : Math.min(level, startThreshold);
        localNoiseFloor += (noiseSample - localNoiseFloor) * localVadNoiseAlpha;
        localLoudSince = null;
        return;
      }
      localLoudSince ??= timestamp;
      if (timestamp - localLoudSince < localVadStartMs) return;
      localTurnActive = true;
      serverTurnActive = false;
      localQuietSince = null;
      localSpeechStartedAt = timestamp;
      localSpeechPeak = level;
      beginPlayerTurn();
      return;
    }
    if (!localTurnActive || stateMachine.state !== "player_speaking") return;
    localSpeechPeak = Math.max(localSpeechPeak, level);
    const adaptiveStopLevel = Math.min(
      localSpeechPeak * 0.88,
      Math.max(localVadStopLevel, (localNoiseFloor * 1.45) + 0.001),
    );
    const reachedUtteranceLimit = localSpeechStartedAt !== null
      && timestamp - localSpeechStartedAt >= localVadMaxUtteranceMs;
    if (!reachedUtteranceLimit && level > adaptiveStopLevel) {
      localQuietSince = null;
      return;
    }
    if (reachedUtteranceLimit) {
      localTurnActive = false;
      resetLocalVad();
      finishPlayerTurn();
      return;
    }
    localQuietSince ??= timestamp;
    if (timestamp - localQuietSince < localVadStopMs) return;
    localTurnActive = false;
    resetLocalVad();
    finishPlayerTurn();
  }

  function startMeter(stream, { monitorSpeech = false } = {}) {
    stopMeter();
    if (!requestFrame || !stream) return;
    const generation = meterGeneration;
    meterKind = monitorSpeech ? "input" : "output";
    meterError = null;
    let floatSamples = null;
    let byteSamples = null;
    if (AudioContextClass) {
      try {
        audioContext ??= new AudioContextClass();
        void audioContext.resume?.().catch?.(() => {
          meterError = "audio_context_suspended";
        });
        meterAnalyser = audioContext.createAnalyser();
        meterAnalyser.fftSize = 512;
        meterAnalyser.smoothingTimeConstant = 0.72;
        meterSource = audioContext.createMediaStreamSource(stream);
        meterSource.connect(meterAnalyser);
        // Chrome can leave an analyser-only graph unprocessed. A zero-gain sink
        // keeps the graph live without playing the microphone through speakers.
        if (audioContext.createGain && audioContext.destination) {
          meterSink = audioContext.createGain();
          meterSink.gain.value = 0;
          meterAnalyser.connect(meterSink);
          meterSink.connect(audioContext.destination);
        }
        meterBackend = "web-audio";
        floatSamples = typeof meterAnalyser.getFloatTimeDomainData === "function"
          ? new Float32Array(meterAnalyser.fftSize)
          : null;
        byteSamples = floatSamples ? null : new Uint8Array(meterAnalyser.fftSize);
      } catch {
        meterError = "audio_meter_unavailable";
        meterSource = null;
        meterAnalyser = null;
        meterSink = null;
      }
    }
    if (!meterAnalyser && (!monitorSpeech || !getInputSender()?.getStats)) {
      stopMeter();
      meterError = "audio_meter_unavailable";
      return;
    }
    try {
      const tick = () => {
        let level = 0;
        if (floatSamples && meterAnalyser) {
          meterAnalyser.getFloatTimeDomainData(floatSamples);
          let meanSquare = 0;
          let peak = 0;
          for (const value of floatSamples) {
            meanSquare += value * value;
            peak = Math.max(peak, Math.abs(value));
          }
          meanSquare /= Math.max(1, floatSamples.length);
          level = Math.min(1, Math.max(Math.sqrt(meanSquare) * 4.5, peak * 1.8));
        } else if (meterAnalyser && typeof meterAnalyser.getByteTimeDomainData === "function") {
          meterAnalyser.getByteTimeDomainData(byteSamples);
          const meanSquare = byteSamples.reduce((sum, value) => {
            const normalized = (value - 128) / 128;
            return sum + (normalized * normalized);
          }, 0) / Math.max(1, byteSamples.length);
          level = Math.min(1, Math.sqrt(meanSquare) * 4);
        } else if (meterAnalyser) {
          meterAnalyser.getByteFrequencyData(byteSamples);
          const average = byteSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, byteSamples.length);
          level = Math.min(1, average / 150);
        }
        if (monitorSpeech) {
          sampleRtcInputLevel(now(), generation);
          level = Math.max(level, rtcInputLevel);
        }
        if (monitorSpeech) inputLevel = level;
        options.onMeter?.(level, {
          source: monitorSpeech ? "input" : "output",
          backend: meterBackend,
          error: meterError,
        });
        if (monitorSpeech) monitorLocalVad(level);
        meterFrame = requestFrame(tick);
      };
      meterFrame = requestFrame(tick);
    } catch {
      meterError = "audio_meter_failed";
      stopMeter();
    }
  }

  async function requestClientSecret(purpose, speakerId = null) {
    if (!fetchImpl) throw new Error("voice_unsupported");
    const response = await fetchImpl("/api/realtime/client-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, locale, speakerId }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.value !== "string" || !data.value.startsWith("ek_")) {
      throw new Error(data.error ?? "voice_session_failed");
    }
    return data.value;
  }

  function waitForDataChannel(channel, timeoutMs = 15_000) {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimer?.(() => reject(new Error("voice_channel_timeout")), timeoutMs);
      addListener(channel, "open", () => {
        if (timeout) clearTimer?.(timeout);
        resolve();
      }, { once: true });
      addListener(channel, "error", () => {
        if (timeout) clearTimer?.(timeout);
        reject(new Error("voice_channel_failed"));
      }, { once: true });
    });
  }

  function closeConnection(connection) {
    if (!connection || connection.closed) return;
    connection.closed = true;
    if (connection.counted) recordSessionEnded(metrics, connection.purpose);
    try {
      connection.channel?.close?.();
    } catch {
      // Closing is idempotent across browsers.
    }
    try {
      connection.peer?.close?.();
    } catch {
      // Closing is idempotent across browsers.
    }
    try {
      connection.audio?.pause?.();
      connection.audio.srcObject = null;
      connection.audio.remove?.();
    } catch {
      // Detached audio elements may already be gone.
    }
  }

  async function negotiate({ purpose, speakerId = null, stream = null, onEvent = () => {}, onTrack = () => {} }) {
    if (!PeerConnection) throw new Error("voice_unsupported");
    const ephemeralSecret = await requestClientSecret(purpose, speakerId);
    const peer = new PeerConnection();
    const channel = peer.createDataChannel("oai-events");
    const audio = purpose === "speech" && AudioElement ? new AudioElement() : null;
    const connection = { purpose, speakerId, peer, channel, audio, counted: false, closed: false };

    if (audio) {
      audio.autoplay = true;
      audio.playsInline = true;
    }
    addListener(channel, "message", (event) => {
      try {
        onEvent(JSON.parse(event.data), connection);
      } catch {
        // Ignore malformed upstream events without breaking the call.
      }
    });
    peer.ontrack = (event) => {
      const remoteStream = event.streams?.[0];
      if (audio && remoteStream) audio.srcObject = remoteStream;
      onTrack(remoteStream, connection);
    };
    if (stream) {
      const track = stream.getAudioTracks?.()[0] ?? stream.getTracks?.()[0];
      if (!track) throw new Error("microphone_missing");
      peer.addTrack(track, stream);
    } else {
      peer.addTransceiver?.("audio", { direction: "recvonly" });
    }

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpResponse = await fetchImpl(REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) throw new Error("voice_negotiation_failed");
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
      await waitForDataChannel(channel);
      connection.counted = true;
      recordSessionStarted(metrics, purpose);
      return connection;
    } catch (error) {
      closeConnection(connection);
      throw error;
    }
  }

  function applyUsage(event) {
    const usage = event.response?.usage;
    metrics.inputAudioTokens += Number(usage?.input_token_details?.audio_tokens) || 0;
    metrics.outputAudioTokens += Number(usage?.output_token_details?.audio_tokens) || 0;
  }

  function finishOutput(output, completed, reason = completed ? "completed" : "interrupted") {
    if (!output || output.finished) return;
    output.finished = true;
    if (output.finishTimer) clearTimer?.(output.finishTimer);
    if (output.startTimer) clearTimer?.(output.startTimer);
    if (output.playbackTimer) clearTimer?.(output.playbackTimer);
    closeConnection(output.connection);
    activeOutputs.delete(output.id);
    if (!activeOutputs.size) {
      paused = false;
      activeSpeakerId = null;
      if (!disposed && stateMachine.state !== "player_speaking") stateMachine.transition("processing");
    } else if (!disposed && stateMachine.state !== "player_speaking") {
      stateMachine.transition(paused ? "paused" : "ai_speaking");
    }
    output.resolve({ completed, reason, transcript: output.transcript.trim() });
  }

  function schedulePlaybackFallback(output) {
    if (!output?.responseDone || !output.started || output.finished || output.playbackTimer) return;
    const elapsed = Math.max(0, now() - (output.playbackStartedAt ?? now()));
    const remaining = Math.max(500, estimatePlaybackDurationMs(output.item.text, locale) - elapsed + 850);
    output.playbackTimer = setTimer?.(() => {
      output.playbackTimer = null;
      finishOutput(output, true, "estimated_playback_complete");
    }, remaining);
  }

  function interruptSpeech(reason = "barge_in") {
    outputEpoch += 1;
    speakerQueue.interrupt(reason);
    const outputs = [...activeOutputs.values()];
    outputs.forEach((output) => {
      safeSend(output.connection?.channel, { type: "response.cancel" });
      safeSend(output.connection?.channel, { type: "output_audio_buffer.clear" });
      output.connection?.audio?.pause?.();
      finishOutput(output, false, reason);
    });
    return outputs.length > 0;
  }

  function beginPlayerTurn({ manual = false } = {}) {
    if (disposed || muted || !inputEnabled || !transcriptionConnection) return false;
    interruptSpeech("barge_in");
    manualTurnActive = manual;
    if (manual) {
      safeSend(transcriptionConnection.channel, { type: "input_audio_buffer.clear" });
    }
    updateCaption("");
    stateMachine.transition("player_speaking");
    return true;
  }

  function finishPlayerTurn({ commit = true } = {}) {
    if (disposed || !transcriptionConnection) return false;
    manualTurnActive = false;
    localTurnActive = false;
    resetLocalVad();
    stateMachine.transition("processing");
    const sent = safeSend(transcriptionConnection.channel, {
      type: commit ? "input_audio_buffer.commit" : "input_audio_buffer.clear",
    });
    if (sent && commit) startTranscriptionTimeout();
    return sent;
  }

  function startTranscriptionTimeout() {
    if (transcriptionTimer) clearTimer?.(transcriptionTimer);
    transcriptionTimer = setTimer?.(() => {
      transcriptionTimer = null;
      lastError = "no_speech_detected";
      if (!disposed && transcriptionConnection && !speakerQueue.active) stateMachine.transition("listening");
    }, transcriptionTimeoutMs);
  }

  function toggleTalking() {
    if (manualTurnActive) return finishPlayerTurn();
    return beginPlayerTurn({ manual: true });
  }

  async function playSpeech(item, epoch = outputEpoch) {
    if (disposed) return { completed: false, reason: "ended" };
    // Keep the call half-duplex: AI playback must never be captured as the
    // player's next utterance. A fresh input buffer starts after the queue idles.
    suspendInput();
    const output = {
      id: `voice-output-${outputSequence += 1}`,
      connection: null,
      item,
      transcript: "",
      started: false,
      finished: false,
      finishTimer: null,
      startTimer: null,
      playbackTimer: null,
      playbackStartedAt: null,
      responseDone: false,
      resolve: null,
    };
    const beginPlayback = (stream = null) => {
      if (output.finished || output.started) return;
      output.started = true;
      output.playbackStartedAt = now();
      if (output.startTimer) clearTimer?.(output.startTimer);
      output.startTimer = null;
      activeSpeakerId = item.speakerId;
      lastSpeakerId = item.speakerId;
      if (stream) startMeter(stream, { monitorSpeech: false });
      stateMachine.transition(paused ? "paused" : "ai_speaking");
      schedulePlaybackFallback(output);
    };
    let remoteStream = null;
    try {
      const connection = await negotiate({
        purpose: "speech",
        speakerId: item.speakerId,
        onTrack(stream, outputConnection) {
          remoteStream = stream;
          addListener(outputConnection.audio, "playing", () => beginPlayback(stream));
        },
        onEvent(event) {
          if (event.type === "output_audio_buffer.started") beginPlayback(remoteStream);
          if (event.type === "response.output_audio_transcript.delta") {
            output.transcript += event.delta ?? "";
            updateCaption(output.transcript, item.speakerId);
          }
          if (event.type === "response.output_audio_transcript.done") {
            output.transcript = event.transcript ?? output.transcript;
            updateCaption(output.transcript, item.speakerId);
          }
          if (event.type === "response.done") {
            applyUsage(event);
            const completed = event.response?.status === "completed";
            if (!completed) finishOutput(output, false, event.response?.status ?? "failed");
            else {
              output.responseDone = true;
              if (output.started) schedulePlaybackFallback(output);
              else {
                output.startTimer = setTimer?.(
                  () => finishOutput(output, false, "audio_playback_missing"),
                  PLAYBACK_START_TIMEOUT_MS,
                );
              }
            }
            // Generation completing can precede WebRTC playback. Never close
            // the connection until playback starts and then stops (or the
            // duration-based fallback confirms the line had time to finish).
          }
          if (event.type === "output_audio_buffer.stopped") finishOutput(output, true);
          if (event.type === "error") finishOutput(output, false, "voice_output_failed");
        },
      });
      output.connection = connection;
      if (disposed || epoch !== outputEpoch) {
        closeConnection(connection);
        return { completed: false, reason: "interrupted" };
      }
      let resolveOutput;
      const result = new Promise((resolve) => {
        resolveOutput = resolve;
      });
      output.resolve = resolveOutput;
      activeOutputs.set(output.id, output);
      addListener(connection.audio, "playing", () => beginPlayback(remoteStream));
      addListener(connection.audio, "ended", () => finishOutput(output, true));
      addListener(connection.audio, "error", () => finishOutput(output, false, "audio_playback_failed"));
      const instruction = [
        SPEAKER_STYLE[item.speakerId],
        "Read the following line exactly once. Do not add or omit words.",
        JSON.stringify(String(item.text).slice(0, 180)),
      ].join("\n");
      if (!safeSend(connection.channel, {
        type: "response.create",
        response: {
          conversation: "none",
          output_modalities: ["audio"],
          instructions: instruction,
        },
      })) throw new Error("voice_channel_closed");
      output.finishTimer = setTimer?.(() => finishOutput(output, false, "voice_output_timeout"), outputTimeoutMs);
      return await result;
    } catch (error) {
      if (activeOutputs.has(output.id)) finishOutput(output, false, "voice_output_failed");
      throw error;
    }
  }

  const speakerQueue = createSpeakerQueue(playSpeech, {
    onIdle() {
      if (!disposed && transcriptionConnection && !activeOutputs.size && stateMachine.state !== "player_speaking") resumeInput();
    },
    onInterrupt() {
      activeOutputs.forEach((output) => output.connection?.audio?.pause?.());
    },
  });

  const transcriptGate = createFinalTranscriptGate(async (utterance) => {
    if (disposed) return;
    metrics.finalizedUtterances += 1;
    stateMachine.transition("processing");
    updateCaption(utterance.text);
    await options.onFinalTranscript?.(utterance);
    if (!disposed && transcriptionConnection && !speakerQueue.active) resumeInput();
  });

  function handleTranscriptionEvent(event) {
    if (event.type === "input_audio_buffer.speech_started") {
      if (activeOutputs.size || speakerQueue.active || !inputEnabled) return;
      serverTurnActive = true;
      localTurnActive = false;
      resetLocalVad();
      beginPlayerTurn({ manual: manualTurnActive });
    }
    if (event.type === "input_audio_buffer.speech_stopped") {
      serverTurnActive = false;
      localTurnActive = false;
      resetLocalVad();
      manualTurnActive = false;
      stateMachine.transition("processing");
      startTranscriptionTimeout();
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      updateCaption(`${captionText}${event.delta ?? ""}`);
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (transcriptionTimer) clearTimer?.(transcriptionTimer);
      transcriptionTimer = null;
      lastError = null;
      serverTurnActive = false;
      localTurnActive = false;
      resetLocalVad();
      const accepted = transcriptGate.accept({ id: event.item_id, text: event.transcript });
      if (!accepted && !disposed && transcriptionConnection) stateMachine.transition("listening");
    }
    if (event.type === "error") {
      if (transcriptionTimer) clearTimer?.(transcriptionTimer);
      transcriptionTimer = null;
      const errorCode = event.error?.code ?? "voice_transcription_failed";
      if (RECOVERABLE_TRANSCRIPTION_ERRORS.has(errorCode)) {
        lastError = "no_speech_detected";
        manualTurnActive = false;
        localTurnActive = false;
        serverTurnActive = false;
        resetLocalVad();
        if (!disposed && transcriptionConnection && !activeOutputs.size) stateMachine.transition("listening");
        return;
      }
      lastError = errorCode;
      stateMachine.transition("reconnecting", lastError);
      scheduleReconnect();
    }
  }

  function closeTranscription() {
    if (!transcriptionConnection) return;
    closeConnection(transcriptionConnection);
    transcriptionConnection = null;
    if (transcriptionTimer) clearTimer?.(transcriptionTimer);
    transcriptionTimer = null;
    manualTurnActive = false;
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimer?.(() => {
      reconnectTimer = null;
      void reconnect().catch(() => {
        lastError = "voice_reconnect_failed";
        stateMachine.transition("fallback_text", lastError);
        options.onFallback?.(lastError);
      });
    }, 1_200);
  }

  async function prepare() {
    if (micStream) return true;
    if (!mediaDevices?.getUserMedia || !PeerConnection || !fetchImpl) {
      lastError = "voice_unsupported";
      stateMachine.transition("fallback_text", lastError);
      options.onFallback?.(lastError);
      return false;
    }
    stateMachine.transition("requesting_permission");
    let permissionTimer = null;
    let permissionTimedOut = false;
    const mediaRequest = mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    mediaRequest.then((lateStream) => {
      if (!permissionTimedOut && !disposed) return;
      lateStream.getTracks?.().forEach((track) => track.stop());
    }).catch(() => {});
    try {
      const timeout = new Promise((_, reject) => {
        permissionTimer = setTimer?.(() => {
          permissionTimedOut = true;
          reject(new Error("microphone_timeout"));
        }, permissionTimeoutMs);
      });
      micStream = await Promise.race([mediaRequest, timeout]);
      if (permissionTimer) clearTimer?.(permissionTimer);
      micStream.getAudioTracks().forEach((track) => { track.enabled = false; });
      if (AudioContextClass) {
        try {
          audioContext ??= new AudioContextClass();
          await audioContext.resume?.();
        } catch {
          // Manual turn controls still work when Web Audio metering is unavailable.
        }
      }
      stateMachine.transition("idle");
      return true;
    } catch (error) {
      if (permissionTimer) clearTimer?.(permissionTimer);
      lastError = error?.name === "NotAllowedError"
        ? "microphone_denied"
        : error?.message === "microphone_timeout"
          ? "microphone_timeout"
          : "microphone_unavailable";
      stateMachine.transition("fallback_text", lastError);
      options.onFallback?.(lastError);
      return false;
    }
  }

  async function connect() {
    if (disposed) throw new Error("voice_ended");
    if (transcriptionConnection) return true;
    if (!micStream && !await prepare()) return false;
    stateMachine.transition("connecting");
    options.soundController?.setDucking?.(true);
    try {
      transcriptionConnection = await negotiate({
        purpose: "transcription",
        stream: micStream,
        onEvent: handleTranscriptionEvent,
      });
      transcriptionConnection.peer.onconnectionstatechange = () => {
        if (!["failed", "disconnected"].includes(transcriptionConnection?.peer.connectionState)) return;
        stateMachine.transition("reconnecting");
        scheduleReconnect();
      };
      setMicTrackEnabled(!muted && inputEnabled);
      if (!muted && inputEnabled) startMeter(micStream, { monitorSpeech: true });
      lastError = null;
      stateMachine.transition("listening");
      return true;
    } catch (error) {
      closeTranscription();
      lastError = error?.message ?? "voice_connection_failed";
      const fallbackReason = lastError;
      end({ fallback: true });
      options.onFallback?.(fallbackReason);
      return false;
    }
  }

  async function reconnect() {
    if (disposed) return false;
    closeTranscription();
    stateMachine.transition("reconnecting");
    return connect();
  }

  function setMuted(nextMuted = !muted) {
    muted = Boolean(nextMuted);
    setMicTrackEnabled(!muted && inputEnabled && !speakerQueue.active && !activeOutputs.size);
    if (muted && (manualTurnActive || localTurnActive || serverTurnActive)) finishPlayerTurn({ commit: false });
    if (!muted) resumeInput();
    options.onUpdate?.(snapshot());
    return muted;
  }

  function setInputEnabled(nextEnabled) {
    inputEnabled = Boolean(nextEnabled);
    if (inputEnabled) resumeInput();
    else suspendInput();
    options.onUpdate?.(snapshot());
    return inputEnabled;
  }

  async function setPaused(nextPaused = !paused) {
    paused = Boolean(nextPaused);
    const outputs = [...activeOutputs.values()].filter((output) => output.connection?.audio);
    if (!outputs.length) {
      options.onUpdate?.(snapshot());
      return paused;
    }
    if (paused) {
      outputs.forEach((output) => output.connection.audio.pause());
      stateMachine.transition("paused");
    } else {
      await Promise.all(outputs.map((output) => output.connection.audio.play()));
      stateMachine.transition("ai_speaking");
    }
    return paused;
  }

  function setCaptions(nextEnabled = !captionsEnabled) {
    captionsEnabled = Boolean(nextEnabled);
    options.onUpdate?.(snapshot());
    return captionsEnabled;
  }

  async function speak(speakerId, text, options = {}) {
    if (!SPEAKER_STYLE[speakerId] || !String(text ?? "").trim()) return { completed: false, reason: "invalid_speech" };
    return speakerQueue.enqueue({ speakerId, text: String(text).trim(), emotion: options.emotion ?? "neutral" });
  }

  function end({ fallback = false } = {}) {
    if (disposed) return snapshot();
    disposed = true;
    if (reconnectTimer) clearTimer?.(reconnectTimer);
    reconnectTimer = null;
    speakerQueue.clear("ended");
    interruptSpeech("ended");
    closeTranscription();
    micStream?.getTracks?.().forEach((track) => track.stop());
    micStream = null;
    stopMeter();
    void audioContext?.close?.();
    audioContext = null;
    transcriptGate.clear();
    options.soundController?.setDucking?.(false);
    stateMachine.transition(fallback ? "fallback_text" : "ended");
    const finalSnapshot = snapshot();
    options.onMetrics?.(finalSnapshot.metrics);
    return finalSnapshot;
  }

  return {
    snapshot,
    prepare,
    connect,
    reconnect,
    speak,
    interruptSpeech,
    toggleTalking,
    setMuted,
    setInputEnabled,
    setPaused,
    setCaptions,
    end,
    whenTranscriptsIdle: () => transcriptGate.whenIdle(),
  };
}
