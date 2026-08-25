import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";


export const LOCALE_CODES = Object.freeze([
  "ko",
  "en",
  "ja",
  "zh-CN",
  "zh-TW",
  "yue-Hant-HK",
  "es-419",
]);

const localeModules = new Map(await Promise.all(LOCALE_CODES.map(async (code) => [
  code,
  await import(new URL(`../locales/${code}.js`, import.meta.url)),
])));

function functionArguments(path, length) {
  const named = {
    firstPersonText: ["record"],
    meetingFramed: ["record"],
    challengeContradiction: ["Confirmed fact", "Noel", "touched the purifier", false, "record"],
    challengeSelf: ["Confirmed fact", "record"],
    challengeWeak: ["Confirmed fact", "Noel", "record"],
    hardPracticeChallenge: ["record", "Noel", "Confirmed fact", false, false, 2],
    chatPracticeReaction: ["record", "Noel", 1],
    chatPracticeDecision: ["record", "Noel", 1],
    friendPracticeReply: ["record", 1, "sample message"],
  };
  const key = path.split(".").at(-1)?.replace(/\[\d+\]$/u, "");
  return (named[key] ?? ["Mina", "Noel", "Confirmed fact", false, "record", 2]).slice(0, length);
}

function assertValueShape(reference, candidate, path, locale) {
  if (Array.isArray(reference)) {
    assert.ok(Array.isArray(candidate), `${locale} ${path}: expected an array`);
    assert.equal(candidate.length, reference.length, `${locale} ${path}: array length differs`);
    reference.forEach((value, index) => {
      assertValueShape(value, candidate[index], `${path}[${index}]`, locale);
    });
    return;
  }

  if (reference && typeof reference === "object") {
    assert.ok(candidate && typeof candidate === "object" && !Array.isArray(candidate), `${locale} ${path}: expected an object`);
    assert.deepEqual(Object.keys(candidate).sort(), Object.keys(reference).sort(), `${locale} ${path}: keys differ`);
    for (const key of Object.keys(reference)) {
      assertValueShape(reference[key], candidate[key], `${path}.${key}`, locale);
    }
    return;
  }

  assert.equal(typeof candidate, typeof reference, `${locale} ${path}: value type differs`);
  if (typeof reference === "function") {
    assert.equal(candidate.length, reference.length, `${locale} ${path}: function arity differs`);
    const args = functionArguments(path, reference.length);
    const referenceResult = reference(...args);
    const candidateResult = candidate(...args);
    assert.notEqual(candidateResult, undefined, `${locale} ${path}: function returned undefined`);
    assertValueShape(referenceResult, candidateResult, `${path}()`, locale);
    return;
  }
  if (typeof candidate === "string") {
    assert.ok(candidate.trim(), `${locale} ${path}: empty string`);
    assert.doesNotMatch(candidate, /__[\w-]+__/u, `${locale} ${path}: unresolved placeholder`);
  }
}

function collectStrings(value, path = "pack", collected = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, collected));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${path}.${key}`, collected);
  } else if (typeof value === "function") {
    collectStrings(value(...functionArguments(path, value.length)), `${path}()`, collected);
  } else if (typeof value === "string") {
    collected.push(value);
  }
  return collected;
}

function valueAt(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

const shortUiBudgets = Object.freeze({
  "ui.welcomeStart": 18,
  "ui.profileContinue": 28,
  "ui.homeBack": 24,
  "ui.friendChatOpen": 24,
  "ui.friendCall.start": 20,
  "ui.selected": 18,
  "ui.select": 18,
  "ui.chatSend": 18,
  "ui.languageSettings.action.download": 18,
  "ui.languageSettings.action.apply": 18,
  "ui.languageSettings.action.update": 18,
  "ui.languageSettings.action.delete": 18,
  "ui.languageSettings.action.retry": 18,
  "ui.voice.consentAction": 36,
  "ui.voice.textFallback": 28,
  "ui.voice.end": 28,
  "ui.voice.reconnect": 20,
});

const requiredTerms = Object.freeze({
  ko: ["산소실", "조종실"],
  en: ["oxygen room", "control room"],
  ja: ["酸素室", "管制室"],
  "zh-CN": ["氧气室", "控制室"],
  "zh-TW": ["氧氣室", "管制室"],
  "yue-Hant-HK": ["氧氣室", "控制室"],
  "es-419": ["sala de oxígeno", "sala de control"],
});

function assertLocaleWriting(locale, strings) {
  const text = strings.join("\n");
  assert.doesNotMatch(text, /__[\w-]+__/u, `${locale}: unresolved placeholder`);
  if (locale === "ja") assert.doesNotMatch(text, /[\uac00-\ud7a3]/u, "ja: Korean text leaked into the pack");
  if (["zh-CN", "zh-TW", "yue-Hant-HK"].includes(locale)) {
    assert.doesNotMatch(text, /[\u3040-\u30ff\uac00-\ud7a3]/u, `${locale}: Japanese or Korean text leaked into the pack`);
  }
  if (locale === "es-419") {
    assert.doesNotMatch(text, /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7a3]/u, "es-419: CJK or Korean text leaked into the pack");
  }
  if (["zh-TW", "yue-Hant-HK"].includes(locale)) {
    assert.doesNotMatch(
      text,
      /[这们个语说话后发为与时会开关门见录选线间机动实证据论质设显备区标请连变获评错轮询顺读决样够复称页轻启麦风处达权声听张损专装误监传净锁坏仅结两强胜价视认给种题议经浅战贴纸账号许缓画状着]/u,
      `${locale}: simplified-only glyph leaked into the pack`,
    );
  }
  if (locale === "zh-TW") assert.doesNotMatch(text, /[嘅喺冇]/u, "zh-TW: Cantonese wording leaked into the Taiwan pack");
  if (locale === "yue-Hant-HK") {
    for (const marker of ["嘅", "喺", "冇", "傾偈"]) {
      assert.ok(text.includes(marker), `yue-Hant-HK: missing Cantonese marker ${marker}`);
    }
  }
  for (const term of requiredTerms[locale]) {
    assert.ok(text.toLocaleLowerCase().includes(term.toLocaleLowerCase()), `${locale}: missing glossary term ${term}`);
  }
}

export function checkLanguagePacks() {
  const reference = localeModules.get("en").default;
  for (const locale of LOCALE_CODES) {
    const namespace = localeModules.get(locale);
    assert.equal(namespace.PACK_SCHEMA_VERSION, 1, `${locale}: unsupported schema`);
    assert.match(namespace.PACK_VERSION, /^\d+\.\d+\.\d+$/u, `${locale}: invalid version`);
    assertValueShape(reference, namespace.default, "pack", locale);
    assertLocaleWriting(locale, collectStrings(namespace.default));
    for (const [path, maximum] of Object.entries(shortUiBudgets)) {
      const value = valueAt(namespace.default, path);
      assert.equal(typeof value, "string", `${locale} ${path}: expected a string`);
      assert.ok(Array.from(value).length <= maximum, `${locale} ${path}: ${Array.from(value).length} > ${maximum}`);
    }
  }
  return { locales: LOCALE_CODES.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { locales } = checkLanguagePacks();
  console.log(`Language pack QA passed for ${locales} locales.`);
}
