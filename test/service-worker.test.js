import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const origin = "https://mars.test";

function requestKey(request) {
  return new URL(typeof request === "string" ? request : request.url, `${origin}/`).href;
}

function createWorkerHarness() {
  const listeners = new Map();
  const stores = new Map();
  let online = true;
  const fetchImpl = async (request) => {
    if (!online) throw new TypeError("offline");
    return new Response(`network:${requestKey(request)}`);
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(requests) {
          for (const request of requests) store.set(requestKey(request), await fetchImpl(request));
        },
        async match(request, options = {}) {
          const key = requestKey(request);
          if (!options.ignoreSearch) return store.get(key)?.clone();
          const requested = new URL(key);
          const match = [...store.entries()].find(([candidate]) => {
            const cached = new URL(candidate);
            return cached.origin === requested.origin && cached.pathname === requested.pathname;
          });
          return match?.[1].clone();
        },
        async put(request, response) {
          store.set(requestKey(request), response.clone());
        },
      };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
  };
  const self = {
    location: new URL(`${origin}/service-worker.js`),
    clients: { async claim() {} },
    async skipWaiting() {},
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  vm.runInNewContext(workerSource, {
    URL,
    Response,
    caches,
    fetch: fetchImpl,
    self,
  });
  return {
    listeners,
    stores,
    setOnline(value) { online = value; },
    async install() {
      let pending;
      listeners.get("install")({ waitUntil(value) { pending = value; } });
      await pending;
    },
    async fetch(request) {
      let response;
      listeners.get("fetch")({ request, respondWith(value) { response = value; } });
      return response ? await response : null;
    },
  };
}

test("서비스 워커는 앱 셸을 설치하고 오프라인 탐색에서 캐시된 앱을 연다", async () => {
  const harness = createWorkerHarness();
  await harness.install();
  harness.setOnline(false);

  const response = await harness.fetch({
    method: "GET",
    mode: "navigate",
    url: `${origin}/?lang=ja`,
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), `network:${origin}/index.html`);
});

test("앱 셸 모듈은 버전 쿼리가 달라도 현재 앱 캐시에서 오프라인으로 연다", async () => {
  const harness = createWorkerHarness();
  await harness.install();
  harness.setOnline(false);

  const response = await harness.fetch({
    method: "GET",
    mode: "cors",
    url: `${origin}/game.js?v=offline-reload`,
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), `network:${origin}/game.js?v=0.20.14`);
});

test("앱 셸도 없는 오프라인 탐색은 독립적인 최소 영어 재시도 화면을 연다", async () => {
  const harness = createWorkerHarness();
  harness.setOnline(false);

  const response = await harness.fetch({
    method: "GET",
    mode: "navigate",
    url: `${origin}/`,
  });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.match(body, /<html lang="en">/);
  assert.match(body, /MARS\.NET is offline/);
  assert.match(body, /href=""[^>]*>Retry/);
  assert.doesNotMatch(body, /onclick=/);
});

test("검증 전 언어 모듈은 서비스 워커가 저장하지 않고 언어 지도만 별도 캐시한다", async () => {
  const harness = createWorkerHarness();
  const packUrl = `${origin}/locales/ja.js?v=0.20.14`;
  const mapUrl = `${origin}/assets/images/game/habitat-map-ja-v1.jpg`;

  assert.equal((await harness.fetch({ method: "GET", mode: "cors", url: packUrl })).status, 200);
  assert.equal((await harness.fetch({ method: "GET", mode: "cors", url: mapUrl })).status, 200);
  const languageCache = harness.stores.get("mars-net-language-packs-v1");
  assert.equal(languageCache.has(packUrl), false);
  assert.equal(languageCache.has(mapUrl), true);
});
