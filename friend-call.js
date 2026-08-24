import { createCallAudioEffectsController } from "./call-audio-effects.js?v=0.20.6";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const ANSWER_DELAY_MS = Object.freeze({ mina: 1_800, juno: 2_700, noel: 2_200 });
const OPENING_LINES = Object.freeze({
  ko: Object.freeze({
    mina: Object.freeze([
      "여보세요? 어... 받았어. 전화는 처음이라 좀 어색하네ㅋㅋ",
      "여보세요? 어, 또 전화했네ㅋㅋ 뭐 하고 있었음?",
      "여보세요? 야, 타이밍 좋네ㅋㅋ 뭐 하다 걸었어?",
      "여보세요? 야 드디어 왔네ㅋㅋ 오늘은 뭔 얘기부터 할 건데?",
    ]),
    juno: Object.freeze([
      "여보세요? 어... 연결됐네. 전화는 처음이라 살짝 어색하긴 하다.",
      "여보세요? 어, 또 걸었네. 무슨 얘기부터 할까?",
      "여보세요? 오, 타이밍 괜찮네. 오늘은 뭐부터 얘기할래?",
      "여보세요? 왔네. 오늘도 할 말 생겨서 건 거지?",
    ]),
    noel: Object.freeze([
      "여보세요? 오... 진짜 전화했네ㅋㅋ 처음이라 좀 신기하다.",
      "여보세요? 오, 또 왔네ㅋㅋ 뭐 하다 걸었어?",
      "여보세요? 야 딱 심심했는데ㅋㅋ 오늘 무슨 일 있었어?",
      "여보세요? 야 왜 이제 걸었냐ㅋㅋ 오늘 얘깃거리 뭐임?",
    ]),
  }),
  en: Object.freeze({
    mina: Object.freeze([
      "Hello? Oh... you actually called. First voice call, so this is kinda awkward, lol.",
      "Hello? Hey, calling again? What were you up to?",
      "Hello? Nice timing. What were you doing before this?",
      "Hello? Finally, you're here. What are we talking about first?",
    ]),
    juno: Object.freeze([
      "Hello? Okay... we're connected. First call, so this feels a little weird.",
      "Hello? You called again. Where do you want to start?",
      "Hello? Good timing. What do you want to unpack today?",
      "Hello? There you are. You called because something happened, right?",
    ]),
    noel: Object.freeze([
      "Hello? Oh... you really called, lol. First time, so this is kinda funny.",
      "Hello? Hey, you're back. What were you doing?",
      "Hello? Perfect timing, I was getting bored. What happened today?",
      "Hello? Took you long enough, lol. What's today's story?",
    ]),
  }),
});

function openingTier(relationshipDays) {
  if (relationshipDays <= 0) return 0;
  if (relationshipDays <= 2) return 1;
  if (relationshipDays <= 6) return 2;
  return 3;
}

export function friendCallOpeningLine(characterId, locale = "ko", relationshipDays = 0) {
  const safeLocale = locale === "en" ? "en" : "ko";
  const safeCharacterId = ["mina", "juno", "noel"].includes(characterId) ? characterId : "mina";
  return OPENING_LINES[safeLocale][safeCharacterId][openingTier(Number(relationshipDays) || 0)];
}

function addListener(target, type, handler, options) {
  target?.addEventListener?.(type, handler, options);
}

function sendEvent(channel, event) {
  if (channel?.readyState !== "open") return false;
  channel.send(JSON.stringify(event));
  return true;
}

function waitForChannel(channel, setTimer, clearTimer, timeoutMs = 15_000) {
  if (channel?.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimer(() => reject(new Error("friend_call_channel_timeout")), timeoutMs);
    addListener(channel, "open", () => {
      clearTimer(timeout);
      resolve();
    }, { once: true });
    addListener(channel, "error", () => {
      clearTimer(timeout);
      reject(new Error("friend_call_channel_failed"));
    }, { once: true });
  });
}

