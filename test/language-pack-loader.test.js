import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  LanguagePackError,
  createLanguagePackLoader,
} from "../language-pack-loader.js";
import { getCopy } from "../i18n.js";


const projectRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("locales/manifest.json", projectRoot), "utf8"));
const packBytes = new Map(await Promise.all(manifest.packs.map(async ({ code }) => [
  code,
  await readFile(new URL(`locales/${code}.js`, projectRoot)),
])));
const manifestUrl = "https://mars.test/locales/manifest.json?v=0.20.14";

class MemoryCache {
  constructor() {
    this.responses = new Map();
  }

  async put(request, response) {
    this.responses.set(String(request), response.clone());
  }

  async match(request) {
    return this.responses.get(String(request))?.clone();
  }

  async delete(request) {
    return this.responses.delete(String(request));
  }
}

class MemoryCacheStorage {
  constructor() {
    this.cache = new MemoryCache();
  }

  async open() {
    return this.cache;
  }
}

function moduleImporter(source) {
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
}

function onlineFetch(requests, corruptLocale = null) {
  return async (url) => {
    requests.push(url);
    if (url === manifestUrl) return Response.json(manifest);
    const entry = manifest.packs.find(({ code, version }) => url.endsWith(`/${code}.js?v=${version}`));
    if (!entry) return new Response("not found", { status: 404 });
    const bytes = Uint8Array.from(packBytes.get(entry.code));
    if (entry.code === corruptLocale) bytes[0] ^= 1;
    return new Response(bytes, { headers: { "Content-Type": "text/javascript" } });
  };
}

function loaderOptions(cacheStorage, fetchImpl) {
  return {
    manifestUrl,
    cacheStorage,
    cryptoImpl: webcrypto,
    fetchImpl,
    moduleImporter,
  };
}

test("선택한 언어팩만 다운로드하고 활성화한다", async () => {
  const requests = [];
  const loader = createLanguagePackLoader(loaderOptions(new MemoryCacheStorage(), onlineFetch(requests)));

  assert.equal(await loader.activateLocale("en"), "en");
  assert.equal(getCopy("en").meta.brand, "MARS.NET");
  assert.ok(requests.some((url) => url.includes("/en.js?v=")));
  assert.ok(!requests.some((url) => url.includes("/ko.js?v=")));

  const installed = await loader.getInstalledPacks();
  assert.equal(installed.find(({ code }) => code === "en").active, true);
  assert.equal(installed.find(({ code }) => code === "ko").installed, false);
});

test("해시가 다른 언어팩은 설치하지 않는다", async () => {
  const loader = createLanguagePackLoader(loaderOptions(
    new MemoryCacheStorage(),
    onlineFetch([], "ko"),
  ));

  await assert.rejects(
    loader.downloadLanguagePack("ko"),
    (error) => error instanceof LanguagePackError && error.code === "integrity_mismatch",
  );
  const installed = await loader.getInstalledPacks();
  assert.equal(installed.find(({ code }) => code === "ko").installed, false);
});

test("오프라인 재실행은 검증해 둔 Cache Storage 팩을 사용한다", async () => {
  const cacheStorage = new MemoryCacheStorage();
  const online = createLanguagePackLoader(loaderOptions(cacheStorage, onlineFetch([])));
  assert.equal(await online.activateLocale("ko"), "ko");

  const offline = createLanguagePackLoader(loaderOptions(cacheStorage, async () => {
    throw new TypeError("offline");
  }));
  assert.equal(await offline.activateLocale("ko"), "ko");
  assert.equal(getCopy("ko").ui.chatYou, "나");
});

test("브라우저 저장소를 사용할 수 없어도 현재 세션은 메모리에서 실행한다", async () => {
  const unavailableStorage = { async open() { throw new Error("denied"); } };
  const loader = createLanguagePackLoader(loaderOptions(unavailableStorage, onlineFetch([])));

  assert.equal(await loader.activateLocale("en"), "en");
  assert.equal(getCopy("en").ui.chatYou, "You");
});

test("현재 사용 중인 팩은 삭제할 수 없다", async () => {
  const loader = createLanguagePackLoader(loaderOptions(new MemoryCacheStorage(), onlineFetch([])));
  await loader.activateLocale("ko");

  await assert.rejects(
    loader.removeLanguagePack("ko"),
    (error) => error instanceof LanguagePackError && error.code === "active_pack_cannot_be_removed",
  );
});

test("업데이트 다운로드 실패 시 검증된 기존 팩을 유지한다", async () => {
  const cacheStorage = new MemoryCacheStorage();
  const original = createLanguagePackLoader(loaderOptions(cacheStorage, onlineFetch([])));
  await original.activateLocale("ko");
  const installedVersion = manifest.packs.find(({ code }) => code === "ko").version;

  const updatedManifest = {
    ...manifest,
    packs: manifest.packs.map((entry) => entry.code === "ko"
      ? { ...entry, version: "999.0.0" }
      : entry),
  };
  const failedUpdate = createLanguagePackLoader(loaderOptions(cacheStorage, async (url) => {
    if (url === manifestUrl) return Response.json(updatedManifest);
    throw new TypeError("update unavailable");
  }));

  assert.equal(await failedUpdate.activateLocale("ko"), "ko");
  const korean = (await failedUpdate.getInstalledPacks()).find(({ code }) => code === "ko");
  assert.equal(korean.version, installedVersion);
  assert.equal(korean.updateAvailable, true);
});

test("사용 중이 아닌 설치 팩은 삭제할 수 있다", async () => {
  const loader = createLanguagePackLoader(loaderOptions(new MemoryCacheStorage(), onlineFetch([])));
  await loader.activateLocale("ko");
  await loader.downloadLanguagePack("en");

  assert.equal(await loader.removeLanguagePack("en"), true);
  const english = (await loader.getInstalledPacks()).find(({ code }) => code === "en");
  assert.equal(english.installed, false);
});
