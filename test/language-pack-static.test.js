import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";


const projectRoot = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, projectRoot));
const packageVersion = JSON.parse(await readProjectFile("package.json")).version;

test("7개 언어팩 manifest의 크기와 무결성 해시는 실제 모듈과 일치한다", async () => {
  const manifest = JSON.parse(await readFile(new URL("locales/manifest.json", projectRoot), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(
    manifest.packs.map(({ code }) => code),
    ["ko", "en", "ja", "zh-CN", "zh-TW", "yue-Hant-HK", "es-419"],
  );

  for (const entry of manifest.packs) {
    const bytes = await readProjectFile(`locales/${entry.code}.js`);
    assert.equal(entry.fileSize, bytes.byteLength);
    assert.equal(entry.integrity, `sha256-${createHash("sha256").update(bytes).digest("base64")}`);
    assert.match(bytes.toString("utf8"), new RegExp(`PACK_VERSION = "${entry.version.replace(/\./g, "\\.")}"`));
  }
});

test("공통 i18n 모듈은 번역 본문을 정적으로 포함하거나 가져오지 않는다", async () => {
  const [i18n, loader] = await Promise.all([
    readProjectFile("i18n.js").then((bytes) => bytes.toString("utf8")),
    readProjectFile("language-pack-loader.js").then((bytes) => bytes.toString("utf8")),
  ]);
  assert.ok(Buffer.byteLength(i18n) < 5_000);
  assert.doesNotMatch(i18n, /locales\/(?:ko|en|ja|zh-CN|zh-TW|yue-Hant-HK|es-419)\.js/);
  assert.doesNotMatch(loader, /from ["'].\/locales\/(?:ko|en|ja|zh-CN|zh-TW|yue-Hant-HK|es-419)\.js/);
});

test("부트스트랩은 계정 언어를 우선하고 팩 활성화 후 게임을 시작한다", async () => {
  const [bootstrap, friendBootstrap, accountClient, worker] = await Promise.all([
    readProjectFile("bootstrap.js").then((bytes) => bytes.toString("utf8")),
    readProjectFile("friend-bootstrap.js").then((bytes) => bytes.toString("utf8")),
    readProjectFile("account-client.js").then((bytes) => bytes.toString("utf8")),
    readProjectFile("service-worker.js").then((bytes) => bytes.toString("utf8")),
  ]);
  assert.match(bootstrap, /accountLocale: cachedAccountLocale\(\)/);
  assert.match(friendBootstrap, /accountLocale: cachedAccountLocale\(\)/);
  assert.match(accountClient, /locale: canonicalLocale\(profile\.locale\) \?\? FALLBACK_LOCALE/);
  assert.ok(bootstrap.indexOf("await activateLocale") < bootstrap.indexOf('await import("./game.js'));
  assert.match(bootstrap, new RegExp(`service-worker\\.js\\?v=${packageVersion.replace(/\./g, "\\.")}`));
  assert.match(worker, /locales\\\/\(\?:ko\|en\|ja\|zh-CN\|zh-TW\|yue-Hant-HK\|es-419\)\\\.js/);
  assert.match(worker, /habitat-map-\(\?:ko\|en\|ja\|zh-CN\|zh-TW\|yue-Hant-HK\|es-419\)-v1/);
  assert.match(worker, /if \(cached\) return cached/);
  assert.match(worker, /APP_SHELL_CACHE/);
  assert.match(worker, /APP_SHELL_ASSETS/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.match(worker, /cache\.match\(fallbackPath\)/);
  assert.match(worker, /cachedAsset\(event\.request, LANGUAGE_PACK_CACHE, isLocalizedMap, undefined\)/);
  assert.match(worker, /offlineDocument\(\)/);
});
