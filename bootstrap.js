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
const noticeLanguage = requestedLocale === "ko" ? "ko" : "en";

if (window.location.protocol === "file:") {
  const notice = /** @type {HTMLElement | null} */ (document.querySelector("#file-protocol-notice"));
  const pageShell = /** @type {HTMLElement | null} */ (document.querySelector(".page-shell"));
  if (!notice || !pageShell) throw new Error("The app shell is incomplete.");
  const copy = noticeLanguage === "en"
    ? {
        title: "Opening the app as a file is not supported.",
        body: "Run the local server so profiles, chat, and the API proxy work securely.",
        link: "Open the app after starting the server",
      }
    : {
        title: "직접 파일 실행은 지원하지 않습니다.",
        body: "프로필·채팅·API 보안을 위해 로컬 서버로 실행해 주세요.",
        link: "서버 실행 후 앱 열기",
      };
  document.documentElement.lang = noticeLanguage;
  pageShell.hidden = true;
  notice.hidden = false;
  const title = notice.querySelector("[data-file-notice-title]");
  const body = notice.querySelector("[data-file-notice-body]");
  const link = /** @type {HTMLAnchorElement | null} */ (notice.querySelector("[data-file-notice-link]"));
  if (!title || !body || !link) throw new Error("The file-protocol notice is incomplete.");
  title.textContent = copy.title;
  body.textContent = copy.body;
  link.textContent = copy.link;
  link.href = `http://127.0.0.1:4173/?lang=${requestedLocale}`;
} else {
  void startApp();
}

async function startApp() {
  try {
    await prepareLanguagePackCache();
    try {
      await activateLocale(requestedLocale);
    } catch (error) {
      if (requestedLocale === "en") throw error;
      await activateLocale("en");
    }
    await import("./game.js?v=0.20.14");
  } catch (error) {
    showLanguagePackError(error);
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

function showLanguagePackError(error) {
  console.error("Unable to start with a verified language pack.", error);
  document.documentElement.lang = "en";
  const app = document.querySelector("#app");
  if (!app) return;
  const topbar = document.querySelector(".topbar");
  const footer = document.querySelector("footer");
  const floatingSettings = document.querySelector(".language-switch--floating");
  if (topbar instanceof HTMLElement) topbar.hidden = true;
  if (footer instanceof HTMLElement) footer.hidden = true;
  if (floatingSettings instanceof HTMLElement) floatingSettings.hidden = true;
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