export function createFriendCallController(options = {}) {
  const characterId = ["mina", "juno", "noel"].includes(options.characterId) ? options.characterId : "mina";
  const locale = options.locale === "en" ? "en" : "ko";
  const mediaDevices = options.mediaDevices ?? globalThis.navigator?.mediaDevices;
  const PeerConnection = options.PeerConnection ?? globalThis.RTCPeerConnection;
  const AudioElement = options.AudioElement ?? globalThis.Audio;
  const AudioContextClass = options.AudioContextClass ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const setTimer = options.setTimer ?? globalThis.setTimeout.bind(globalThis);
  const clearTimer = options.clearTimer ?? globalThis.clearTimeout.bind(globalThis);
  const setRepeating = options.setRepeating ?? globalThis.setInterval.bind(globalThis);
  const clearRepeating = options.clearRepeating ?? globalThis.clearInterval.bind(globalThis);
  const now = options.now ?? Date.now;
  const relationshipDays = Math.max(0, Math.min(30, Number(options.relationshipDays) || 0));
  const audioEffects = options.audioEffectsController ?? createCallAudioEffectsController({
    AudioContextClass,
    AudioClass: AudioElement,
    enabled: options.callEffectsEnabled,
  });

  let phase = "idle";
  let micStream = null;
  let connection = null;
  let ringContext = null;
  let ringTimer = null;
  let quotaTimer = null;
  let startedAt = null;
  let remainingSeconds = Math.max(0, Math.min(300, Number(options.remainingSeconds) || 300));
  let pendingUsageSeconds = 0;
  let muted = false;
  let captionText = "";
  let playerTranscript = "";
  let lastError = null;
  let dateKey = null;
  let disposed = false;

  function snapshot() {
    return {
      characterId,
      phase,
      connected: Boolean(connection),
      muted,
      callEffectsEnabled: audioEffects.snapshot().enabled,
      captionText,
      playerTranscript,
      remainingSeconds,
      elapsedSeconds: startedAt === null ? 0 : Math.max(0, Math.floor((now() - startedAt) / 1_000)),
      dateKey,
      error: lastError,
    };
  }

  function notify() {
    options.onUpdate?.(snapshot());
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    notify();
  }

  function stopRinging() {
    if (ringTimer !== null) clearRepeating(ringTimer);
    ringTimer = null;
    void ringContext?.close?.().catch?.(() => {});
    ringContext = null;
  }

  function ringPulse() {
    if (!ringContext?.createOscillator || !ringContext?.createGain) return;
    const start = ringContext.currentTime;
    for (const [index, frequency] of [425, 450].entries()) {
      const oscillator = ringContext.createOscillator();
      const gain = ringContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.015);
      gain.gain.setValueAtTime(0.055, start + 0.16 + (index * 0.16));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28 + (index * 0.16));
      oscillator.connect(gain);
      gain.connect(ringContext.destination);
      oscillator.start(start + (index * 0.16));
      oscillator.stop(start + 0.3 + (index * 0.16));
    }
  }

  async function startRinging() {
    if (!AudioContextClass) return;
    try {
      ringContext = new AudioContextClass();
      if (ringContext.state === "suspended") await ringContext.resume();
      ringPulse();
      ringTimer = setRepeating(ringPulse, 1_150);
    } catch {
      stopRinging();
    }
  }

  function flushUsage() {
    if (pendingUsageSeconds <= 0) return;
    const seconds = pendingUsageSeconds;
    pendingUsageSeconds = 0;
    options.onUsage?.({ characterId, dateKey, seconds });
  }

  function startQuotaClock() {
    startedAt = now();
    quotaTimer = setRepeating(() => {
      if (disposed || remainingSeconds <= 0) return;
      remainingSeconds -= 1;
      pendingUsageSeconds += 1;
      if (pendingUsageSeconds >= 5) flushUsage();
      if (remainingSeconds <= 0) {
        end("daily_limit");
        return;
      }
      notify();
    }, 1_000);
  }

  function closeConnection() {
    connection?.effectAttachment?.detach?.();
    try { connection?.channel?.close?.(); } catch { /* Already closed. */ }
    try { connection?.peer?.close?.(); } catch { /* Already closed. */ }
    try {
      connection?.audio?.pause?.();
      if (connection?.audio) connection.audio.srcObject = null;
      connection?.audio?.remove?.();
    } catch { /* Detached media can already be gone. */ }
    connection = null;
  }

  function handleEvent(event) {
    if (!event || typeof event.type !== "string") return;
    if (event.type === "input_audio_buffer.speech_started") {
      playerTranscript = "";
      setPhase("player_speaking");
      return;
    }
    if (event.type === "input_audio_buffer.speech_stopped") {
      setPhase("thinking");
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      playerTranscript += event.delta ?? "";
      notify();
      return;
    }
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      playerTranscript = String(event.transcript ?? playerTranscript).trim();
      notify();
      return;
    }
    if (event.type === "response.created") {
      captionText = "";
      setPhase("thinking");
      return;
    }
    if (event.type === "response.output_audio_transcript.delta") {
      captionText += event.delta ?? "";
      notify();
      return;
    }
    if (event.type === "response.output_audio_transcript.done") {
      captionText = String(event.transcript ?? captionText).trim();
      notify();
      return;
    }
    if (event.type === "output_audio_buffer.started") {
      setPhase("ai_speaking");
      return;
    }
    if (event.type === "output_audio_buffer.stopped") {
      setPhase("listening");
      return;
    }
    if (event.type === "response.done" && phase === "thinking") {
      setPhase("listening");
      return;
    }
    if (event.type === "error") {
      lastError = event.error?.code ?? "friend_call_realtime_error";
      if (phase !== "ai_speaking" && phase !== "player_speaking") setPhase("listening");
    }
  }

  async function negotiate(stream) {
    if (!PeerConnection || !fetchImpl || !options.requestSecret) throw new Error("friend_call_unsupported");
    const secret = await options.requestSecret({
      purpose: "friend-call",
      locale,
      speakerId: characterId,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    });
    if (!secret?.value?.startsWith?.("ek_")) throw new Error(secret?.error ?? "friend_call_secret_failed");
    remainingSeconds = Math.max(0, Math.min(remainingSeconds, Number(secret.remainingSeconds) || 0));
    dateKey = typeof secret.dateKey === "string" ? secret.dateKey : null;
    if (remainingSeconds <= 0) throw new Error("friend_call_daily_limit");

    const peer = new PeerConnection();
    const channel = peer.createDataChannel("oai-events");
    const audio = AudioElement ? new AudioElement() : null;
    let effectAttachment = null;
    if (audio) {
      audio.autoplay = true;
      audio.playsInline = true;
    }
    addListener(channel, "message", (message) => {
      try { handleEvent(JSON.parse(message.data)); } catch { /* Ignore malformed upstream events. */ }
    });
    peer.ontrack = (event) => {
      const remoteStream = event.streams?.[0];
      if (!audio || !remoteStream) return;
      audio.srcObject = remoteStream;
      effectAttachment?.detach?.();
      effectAttachment = audioEffects.attach(remoteStream, { characterId, audioElement: audio });
      void audio.play?.().catch?.(() => {});
    };
    const track = stream.getAudioTracks?.()[0] ?? stream.getTracks?.()[0];
    if (!track) throw new Error("microphone_missing");
    peer.addTrack(track, stream);

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetchImpl(REALTIME_CALLS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error("friend_call_negotiation_failed");
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
      await waitForChannel(channel, setTimer, clearTimer);
      connection = { peer, channel, audio, effectAttachment };
    } catch (error) {
      effectAttachment?.detach?.();
      try { channel.close?.(); } catch { /* Already closed. */ }
      try { peer.close?.(); } catch { /* Already closed. */ }
      throw error;
    }
  }

  async function start() {
    if (disposed || phase !== "idle") return false;
    if (!mediaDevices?.getUserMedia) {
      lastError = "friend_call_unsupported";
      setPhase("error");
      return false;
    }
    try {
      setPhase("requesting_permission");
      micStream = await mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setPhase("dialing");
      void startRinging();
      const minimumWait = new Promise((resolve) => setTimer(resolve, ANSWER_DELAY_MS[characterId]));
      await Promise.all([negotiate(micStream), minimumWait]);
      stopRinging();
      audioEffects.setActive(true);
      setPhase("answered");
      startQuotaClock();
      const openingLine = friendCallOpeningLine(characterId, locale, relationshipDays);
      sendEvent(connection.channel, {
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: `Read exactly this line once, add nothing, then wait for the Earth-based player: ${JSON.stringify(openingLine)}`,
        },
      });
      return true;
    } catch (error) {
      stopRinging();
      lastError = ["NotAllowedError", "SecurityError"].includes(error?.name)
        ? "microphone_denied"
        : error?.message ?? "friend_call_failed";
      end("error", false);
      return false;
    }
  }

  function setMuted(nextMuted = !muted) {
    muted = Boolean(nextMuted);
    micStream?.getAudioTracks?.().forEach((track) => { track.enabled = !muted; });
    notify();
    return muted;
  }

  function setCallEffectsEnabled(nextEnabled) {
    const value = audioEffects.setEnabled(nextEnabled);
    notify();
    return value;
  }

  function sendText(message) {
    const text = String(message ?? "").trim().slice(0, 280);
    if (!text || !connection || disposed) return false;
    if (!sendEvent(connection.channel, {
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    })) return false;
    captionText = "";
    setPhase("thinking");
    return sendEvent(connection.channel, { type: "response.create", response: { output_modalities: ["audio"] } });
  }

  function end(reason = "user", markDisposed = true) {
    if (quotaTimer !== null) clearRepeating(quotaTimer);
    quotaTimer = null;
    stopRinging();
    audioEffects.setActive(false);
    flushUsage();
    closeConnection();
    micStream?.getTracks?.().forEach((track) => track.stop?.());
    micStream = null;
    audioEffects.dispose();
    if (markDisposed) disposed = true;
    phase = reason === "error" ? "error" : "ended";
    notify();
    options.onEnded?.({ reason, ...snapshot() });
    return snapshot();
  }

  return { end, sendText, setCallEffectsEnabled, setMuted, snapshot, start };
}
