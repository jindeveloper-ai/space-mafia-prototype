import {
  createFinalTranscriptGate,
  createSpeakerQueue,
  createVoiceMetrics,
  createVoiceStateMachine,
  estimateVoiceCost,
  recordSessionEnded,
  recordSessionStarted,
} from "./voice-call-core.js?v=0.18.0";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const SPEAKER_STYLE = {
  mina: "Use a bright, slightly fast fandom-chat rhythm without sounding childish.",
  juno: "Use a calm, measured rhythm and make the reasoning easy to follow.",
  noel: "Use a natural, lightly playful rhythm with an observant edge.",
};
const LOCAL_VAD_START_LEVEL = 0.016;
const LOCAL_VAD_STOP_LEVEL = 0.009;
const LOCAL_VAD_START_MS = 180;
const LOCAL_VAD_STOP_MS = 720;
const RECOVERABLE_TRANSCRIPTION_ERRORS = new Set([
  "input_audio_buffer_commit_empty",
]);

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
  let meterSource = null;
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
      audioContextState: audioContext?.state ?? "unavailable",
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
    if (meterFrame !== null) cancelFrame?.(meterFrame);
    meterFrame = null;
    try {
      meterSource?.disconnect?.();
    } catch {
      // A disconnected Web Audio node is already clean.
    }
    meterSource = null;
    options.onMeter?.(0);
  }

  function resetLocalVad() {
    localLoudSince = null;
    localQuietSince = null;
  }

  function setMicTrackEnabled(enabled) {
    micStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = Boolean(enabled);
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
      if (level < localVadStartLevel) {
        localLoudSince = null;
        return;
      }
      localLoudSince ??= timestamp;
      if (timestamp - localLoudSince < localVadStartMs) return;
      localTurnActive = true;
      serverTurnActive = false;
      localQuietSince = null;
      beginPlayerTurn();
      return;
    }
    if (!localTurnActive || stateMachine.state !== "player_speaking") return;
    if (level > localVadStopLevel) {
      localQuietSince = null;
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
    if (!AudioContextClass || !requestFrame || !stream) return;
    try {
      audioContext ??= new AudioContextClass();
      void audioContext.resume?.().catch?.(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      meterSource = audioContext.createMediaStreamSource(stream);
      meterSource.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        let level = 0;
        if (typeof analyser.getByteTimeDomainData === "function") {
          analyser.getByteTimeDomainData(samples);
          const meanSquare = samples.reduce((sum, value) => {
            const normalized = (value - 128) / 128;
            return sum + (normalized * normalized);
          }, 0) / Math.max(1, samples.length);
          level = Math.min(1, Math.sqrt(meanSquare) * 4);
        } else {
          analyser.getByteFrequencyData(samples);
          const average = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
          level = Math.min(1, average / 150);
        }
        options.onMeter?.(level);
        if (monitorSpeech) monitorLocalVad(level);
        meterFrame = requestFrame(tick);
      };
      meterFrame = requestFrame(tick);
    } catch {
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
      resolve: null,
    };
    const beginPlayback = (stream = null) => {
      if (output.finished || output.started) return;
      output.started = true;
      activeSpeakerId = item.speakerId;
      lastSpeakerId = item.speakerId;
      if (stream) startMeter(stream, { monitorSpeech: false });
      stateMachine.transition(paused ? "paused" : "ai_speaking");
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
            else if (!output.started) finishOutput(output, true);
            // Generation completing does not mean remote playback completed.
            // Wait for the buffer/audio completion signal instead of cutting
            // long lines after an arbitrary three-second grace period.
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
