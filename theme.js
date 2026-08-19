(function setupThemePreference() {
  const storageKey = "oxygen-room-theme";
  const themes = ["system", "light", "dark"];

  function read() {
    try {
      const stored = localStorage.getItem(storageKey);
      return themes.includes(stored) ? stored : "system";
    } catch {
      return "system";
    }
  }

  function apply(theme) {
    const nextTheme = themes.includes(theme) ? theme : "system";
    if (nextTheme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = nextTheme;
    return nextTheme;
  }

  function set(theme) {
    const nextTheme = apply(theme);
    try {
      if (nextTheme === "system") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, nextTheme);
    } catch {
      // The selected theme still applies for this visit when storage is unavailable.
    }
    return nextTheme;
  }

  function next() {
    const currentIndex = themes.indexOf(read());
    return set(themes[(currentIndex + 1) % themes.length]);
  }

  window.oxygenRoomTheme = { apply, next, read, set };
  apply(read());
})();
