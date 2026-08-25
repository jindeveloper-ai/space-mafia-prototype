import { getCopy } from "./i18n.js?v=0.20.14";


export function getFriendCopy(locale) {
  const copy = getCopy(locale).friendRoom;
  if (!copy || typeof copy !== "object") throw new Error(`Friend-room copy is unavailable: ${String(locale)}`);
  return copy;
}

export function getFriendTranslationKeys(locale) {
  const keys = [];
  const walk = (value, prefix = "") => {
    Object.entries(value).forEach(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      keys.push(path);
      if (child && typeof child === "object" && !Array.isArray(child)) walk(child, path);
    });
  };
  walk(getFriendCopy(locale));
  return keys.sort();
}
