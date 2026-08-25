import test from "node:test";
import assert from "node:assert/strict";
import { checkLanguagePacks } from "../scripts/check-language-packs.mjs";


test("7개 언어팩은 구조·함수·문자 체계·용어·짧은 UI 길이 기준을 충족한다", () => {
  assert.deepEqual(checkLanguagePacks(), { locales: 7 });
});
