import { canonicalLocale } from "./locale-core.js?v=0.20.14";

export const DEFAULT_LOCALE = "ko";

const REGISTRY_KEY = Symbol.for("mars.net.language-packs.v1");
const registryState = globalThis[REGISTRY_KEY] ??= {
  activeLocale: null,
  packs: new Map(),
};

export function normalizeLocale(locale) {
  return canonicalLocale(locale) ?? DEFAULT_LOCALE;
}

export function withJosa(word, consonantForm, vowelForm) {
  const text = String(word);
  const lastCharacter = text.slice(-1);
  const code = lastCharacter ? lastCharacter.charCodeAt(0) : 0;
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${text}${hasBatchim ? consonantForm : vowelForm}`;
}

export function registerLanguagePack(locale, pack) {
  const normalized = canonicalLocale(locale);
  if (!normalized || !pack || typeof pack !== "object") {
    throw new TypeError("A supported locale and language-pack object are required.");
  }
  registryState.packs.set(normalized, pack);
  return pack;
}

export function hasLanguagePack(locale) {
  const normalized = canonicalLocale(locale);
  return normalized ? registryState.packs.has(normalized) : false;
}

export function activateRegisteredLocale(locale) {
  const normalized = canonicalLocale(locale);
  if (!normalized || !registryState.packs.has(normalized)) {
    throw new Error(`Language pack is not installed: ${String(locale)}`);
  }
  registryState.activeLocale = normalized;
  return normalized;
}

export function getActiveLocale() {
  return registryState.activeLocale;
}

export function getCopy(locale = registryState.activeLocale ?? DEFAULT_LOCALE) {
  const normalized = normalizeLocale(locale);
  const pack = registryState.packs.get(normalized);
  if (!pack) throw new Error(`Language pack is not loaded: ${normalized}`);
  return pack;
}
