import test from "node:test";
import assert from "node:assert/strict";

import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALE_CODES,
  canonicalLocale,
  matchBrowserLocale,
  resolvePreferredLocale,
  resolvePreferredLocaleWithSource,
} from "../locale-core.js";
import { sanitizeProfile } from "../account-core.js";

test("지원 locale 코드를 요구사항의 일곱 값으로 고정한다", () => {
  assert.deepEqual(SUPPORTED_LOCALE_CODES, [
    "ko",
    "en",
    "ja",
    "zh-CN",
    "zh-TW",
    "yue-Hant-HK",
    "es-419",
  ]);
  assert.equal(FALLBACK_LOCALE, "en");
});

test("URL, 계정, 기기, 브라우저 순서로 첫 유효 locale을 선택한다", () => {
  const allSources = {
    urlLocale: "ja",
    accountLocale: "ko",
    storedLocale: "zh-TW",
    browserLocales: ["es-MX"],
  };
  assert.deepEqual(resolvePreferredLocaleWithSource(allSources), { locale: "ja", source: "url" });
  assert.equal(resolvePreferredLocale({ ...allSources, urlLocale: "invalid" }), "ko");
  assert.equal(resolvePreferredLocale({ ...allSources, urlLocale: null, accountLocale: null }), "zh-TW");
  assert.equal(resolvePreferredLocale({ ...allSources, urlLocale: null, accountLocale: null, storedLocale: null }), "es-419");
});

test("명시적 선택에는 고정된 지원 코드만 허용한다", () => {
  assert.equal(canonicalLocale("zh-CN"), "zh-CN");
  assert.equal(canonicalLocale("YUE-hant-hk"), "yue-Hant-HK");
  assert.equal(canonicalLocale("en-US"), null);
  assert.equal(canonicalLocale("zh-HK"), null);
});

test("브라우저의 중국어 및 광둥어 표기를 지원 코드로 연결한다", () => {
  assert.equal(matchBrowserLocale("zh-HK"), "yue-Hant-HK");
  assert.equal(matchBrowserLocale("zh-MO"), "yue-Hant-HK");
  assert.equal(matchBrowserLocale("yue-Hans-CN"), "yue-Hant-HK");
  assert.equal(matchBrowserLocale("zh-Hant"), "zh-TW");
  assert.equal(matchBrowserLocale("zh-Hant-TW"), "zh-TW");
  assert.equal(matchBrowserLocale("zh-Hans"), "zh-CN");
  assert.equal(matchBrowserLocale("zh-SG"), "zh-CN");
  assert.equal(matchBrowserLocale("en-HK"), "en");
  assert.equal(matchBrowserLocale("ja-MO"), "ja");
});

test("일반 브라우저 언어 태그와 미지원 언어를 안전하게 처리한다", () => {
  assert.equal(matchBrowserLocale("ko-KR"), "ko");
  assert.equal(matchBrowserLocale("en-GB"), "en");
  assert.equal(matchBrowserLocale("ja-JP"), "ja");
  assert.equal(matchBrowserLocale("es-MX"), "es-419");
  assert.equal(resolvePreferredLocale({ browserLocales: ["fr-FR", "de-DE"] }), "en");
  assert.equal(resolvePreferredLocale({ browserLocales: ["fr-FR", "ja-JP"] }), "ja");
});

test("계정 프로필은 기존 값과 일곱 locale을 보존하고 잘못된 값은 영어로 복구한다", () => {
  for (const locale of SUPPORTED_LOCALE_CODES) {
    assert.equal(sanitizeProfile({ locale }).locale, locale);
  }
  assert.equal(sanitizeProfile({ locale: "fr" }).locale, "en");
  assert.equal(sanitizeProfile({}).locale, "en");
});
