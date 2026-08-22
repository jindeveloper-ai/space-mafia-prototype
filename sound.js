(() => {
  const STORAGE_KEY = "mars-net-sound-v3";
  const SOUND_STATE_VERSION = 3;
  const tracks = {
    lobby: new Audio("./assets/audio/lobby-detectives-among-us.mp3"),
    game: new Audio("./assets/audio/game-sneaky-film-noir.mp3"),
  };

  let stored = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    stored = {};
  }

  let muted = Boolean(stored.muted);
  let volume = Number.isFinite(stored.volume) ? Math.min(0.6, Math.max(0, stored.volume)) : 0.3;
  let scene = "lobby";
  let hasStarted = false;
  let ducking = false;
  let suppressed = false;
  let labels = {
    start: "Play background music",
    mute: "Mute background music",
    unmute: "Turn on background music",
    volume: "Background music volume",
    autoMuted: "Background music muted during voice call",
  };

  Object.values(tracks).forEach((track) => {
    track.loop = true;
    track.preload = "auto";
    track.playsInline = true;
    track.volume = volume;
  });

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SOUND_STATE_VERSION, muted, volume }));
    } catch {
      // Controls remain available when browser storage is blocked.
    }
  }

  function currentTrack() {
    return tracks[scene];
  }

  function pauseAll(except = null) {
    Object.values(tracks).forEach((track) => {
      if (track !== except) track.pause();
    });
  }

  function applyVolume() {
    const silent = muted || suppressed;
    Object.values(tracks).forEach((track) => {
      track.volume = silent ? 0 : volume * (ducking ? 0.22 : 1);
      track.muted = silent;
    });
  }

  function renderControls() {
    document.querySelectorAll("[data-audio-toggle]").forEach((button) => {
      button.querySelector("span").textContent = suppressed ? "♪̸" : !hasStarted ? "▶" : muted ? "♪̸" : "♪";
      button.setAttribute("aria-label", suppressed ? labels.autoMuted : !hasStarted ? labels.start : muted ? labels.unmute : labels.mute);
      button.setAttribute("aria-pressed", String(hasStarted && !muted && !suppressed));
      button.dataset.audioState = suppressed ? "suppressed" : !hasStarted ? "waiting" : muted ? "muted" : "playing";
      button.disabled = suppressed;
    });
    document.querySelectorAll("[data-audio-volume]").forEach((input) => {
      input.value = String(Math.round(volume * 100));
      input.setAttribute("aria-label", labels.volume);
      input.disabled = muted || suppressed;
    });
  }

  async function playCurrent() {
    if (suppressed) {
      pauseAll();
      applyVolume();
      renderControls();
      return false;
    }
    const track = currentTrack();
    pauseAll(track);
    applyVolume();
    try {
      await track.play();
      hasStarted = true;
      return true;
    } catch {
      return false;
    } finally {
      renderControls();
    }
  }

  function setScene(nextScene) {
    const normalized = nextScene === "game" ? "game" : "lobby";
    if (scene === normalized) return;
    const previous = currentTrack();
    scene = normalized;
    previous.pause();
    if (hasStarted && !muted && !suppressed) playCurrent();
  }

  document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-audio-toggle]")) return;
    if (!hasStarted || muted) {
      muted = false;
      await playCurrent();
    } else {
      muted = true;
      pauseAll();
      applyVolume();
    }
    persist();
    renderControls();
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-audio-toggle]") || hasStarted || muted) return;
    void playCurrent();
  }, { capture: true });

  document.addEventListener("input", async (event) => {
    const input = event.target.closest("[data-audio-volume]");
    if (!input) return;
    volume = Math.min(0.6, Math.max(0, Number(input.value) / 100));
    muted = false;
    applyVolume();
    await playCurrent();
    persist();
    renderControls();
  });

  const unlock = async (event) => {
    if (event.target.closest?.("[data-audio-toggle]")) return;
    if (!await playCurrent()) return;
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);

  window.oxygenRoomSound = {
    setScene,
    refresh: renderControls,
    start() {
      if (muted) return Promise.resolve(false);
      return playCurrent();
    },
    setLabels(nextLabels) {
      labels = { ...labels, ...nextLabels };
      renderControls();
    },
    setDucking(nextDucking) {
      ducking = Boolean(nextDucking);
      applyVolume();
    },
    setSuppressed(nextSuppressed) {
      const normalized = Boolean(nextSuppressed);
      if (suppressed === normalized) return;
      suppressed = normalized;
      if (suppressed) {
        pauseAll();
        applyVolume();
        renderControls();
        return;
      }
      if (hasStarted && !muted) void playCurrent();
      else {
        applyVolume();
        renderControls();
      }
    },
  };

  applyVolume();
  renderControls();
  if (!muted) void playCurrent();
})();
