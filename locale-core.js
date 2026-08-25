export const FALLBACK_LOCALE = "en";

export const SUPPORTED_LOCALES = Object.freeze([
  Object.freeze({ code: "ko", nativeName: "한국어", voiceHint: "ko", voiceBeta: false }),
  Object.freeze({ code: "en", nativeName: "English", voiceHint: "en", voiceBeta: false }),
  Object.freeze({ code: "ja", nativeName: "日本語", voiceHint: "ja", voiceBeta: false }),
  Object.freeze({ code: "zh-CN", nativeName: "简体中文", voiceHint: "zh", voiceBeta: false }),
  Object.freeze({ code: "zh-TW", nativeName: "繁體中文", voiceHint: "zh", voiceBeta: false }),
  Object.freeze({ code: "yue-Hant-HK", nativeName: "粵語（香港）", voiceHint: "zh", voiceBeta: true }),
  Object.freeze({ code: "es-419", nativeName: "Español (Latinoamérica)", voiceHint: "es", voiceBeta: false }),
]);

export const SUPPORTED_LOCALE_CODES = Object.freeze(SUPPORTED_LOCALES.map(({ code }) => code));

const CANONICAL_LOCALES = new Map(SUPPORTED_LOCALE_CODES.map((code) => [code.toLowerCase(), code]));

function normalizedTag(locale) {
  return typeof locale === "string" ? locale.trim().replace(/_/g, "-").toLowerCase() : "";
}

export function canonicalLocale(locale) {
  return CANONICAL_LOCALES.get(normalizedTag(locale)) ?? null;
}

export function isSupportedLocale(locale) {
  return canonicalLocale(locale) !== null;
}

export function matchBrowserLocale(locale) {
  const exact = canonicalLocale(locale);
  if (exact) return exact;

  const tag = normalizedTag(locale);
  if (!tag) return null;
  if (tag === "yue" || tag.startsWith("yue-")) return "yue-Hant-HK";
  const subtags = tag.split("-");
  if (subtags[0] === "zh" && (subtags.includes("hk") || subtags.includes("mo"))) {
    return "yue-Hant-HK";
  }
  if (tag === "zh-hant" || tag.includes("-hant") || tag.endsWith("-tw")) return "zh-TW";
  if (tag === "zh" || tag.startsWith("zh-")) return "zh-CN";
  if (tag === "es" || tag.startsWith("es-")) return "es-419";
  if (tag === "ko" || tag.startsWith("ko-")) return "ko";
  if (tag === "en" || tag.startsWith("en-")) return "en";
  if (tag === "ja" || tag.startsWith("ja-")) return "ja";
  return null;
}

/**
 * @param {{
 *   urlLocale?: unknown,
 *   accountLocale?: unknown,
 *   storedLocale?: unknown,
 *   browserLocales?: unknown[] | unknown,
 * }} [options]
 */
export function resolvePreferredLocaleWithSource(options = {}) {
  const preferences = /** @type {Record<string, unknown>} */ (options);
  const urlLocale = preferences["urlLocale"];
  const accountLocale = preferences["accountLocale"];
  const storedLocale = preferences["storedLocale"];
  const browserLocales = preferences["browserLocales"] ?? [];
  const explicitCandidates = [
    ["url", urlLocale],
    ["account", accountLocale],
    ["stored", storedLocale],
  ];
  for (const [source, candidate] of explicitCandidates) {
    const locale = canonicalLocale(candidate);
    if (locale) return { locale, source };
  }

  const candidates = Array.isArray(browserLocales) ? browserLocales : [browserLocales];
  for (const candidate of candidates) {
    const locale = matchBrowserLocale(candidate);
    if (locale) return { locale, source: "browser" };
  }
  return { locale: FALLBACK_LOCALE, source: "fallback" };
}

export function resolvePreferredLocale(options = {}) {
  return resolvePreferredLocaleWithSource(options).locale;
}
