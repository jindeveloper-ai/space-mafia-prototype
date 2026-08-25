import { activateLocale } from "./language-pack-loader.js?v=0.20.14";
import { resolvePreferredLocale } from "./locale-core.js?v=0.20.14";


const PROFILE_STORAGE_KEY = "oxygen-room-profile";
const AUTH_SESSION_KEY = "mars-net-auth-session-v1";
const ACCOUNT_CACHE_PREFIX = "mars-net-account-cache:";

function storedLocale() {
  try {
    return JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null")?.locale ?? null;
  } catch {
    return null;
  }
}

function cachedAccountLocale() {
  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) ?? "null");
    const userId = typeof session?.user?.id === "string" ? session.user.id : "";
    if (!userId) return null;
    return JSON.parse(window.localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}${userId}`) ?? "null")?.profile?.locale ?? null;
  } catch {
    return null;
  }
}

const requestedLocale = resolvePreferredLocale({
  urlLocale: new URLSearchParams(window.location.search).get("lang"),
  accountLocale: cachedAccountLocale(),
  storedLocale: storedLocale(),
  browserLocales: navigator.languages,
});

void startFriendRoom();

async function startFriendRoom() {
  try {
    await prepareLanguagePackCache();
    try {
      await activateLocale(requestedLocale);
    } catch (error) {
      if (requestedLocale === "en") throw error;
      await activateLocale("en");
    }
    await import("./friend-mode.js?v=0.20.14");
  } catch (error) {
    console.error("Unable to start the friend room with a verified language pack.", error);
    showLanguagePackError();
  }
}

async function prepareLanguagePackCache() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js?v=0.20.14", { scope: "./" });
    await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn("Offline language-pack caching is unavailable.", error);
  }
}

function showLanguagePackError() {
  document.documentElement.lang = "en";
  const app = document.querySelector("#friend-app");
  if (!app) return;
  const title = document.createElement("h1");
  const body = document.createElement("p");
  const retry = document.createElement("button");
  title.textContent = "Language pack unavailable";
  body.textContent = "Connect to the internet and retry. An installed language pack will work offline.";
  retry.type = "button";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => window.location.reload());
  app.replaceChildren(title, body, retry);
}
