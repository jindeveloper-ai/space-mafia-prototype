(() => {
  const STORAGE_KEY = "oxygen-room-sound";
  const SOUND_STATE_VERSION = 2;
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
  const storedVolume = Number.isFinite(stored.volume) ? Math.min(0.6, Math.max(0, stored.volume)) : 0.3;
  let volume = stored.version !== SOUND_STATE_VERSION && Math.abs(storedVolume - 0.24) < 0.001
    ? 0.3
    : storedVolume;
  let scene = "lobby";
  let hasStarted = false;
  let labels = {
    start: "Play background music",
    mute: "Mute background music",
    unmute: "Turn on background music",
    volume: "Background music volume",
  };

  Object.values(tracks).forEach((track) => {
    track.loop = true;
    track.preload = "auto";
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
    Object.values(tracks).forEach((track) => {
      track.volume = muted ? 0 : volume;
      track.muted = muted;
    });
  }

  function renderControls() {
    document.querySelectorAll("[data-audio-toggle]").forEach((button) => {
      button.querySelector("span").textContent = !hasStarted ? "▶" : muted ? "♪̸" : "♪";
      button.setAttribute("aria-label", !hasStarted ? labels.start : muted ? labels.unmute : labels.mute);
      button.setAttribute("aria-pressed", String(hasStarted && !muted));
      button.dataset.audioState = !hasStarted ? "waiting" : muted ? "muted" : "playing";
    });
    document.querySelectorAll("[data-audio-volume]").forEach((input) => {
      input.value = String(Math.round(volume * 100));
      input.setAttribute("aria-label", labels.volume);
      input.disabled = muted;
    });
  }

  async function playCurrent() {
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
    if (hasStarted && !muted) playCurrent();
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
    setLabels(nextLabels) {
      labels = { ...labels, ...nextLabels };
      renderControls();
    },
  };

  applyVolume();
  renderControls();
  if (!muted) void playCurrent();
})();
