(() => {
  const STORAGE_KEY = "oxygen-room-sound";
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let stored = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    stored = {};
  }

  let muted = Boolean(stored.muted);
  let volume = Number.isFinite(stored.volume) ? Math.min(0.6, Math.max(0, stored.volume)) : 0.24;
  let scene = "lobby";
  let context = null;
  let master = null;
  let pulseTimer = null;
  let pulseIndex = 0;
  let labels = { mute: "Mute background music", unmute: "Turn on background music", volume: "Background music volume" };

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, volume }));
    } catch {
      // The controls still work when storage is unavailable.
    }
  }

  function setMasterVolume() {
    if (!master || !context) return;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.04);
  }

  function renderControls() {
    document.querySelectorAll("[data-audio-toggle]").forEach((button) => {
      button.querySelector("span").textContent = muted ? "♪̸" : "♪";
      button.setAttribute("aria-label", muted ? labels.unmute : labels.mute);
      button.setAttribute("aria-pressed", String(muted));
    });
    document.querySelectorAll("[data-audio-volume]").forEach((input) => {
      input.value = String(Math.round(volume * 100));
      input.setAttribute("aria-label", labels.volume);
      input.disabled = muted;
    });
  }

  function tone(frequency, duration, strength, type = "sine", detune = 0) {
    if (!context || context.state !== "running" || muted) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(strength, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.04);
  }

  function tick() {
    if (scene === "lobby") {
      const notes = [110, 130.81, 146.83, 130.81];
      tone(notes[pulseIndex % notes.length], 1.8, 0.042, "sine");
      if (pulseIndex % 2 === 0) tone(notes[pulseIndex % notes.length] * 2, 1.1, 0.014, "triangle", -5);
    } else {
      const notes = [73.42, 77.78, 73.42, 87.31, 77.78, 73.42];
      tone(notes[pulseIndex % notes.length], 0.72, 0.055, "triangle");
      tone(notes[pulseIndex % notes.length] * 2.01, 0.24, 0.018, "square", pulseIndex % 2 ? -7 : 7);
    }
    pulseIndex += 1;
  }

  function schedule() {
    window.clearInterval(pulseTimer);
    pulseIndex = 0;
    tick();
    pulseTimer = window.setInterval(tick, scene === "lobby" ? 1_650 : 690);
  }

  function ensureContext() {
    if (context) return context;
    context = new AudioContextClass();
    master = context.createGain();
    master.connect(context.destination);
    setMasterVolume();
    schedule();
    return context;
  }

  async function start() {
    const activeContext = ensureContext();
    const wasSuspended = activeContext.state === "suspended";
    if (wasSuspended) await activeContext.resume().catch(() => {});
    if (wasSuspended && activeContext.state === "running") tick();
    if (activeContext.state === "running" && pulseTimer === null) schedule();
  }

  function setScene(nextScene) {
    const normalized = nextScene === "game" ? "game" : "lobby";
    if (scene === normalized) return;
    scene = normalized;
    if (context) schedule();
  }

  document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-audio-toggle]")) return;
    muted = !muted;
    await start();
    setMasterVolume();
    persist();
    renderControls();
  });

  document.addEventListener("input", async (event) => {
    const input = event.target.closest("[data-audio-volume]");
    if (!input) return;
    volume = Math.min(0.6, Math.max(0, Number(input.value) / 100));
    muted = false;
    await start();
    setMasterVolume();
    persist();
    renderControls();
  });

  const unlock = () => {
    start();
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);

  window.oxygenRoomSound = {
    setScene,
    refresh: renderControls,
    setLabels(nextLabels) {
      labels = { ...labels, ...nextLabels };
      renderControls();
    },
  };

  renderControls();
  start();
})();
