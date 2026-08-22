import {
  createFinalTranscriptGate,
  createLocalVoiceActivityDetector,
  createSpeakerQueue,
  createVoiceMetrics,
  createVoiceStateMachine,
  estimateVoiceCost,
  recordSessionEnded,
  recordSessionStarted,
} from "./voice-call-core.js?v=0.17.3";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const SPEAKER_STYLE = {
  mina: "Use a bright, slightly fast fandom-chat rhythm without sounding childish.",
  juno: "Use a calm, measured rhythm and make the reasoning easy to follow.",
  noel: "Use a natural, lightly playful rhythm with an observant edge.",
};

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
  const now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
  const permissionTimeoutMs = options.permissionTimeoutMs ?? 12_000;
  const transcriptionTimeoutMs = options.transcriptionTimeoutMs ?? 8_000;
  const locale = options.locale === "en" ? "en" : "ko";
  const metrics = createVoiceMetrics();
  const stateMachine = createVoiceStateMachine(() => options.onUpdate?.(snapshot()));
  const voiceActivityDetector = createLocalVoiceActivityDetector(options.voiceActivity);

  let micStream = null;
  let transcriptionConnection = null;
  let currentOutput = null;
  let reconnectTimer = null;
  let transcriptionTimer = null;
  let audioContext = null;
  let meterFrame = null;
  let meterSource = null;
  let muted = false;
  let paused = false;
  let captionsEnabled = true;
  let captionText = "";
  let activeSpeakerId = null;
  let lastSpeakerId = "mina";
  let disposed = false;
  let lastError = null;
  let manualTurnActive = false;

  function snapshot() {
    return {
      state: stateMachine.state,
      muted,
      paused,
      captionsEnabled,
      captionText,
      activeSpeakerId,
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

  function startMeter(stream) {
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
      const isMicrophone = stream === micStream;
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
        if (isMicrophone && transcriptionConnection && !manualTurnActive) {
          const activity = voiceActivityDetector.sample(muted ? 0 : level, now());
          if (activity?.type === "speech_started") {
            beginPlayerTurn();
          }
          if (activity?.type === "speech_stopped") {
            finishPlayerTurn({ commit: activity.commit });
          }
        }
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

  function finishOutput(completed, reason = completed ? "completed" : "interrupted") {
    const output = currentOutput;
    if (!output || output.finished) return;
    output.finished = true;
    if (output.finishTimer) clearTimer?.(output.finishTimer);
    closeConnection(output.connection);
    currentOutput = null;
    paused = false;
    activeSpeakerId = null;
    if (micStream && transcriptionConnection) startMeter(micStream);
    if (!disposed && stateMachine.state !== "player_speaking") stateMachine.transition("processing");
    output.resolve({ completed, reason, transcript: output.transcript.trim() });
  }

  function interruptSpeech(reason = "barge_in") {
    speakerQueue.interrupt(reason);
    if (!currentOutput) return false;
    safeSend(currentOutput.connection.channel, { type: "response.cancel" });
    safeSend(currentOutput.connection.channel, { type: "output_audio_buffer.clear" });
    currentOutput.connection.audio?.pause?.();
    finishOutput(false, reason);
    return true;
  }

  function beginPlayerTurn({ manual = false } = {}) {
    if (disposed || muted || !transcriptionConnection) return false;
    interruptSpeech("barge_in");
    manualTurnActive = manual;
    if (manual) {
      voiceActivityDetector.reset();
      safeSend(transcriptionConnection.channel, { type: "input_audio_buffer.clear" });
    }
    updateCaption("");
    stateMachine.transition("player_speaking");
    return true;
  }

  function finishPlayerTurn({ commit = true } = {}) {
    if (disposed || !transcriptionConnection) return false;
    manualTurnActive = false;
    voiceActivityDetector.reset();
    stateMachine.transition("processing");
    const sent = safeSend(transcriptionConnection.channel, {
      type: commit ? "input_audio_buffer.commit" : "input_audio_buffer.clear",
    });
    if (transcriptionTimer) clearTimer?.(transcriptionTimer);
    transcriptionTimer = null;
    if (sent && commit) {
      transcriptionTimer = setTimer?.(() => {
        transcriptionTimer = null;
        lastError = "no_speech_detected";
        if (!disposed && transcriptionConnection && !speakerQueue.active) stateMachine.transition("listening");
      }, transcriptionTimeoutMs);
    }
    return sent;
  }

  function toggleTalking() {
    if (manualTurnActive) return finishPlayerTurn();
    return beginPlayerTurn({ manual: true });
  }

  async function playSpeech(item) {
    if (disposed) return { completed: false, reason: "ended" };
    const beginPlayback = (stream = null) => {
      if (!currentOutput || currentOutput.started) return;
      currentOutput.started = true;
      activeSpeakerId = item.speakerId;
      lastSpeakerId = item.speakerId;
      if (stream) startMeter(stream);
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
            currentOutput.transcript += event.delta ?? "";
            updateCaption(currentOutput.transcript, item.speakerId);
          }
          if (event.type === "response.output_audio_transcript.done") {
            currentOutput.transcript = event.transcript ?? currentOutput.transcript;
            updateCaption(currentOutput.transcript, item.speakerId);
          }
          if (event.type === "response.done") {
            applyUsage(event);
            const completed = event.response?.status === "completed";
            if (!completed) finishOutput(false, event.response?.status ?? "failed");
            else if (!currentOutput.started) finishOutput(true);
            else {
              if (currentOutput.finishTimer) clearTimer?.(currentOutput.finishTimer);
              currentOutput.finishTimer = setTimer?.(() => finishOutput(true), 3_000);
            }
          }
          if (event.type === "output_audio_buffer.stopped") finishOutput(true);
          if (event.type === "error") finishOutput(false, "voice_output_failed");
        },
      });
      let resolveOutput;
      const result = new Promise((resolve) => {
        resolveOutput = resolve;
      });
      currentOutput = {
        connection,
        item,
        transcript: "",
        started: false,
        finished: false,
        finishTimer: null,
        resolve: resolveOutput,
      };
      addListener(connection.audio, "playing", () => beginPlayback(remoteStream));
      addListener(connection.audio, "error", () => finishOutput(false, "audio_playback_failed"));
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
      currentOutput.finishTimer = setTimer?.(() => finishOutput(false, "voice_output_timeout"), 45_000);
      return await result;
    } catch (error) {
      if (currentOutput) finishOutput(false, "voice_output_failed");
      throw error;
    }
  }

  const speakerQueue = createSpeakerQueue(playSpeech, {
    onIdle() {
      if (!disposed && transcriptionConnection && stateMachine.state !== "player_speaking") {
        stateMachine.transition("listening");
      }
    },
    onInterrupt() {
      if (currentOutput) currentOutput.connection.audio?.pause?.();
    },
  });

  const transcriptGate = createFinalTranscriptGate(async (utterance) => {
    if (disposed) return;
    metrics.finalizedUtterances += 1;
    stateMachine.transition("processing");
    updateCaption(utterance.text);
    await options.onFinalTranscript?.(utterance);
    if (!disposed && transcriptionConnection && !speakerQueue.active) stateMachine.transition("listening");
  });

  function handleTranscriptionEvent(event) {
    if (event.type === "input_audio_buffer.speech_started") {
      beginPlayerTurn();
    }
    if (event.type === "input_audio_buffer.speech_stopped") stateMachine.transition("processing");
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      updateCaption(`${captionText}${event.delta ?? ""}`);
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (transcriptionTimer) clearTimer?.(transcriptionTimer);
      transcriptionTimer = null;
      lastError = null;
      const accepted = transcriptGate.accept({ id: event.item_id, text: event.transcript });
      if (!accepted && !disposed && transcriptionConnection) stateMachine.transition("listening");
    }
    if (event.type === "error") {
      if (transcriptionTimer) clearTimer?.(transcriptionTimer);
      transcriptionTimer = null;
      lastError = event.error?.code ?? "voice_transcription_failed";
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
    voiceActivityDetector.reset();
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
      micStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      startMeter(micStream);
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
    micStream?.getAudioTracks?.().forEach((track) => { track.enabled = !muted; });
    if (muted && manualTurnActive) finishPlayerTurn({ commit: false });
    options.onUpdate?.(snapshot());
    return muted;
  }

  async function setPaused(nextPaused = !paused) {
    paused = Boolean(nextPaused);
    if (!currentOutput?.connection.audio) {
      options.onUpdate?.(snapshot());
      return paused;
    }
    if (paused) {
      currentOutput.connection.audio.pause();
      stateMachine.transition("paused");
    } else {
      await currentOutput.connection.audio.play();
      stateMachine.transition("ai_speaking");
    }
    return paused;
  }

  function setCaptions(nextEnabled = !captionsEnabled) {
    captionsEnabled = Boolean(nextEnabled);
    options.onUpdate?.(snapshot());
    return captionsEnabled;
  }

  async function speak(speakerId, text) {
    if (!SPEAKER_STYLE[speakerId] || !String(text ?? "").trim()) return { completed: false, reason: "invalid_speech" };
    return speakerQueue.enqueue({ speakerId, text: String(text).trim() });
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
    setPaused,
    setCaptions,
    end,
    whenTranscriptsIdle: () => transcriptGate.whenIdle(),
  };
}
