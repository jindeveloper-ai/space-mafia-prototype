/// <reference lib="webworker" />

const LANGUAGE_PACK_CACHE = "mars-net-language-packs-v1";
const APP_SHELL_CACHE = "mars-net-app-shell-v0.20.14";
const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=0.20.14",
  "./voice-call.css?v=0.20.14",
  "./account.css?v=0.20.14",
  "./theme.js?v=0.20.14",
  "./sound.js?v=0.20.14",
  "./bootstrap.js?v=0.20.14",
  "./locale-core.js?v=0.20.14",
  "./language-pack-loader.js?v=0.20.14",
  "./i18n.js?v=0.20.14",
  "./game.js?v=0.20.14",
  "./game-engine.js?v=0.20.14",
  "./progression.js?v=0.20.14",
  "./account-client.js?v=0.20.14",
  "./account-core.js?v=0.20.14",
  "./chat-adapter.js?v=0.20.14",
  "./language-settings.js?v=0.20.14",
  "./voice-call.js?v=0.20.14",
  "./voice-call-core.js?v=0.20.14",
  "./friend-call.js?v=0.20.14",
  "./call-audio-effects.js?v=0.20.14",
  "./voice-turn.js?v=0.20.14",
  "./friend.html",
  "./friend-mode.css?v=0.20.14",
  "./friend-bootstrap.js?v=0.20.14",
  "./friend-i18n.js?v=0.20.14",
  "./friend-mode.js?v=0.20.14",
  "./privacy.html",
  "./terms.html",
  "./legal.css?v=0.20.14",
  "./assets/images/mafia-astronaut-v2.png?v=0.20.14",
];
const workerScope = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

function offlineDocument() {
  return new Response(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MARS.NET · Offline</title><style>body{max-width:34rem;margin:0 auto;padding:3rem 1.25rem;background:#111;color:#fff;font:16px/1.5 system-ui}button{min-height:44px;padding:.7rem 1rem;border:0;border-radius:999px;font:inherit;font-weight:700}</style>
<main><h1>MARS.NET is offline</h1><p>Connect to the internet and retry. Installed language packs will work after the app has loaded online once.</p><a href="">Retry</a></main></html>`, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function appNavigation(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const url = new URL(request.url);
    const fallbackPath = url.pathname.endsWith("/friend.html")
      ? "./friend.html"
      : url.pathname.endsWith("/privacy.html")
        ? "./privacy.html"
        : url.pathname.endsWith("/terms.html")
          ? "./terms.html"
          : "./index.html";
    return await cache.match(request)
      ?? await cache.match(fallbackPath)
      ?? offlineDocument();
  }
}

/**
 * @param {Request | string} request
 * @param {string} cacheName
 * @param {boolean} [storeResponse]
 * @param {CacheQueryOptions} [matchOptions]
 */
async function cachedAsset(request, cacheName, storeResponse = true, matchOptions) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, matchOptions);
  if (cached) return cached;
  const response = await fetch(request);
  if (storeResponse && response.ok) await cache.put(request, response.clone());
  return response;
}

workerScope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_ASSETS);
    await workerScope.skipWaiting();
  })());
});

workerScope.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("mars-net-app-shell-") && name !== APP_SHELL_CACHE)
      .map((name) => caches.delete(name)));
    await workerScope.clients.claim();
  })());
});

workerScope.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSameOriginGet = event.request.method === "GET" && url.origin === workerScope.location.origin;
  const isPackModule = /\/locales\/(?:ko|en|ja|zh-CN|zh-TW|yue-Hant-HK|es-419)\.js$/u.test(url.pathname);
  const isLocalizedMap = /\/assets\/images\/game\/habitat-map-(?:ko|en|ja|zh-CN|zh-TW|yue-Hant-HK|es-419)-v1\.jpg$/u
    .test(url.pathname);
  const isLanguageAsset = isSameOriginGet && (isPackModule || isLocalizedMap);
  if (!isSameOriginGet) return;

  if (event.request.mode === "navigate") {
    event.respondWith(appNavigation(event.request));
    return;
  }
  if (isLanguageAsset) {
    event.respondWith(cachedAsset(event.request, LANGUAGE_PACK_CACHE, isLocalizedMap, undefined));
    return;
  }
  if (/\.(?:css|js|svg|png|jpe?g|webp|woff2?|mp3|mp4)$/u.test(url.pathname)) {
    event.respondWith(cachedAsset(event.request, APP_SHELL_CACHE, true, { ignoreSearch: true }));
  }
});
