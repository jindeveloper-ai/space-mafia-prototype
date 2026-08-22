import {
  ACCOUNT_SCHEMA_VERSION,
  ARCHIVE_VISIT_STORAGE_KEY,
  buildMatchRecord,
  CHAT_HISTORY_STORAGE_KEY,
  createMutationId,
  GUEST_BACKUP_STORAGE_KEY,
  MATCH_HISTORY_STORAGE_KEY,
  mergeAccountSnapshot,
  PROFILE_STORAGE_KEY,
  PROGRESSION_STORAGE_KEY,
  sanitizeChats,
  sanitizeMatches,
} from "./account-core.js?v=0.20.2";
import { createProgression } from "./progression.js?v=0.20.2";

const AUTH_SESSION_KEY = "mars-net-auth-session-v1";
const AUTH_TRANSACTION_KEY = "mars-net-auth-transaction-v1";
const AUTH_ENTRY_STORAGE_KEY = "mars-net-auth-entry-v1";
const ACCOUNT_CACHE_PREFIX = "mars-net-account-cache:";
const QUEUE_DATABASE = "mars-net-cloud-v1";
const QUEUE_STORE = "mutations";
const CREW_IDS = ["mina", "juno", "noel"];

const COPY = {
  ko: {
    guest: "게스트 · 이 기기에 저장됨",
    signedIn: "클라우드 저장 중",
    saved: "클라우드 저장 완료",
    syncing: "동기화 중",
    pending: "동기화 대기",
    saveTitle: "이 기록을 계정에 저장",
    saveLead: "로그인하면 다른 기기에서도 성장·판 기록·개인 채팅을 이어갈 수 있어요.",
    saveAction: "로그인하고 기록 저장",
    accountTitle: "MARS.NET 계정",
    loginLead: "게스트 플레이는 계속 가능합니다. 로그인하면 현재 기기 기록을 안전하게 합칩니다.",
    google: "Google로 계속하기",
    email: "이메일로 로그인",
    guestAction: "게스트로 시작",
    authEyebrow: "2050 · MARS.NET",
    authTitle: "화성에서 기다리는 친구들",
    authLead: "로그인해서 기록을 이어가거나, 게스트로 바로 시작하세요.",
    authLoading: "계정 연결 상태를 확인하는 중…",
    guestNote: "가입 없이 바로 시작할 수 있어요. 진행 기록은 이 기기에 저장됩니다.",
    privacyPolicy: "개인정보처리방침",
    termsOfService: "이용약관",
    emailLoginTitle: "이메일로 로그인",
    emailSignupTitle: "MARS.NET 계정 만들기",
    emailResetTitle: "비밀번호 재설정",
    recoveryTitle: "새 비밀번호 설정",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    passwordConfirmLabel: "비밀번호 확인",
    passwordHint: "8자 이상 입력하세요.",
    emailPlaceholder: "you@example.com",
    loginAction: "로그인",
    signupAction: "회원가입",
    resetAction: "재설정 메일 보내기",
    updatePasswordAction: "새 비밀번호 저장",
    forgotPassword: "비밀번호를 잊었나요?",
    createAccount: "처음이신가요? 회원가입",
    existingAccount: "이미 계정이 있나요? 로그인",
    back: "이전으로",
    confirmationSent: "인증 메일을 보냈습니다. 이메일을 확인한 뒤 로그인해 주세요.",
    resetSent: "입력한 주소가 등록되어 있다면 재설정 메일을 보냈습니다.",
    passwordUpdated: "비밀번호를 변경했습니다.",
    invalidEmail: "올바른 이메일 주소를 입력해 주세요.",
    passwordMismatch: "비밀번호가 서로 다릅니다.",
    authError: "로그인 정보를 확인하거나 잠시 뒤 다시 시도해 주세요.",
    providerGoogle: "Google",
    providerEmail: "이메일",
    unavailable: "클라우드 저장 설정 전입니다. 게임은 이 기기에 계속 저장됩니다.",
    connected: "연결된 로그인",
    lastSync: "마지막 동기화",
    never: "아직 없음",
    export: "전체 기록 JSON 내보내기",
    deleteChats: "캐릭터별 채팅 삭제",
    deleteChat: (name) => `${name} 채팅 삭제`,
    logout: "로그아웃",
    deleteAccount: "계정과 클라우드 기록 삭제",
    feedback: "제작자에게 피드백·문의 보내기",
    close: "계정 창 닫기",
    confirmChatDelete: "이 캐릭터와의 저장된 채팅을 모두 삭제할까요? 되돌릴 수 없습니다.",
    confirmAccountDelete: "계정, 성장 기록, 판 기록, 개인 채팅, 프로필 이미지를 모두 삭제할까요? 되돌릴 수 없습니다.",
    reauth: "보안을 위해 다시 로그인한 뒤 계정 삭제를 시도해 주세요.",
    error: "클라우드 연결에 실패했습니다. 로컬 플레이는 계속할 수 있어요.",
    characters: { mina: "미나", juno: "주노", noel: "노엘" },
  },
  en: {
    guest: "Guest · saved on this device",
    signedIn: "Saving to cloud",
    saved: "Saved to cloud",
    syncing: "Syncing",
    pending: "Waiting to sync",
    saveTitle: "Save this record to an account",
    saveLead: "Sign in to keep progression, matches, and private chats across devices.",
    saveAction: "Sign in and save",
    accountTitle: "MARS.NET account",
    loginLead: "Guest play stays available. Signing in safely merges this device's records.",
    google: "Continue with Google",
    email: "Continue with email",
    guestAction: "Continue as guest",
    authEyebrow: "2050 · MARS.NET",
    authTitle: "Your friends are waiting on Mars",
    authLead: "Sign in to continue your record, or jump in as a guest.",
    authLoading: "Checking your account…",
    guestNote: "No account needed. Your progress will stay on this device.",
    privacyPolicy: "Privacy",
    termsOfService: "Terms",
    emailLoginTitle: "Sign in with email",
    emailSignupTitle: "Create a MARS.NET account",
    emailResetTitle: "Reset your password",
    recoveryTitle: "Set a new password",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordConfirmLabel: "Confirm password",
    passwordHint: "Use at least 8 characters.",
    emailPlaceholder: "you@example.com",
    loginAction: "Sign in",
    signupAction: "Create account",
    resetAction: "Send reset email",
    updatePasswordAction: "Save new password",
    forgotPassword: "Forgot password?",
    createAccount: "New here? Create an account",
    existingAccount: "Already have an account? Sign in",
    back: "Back",
    confirmationSent: "We sent a confirmation email. Verify it, then sign in.",
    resetSent: "If that address is registered, a reset email is on its way.",
    passwordUpdated: "Your password has been updated.",
    invalidEmail: "Enter a valid email address.",
    passwordMismatch: "The passwords do not match.",
    authError: "Check your details or try again in a moment.",
    providerGoogle: "Google",
    providerEmail: "Email",
    unavailable: "Cloud saving is not configured yet. The game will keep saving on this device.",
    connected: "Connected sign-in",
    lastSync: "Last synced",
    never: "Not yet",
    export: "Export all records as JSON",
    deleteChats: "Delete chat by character",
    deleteChat: (name) => `Delete ${name} chat`,
    logout: "Log out",
    deleteAccount: "Delete account and cloud records",
    feedback: "Send feedback or a question to the creator",
    close: "Close account panel",
    confirmChatDelete: "Delete every saved chat with this character? This cannot be undone.",
    confirmAccountDelete: "Delete the account, progression, matches, private chats, and avatar? This cannot be undone.",
    reauth: "For security, sign in again before deleting the account.",
    error: "Cloud connection failed. Local play is still available.",
    characters: { mina: "Mina", juno: "Juno", noel: "Noel" },
  },
};

const locale = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "ko";
const text = COPY[locale];
const nowIso = () => new Date().toISOString();
const readJson = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
const removeValue = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or locked-down browsing contexts.
  }
};
const escapeHtml = (value) => {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML;
};
const base64Url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replaceAll("+", "-")
  .replaceAll("/", "_")
  .replace(/=+$/u, "");
const sha256 = async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const decodeJwtPayload = (token) => {
  try {
    const encoded = String(token).split(".")[1]?.replaceAll("-", "+").replaceAll("_", "/");
    if (!encoded) return {};
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
  } catch {
    return {};
  }
};

function publicSession(raw) {
  const accessToken = raw?.access_token ?? raw?.accessToken;
  const refreshToken = raw?.refresh_token ?? raw?.refreshToken;
  if (!accessToken || !refreshToken) return null;
  const expiresAt = Number(raw.expires_at ?? raw.expiresAt) || Math.floor(Date.now() / 1_000) + Number(raw.expires_in ?? 3_600);
  return {
    accessToken: String(accessToken),
    refreshToken: String(refreshToken),
    expiresAt,
    user: {
      id: String(raw.user?.id ?? ""),
      email: String(raw.user?.email ?? "").slice(0, 254),
      provider: raw.user?.provider === "google" || raw.user?.app_metadata?.provider === "google" ? "google" : "email",
    },
  };
}

class SupabasePkceAuth {
  constructor() {
    this.config = { enabled: false, providers: { google: false, email: false } };
    this.session = publicSession(readJson(AUTH_SESSION_KEY, null));
    this.recoveryMode = false;
  }

  async initialize() {
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    this.config = response.ok ? await response.json() : this.config;
    const url = new URL(window.location.href);
    this.consumeHashCallback(url);
    if (url.searchParams.has("code")) await this.exchangeCallback(url);
    await this.refreshIfNeeded();
    return this.session;
  }

  consumeHashCallback(url) {
    const params = new URLSearchParams(url.hash.replace(/^#/u, ""));
    if (!params.has("access_token") || !params.has("refresh_token")) return;
    const claims = decodeJwtPayload(params.get("access_token"));
    this.setSession({
      access_token: params.get("access_token"),
      refresh_token: params.get("refresh_token"),
      expires_in: params.get("expires_in"),
      user: {
        id: claims.sub,
        email: claims.email,
        app_metadata: claims.app_metadata,
      },
    });
    this.recoveryMode = params.get("type") === "recovery";
    history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  async request(path, body, options = {}) {
    if (!this.config.enabled) throw new Error("auth_unavailable");
    const endpoint = new URL(`${this.config.supabaseUrl}/auth/v1/${path}`);
    if (options.redirectTo) endpoint.searchParams.set("redirect_to", options.redirectTo);
    const response = await fetch(endpoint, {
      method: options.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.config.publishableKey,
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("auth_request_failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async signInWithEmail(email, password) {
    if (!this.config.providers?.email) throw new Error("auth_unavailable");
    this.setSession(await this.request("token?grant_type=password", { email, password }));
    return this.session;
  }

  async signUpWithEmail(email, password) {
    if (!this.config.providers?.email) throw new Error("auth_unavailable");
    const returnUrl = new URL(window.location.href);
    returnUrl.hash = "";
    returnUrl.searchParams.delete("code");
    const result = await this.request("signup", { email, password }, { redirectTo: returnUrl.toString() });
    this.setSession(result);
    return { session: this.session, confirmationRequired: !this.session };
  }

  async requestPasswordReset(email) {
    if (!this.config.providers?.email) throw new Error("auth_unavailable");
    const returnUrl = new URL(window.location.href);
    returnUrl.hash = "";
    await this.request("recover", { email }, { redirectTo: returnUrl.toString() });
  }

  async updatePassword(password) {
    const token = await this.accessToken();
    if (!token || !this.recoveryMode) throw new Error("authentication_required");
    await this.request("user", { password }, { method: "PUT", token });
    this.recoveryMode = false;
  }

  async signInWithGoogle() {
    if (!this.config.enabled || !this.config.providers?.google) throw new Error("auth_unavailable");
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64Url(await sha256(verifier));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.delete("code");
    returnUrl.searchParams.set("auth_state", state);
    window.sessionStorage.setItem(AUTH_TRANSACTION_KEY, JSON.stringify({ verifier, state, createdAt: Date.now() }));
    const authorize = new URL(`${this.config.supabaseUrl}/auth/v1/authorize`);
    authorize.searchParams.set("provider", "google");
    authorize.searchParams.set("redirect_to", returnUrl.toString());
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "s256");
    window.location.assign(authorize.toString());
  }

  async exchangeCallback(url) {
    let transaction = null;
    try {
      transaction = JSON.parse(window.sessionStorage.getItem(AUTH_TRANSACTION_KEY) ?? "null");
    } catch {
      transaction = null;
    }
    const state = url.searchParams.get("auth_state");
    if (!transaction || transaction.state !== state || Date.now() - transaction.createdAt > 10 * 60_000) {
      throw new Error("auth_state_invalid");
    }
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.config.publishableKey },
      body: JSON.stringify({ auth_code: url.searchParams.get("code"), code_verifier: transaction.verifier }),
    });
    if (!response.ok) throw new Error("auth_exchange_failed");
    this.setSession(await response.json());
    window.sessionStorage.removeItem(AUTH_TRANSACTION_KEY);
    url.searchParams.delete("code");
    url.searchParams.delete("auth_state");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async refreshIfNeeded() {
    if (!this.session || this.session.expiresAt > Math.floor(Date.now() / 1_000) + 60) return this.session;
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.config.publishableKey },
      body: JSON.stringify({ refresh_token: this.session.refreshToken }),
    });
    if (!response.ok) {
      this.setSession(null);
      return null;
    }
    this.setSession(await response.json());
    return this.session;
  }

  setSession(raw) {
    this.session = publicSession(raw);
    if (this.session) writeJson(AUTH_SESSION_KEY, this.session);
    else removeValue(AUTH_SESSION_KEY);
  }

  async accessToken() {
    await this.refreshIfNeeded();
    return this.session?.accessToken ?? null;
  }

  async signOut() {
    try {
      const token = await this.accessToken();
      if (token && this.config.enabled) {
        await fetch(`${this.config.supabaseUrl}/auth/v1/logout`, {
          method: "POST",
          headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } finally {
      this.setSession(null);
    }
  }
}

class OfflineQueue {
  constructor() {
    this.memory = [];
    this.database = this.open();
  }

  open() {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open(QUEUE_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async transaction(mode, callback) {
    const database = await this.database;
    if (!database) return null;
    return new Promise((resolve) => {
      const transaction = database.transaction(QUEUE_STORE, mode);
      const request = callback(transaction.objectStore(QUEUE_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async add(item) {
    const database = await this.database;
    if (!database) {
      this.memory = [...this.memory.filter((entry) => entry.id !== item.id), item];
      return;
    }
    await this.transaction("readwrite", (store) => store.put(item));
  }

  async list() {
    const database = await this.database;
    if (!database) return [...this.memory];
    return (await this.transaction("readonly", (store) => store.getAll()) ?? [])
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async remove(id) {
    const database = await this.database;
    if (!database) {
      this.memory = this.memory.filter((entry) => entry.id !== id);
      return;
    }
    await this.transaction("readwrite", (store) => store.delete(id));
  }
}

class AccountController extends EventTarget {
  constructor() {
    super();
    this.auth = new SupabasePkceAuth();
    this.queue = new OfflineQueue();
    this.revision = 0;
    this.syncState = "guest";
    this.lastSync = null;
    this.modalOpen = false;
    this.initialized = false;
    this.syncTimer = null;
    this.flushing = false;
    this.modalOpener = null;
    this.chatCursors = Object.fromEntries(CREW_IDS.map((id) => [id, null]));
    window.addEventListener("online", () => void this.flush());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.modalOpen) this.closeModal();
    });
  }

  get signedIn() {
    return Boolean(this.auth.session?.user?.id);
  }

  get guestSelected() {
    return readJson(AUTH_ENTRY_STORAGE_KEY, null)?.mode === "guest";
  }

  notify() {
    this.dispatchEvent(new Event("change"));
    document.querySelectorAll("mars-account-control, mars-account-save, mars-auth-gate").forEach((element) => element.render?.());
    this.renderModal();
  }

  setSyncState(value) {
    this.syncState = value;
    this.notify();
  }

  async initialize() {
    this.registerElements();
    this.renderModal();
    const hadStoredSession = Boolean(this.auth.session);
    try {
      await this.auth.initialize();
      if (this.signedIn) {
        removeValue(AUTH_ENTRY_STORAGE_KEY);
        await this.bootstrap();
      }
      else if (hadStoredSession) {
        this.restoreGuestBackup();
        window.dispatchEvent(new CustomEvent("mars:account-hydrated", { detail: this.localSnapshot() }));
      }
    } catch {
      this.setSyncState("error");
    }
    this.initialized = true;
    this.notify();
    if (this.auth.recoveryMode) this.requireAuthentication("recovery");
    else if (this.signedIn) this.completeEntry("account");
    else if (this.guestSelected) this.completeEntry("guest");
  }

  completeEntry(mode) {
    window.dispatchEvent(new CustomEvent("mars:auth-entered", { detail: { mode } }));
  }

  continueAsGuest() {
    writeJson(AUTH_ENTRY_STORAGE_KEY, { version: 1, mode: "guest" });
    this.setSyncState("guest");
    this.completeEntry("guest");
  }

  async finishEmailAuthentication() {
    removeValue(AUTH_ENTRY_STORAGE_KEY);
    try {
      await this.bootstrap();
    } catch {
      this.setSyncState("error");
    }
    this.notify();
    this.completeEntry("account");
  }

  async loginWithEmail(email, password) {
    await this.auth.signInWithEmail(email, password);
    await this.finishEmailAuthentication();
  }

  async signupWithEmail(email, password) {
    const result = await this.auth.signUpWithEmail(email, password);
    if (result.session) await this.finishEmailAuthentication();
    return result;
  }

  async requestPasswordReset(email) {
    await this.auth.requestPasswordReset(email);
  }

  async updateRecoveredPassword(password) {
    await this.auth.updatePassword(password);
    await this.finishEmailAuthentication();
  }

  requireAuthentication(view = "choice") {
    removeValue(AUTH_ENTRY_STORAGE_KEY);
    this.modalOpen = false;
    this.renderModal();
    window.dispatchEvent(new CustomEvent("mars:auth-required", { detail: { view } }));
  }

  requestHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.auth.session?.accessToken ?? ""}` };
  }

  async api(path, options = {}, { optionalAuth = false } = {}) {
    const token = await this.auth.accessToken();
    if (!token && !optionalAuth) throw new Error("authentication_required");
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error ?? `http_${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  localSnapshot() {
    const profile = readJson(PROFILE_STORAGE_KEY, {});
    return {
      version: ACCOUNT_SCHEMA_VERSION,
      profile: {
        ...profile,
        locale,
        updatedAt: Number(profile.updatedAt) || (profile.name || profile.avatar ? Date.now() : 0),
      },
      progression: createProgression(readJson(PROGRESSION_STORAGE_KEY, null)),
      archiveDates: readJson(ARCHIVE_VISIT_STORAGE_KEY, { dates: [] }).dates ?? [],
      matches: sanitizeMatches(readJson(MATCH_HISTORY_STORAGE_KEY, { matches: [] })),
      chats: sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {})),
    };
  }

  saveGuestBackup() {
    if (!readJson(GUEST_BACKUP_STORAGE_KEY, null)) writeJson(GUEST_BACKUP_STORAGE_KEY, this.localSnapshot());
  }

  restoreGuestBackup() {
    const backup = readJson(GUEST_BACKUP_STORAGE_KEY, null);
    if (!backup) return;
    this.writeSnapshot(backup, false);
    removeValue(GUEST_BACKUP_STORAGE_KEY);
  }

  writeSnapshot(snapshot, dispatch = true) {
    const normalized = mergeAccountSnapshot(snapshot, {}, createProgression);
    const currentProfile = readJson(PROFILE_STORAGE_KEY, {});
    writeJson(PROFILE_STORAGE_KEY, {
      ...normalized.profile,
      avatar: snapshot?.profile?.avatar ?? currentProfile.avatar ?? "",
    });
    writeJson(PROGRESSION_STORAGE_KEY, normalized.progression);
    writeJson(ARCHIVE_VISIT_STORAGE_KEY, { version: 1, dates: normalized.archiveDates });
    writeJson(MATCH_HISTORY_STORAGE_KEY, { version: 1, matches: normalized.matches });
    writeJson(CHAT_HISTORY_STORAGE_KEY, normalized.chats);
    if (dispatch) window.dispatchEvent(new CustomEvent("mars:account-hydrated", { detail: normalized }));
    return normalized;
  }

  async bootstrap() {
    this.saveGuestBackup();
    this.setSyncState("syncing");
    const local = this.localSnapshot();
    const result = await this.api("/api/account/bootstrap", {
      method: "POST",
      body: JSON.stringify({ mutationId: createMutationId(), snapshot: local }),
    });
    const merged = this.writeSnapshot(result.snapshot);
    this.revision = Number(result.snapshot?.revision ?? merged.revision) || 0;
    this.lastSync = nowIso();
    writeJson(`${ACCOUNT_CACHE_PREFIX}${this.auth.session.user.id}`, result.snapshot);
    if (local.profile?.avatar?.startsWith?.("data:image/")) await this.uploadAvatar(local.profile.avatar).catch(() => {});
    else if (result.snapshot?.profile?.avatarPath) await this.downloadAvatar().catch(() => {});
    this.setSyncState("saved");
    await this.flush();
  }

  notifyLocalState() {
    if (!this.signedIn) return;
    this.setSyncState(navigator.onLine ? "syncing" : "pending");
    window.clearTimeout(this.syncTimer);
    this.syncTimer = window.setTimeout(() => void this.enqueueState(), 1_000);
  }

  async enqueueState() {
    const item = { id: createMutationId(), type: "state", payload: this.localSnapshot(), createdAt: nowIso() };
    await this.queue.add(item);
    await this.flush();
  }

  async recordMatch(state, engineVersion) {
    const record = buildMatchRecord(state, engineVersion);
    if (!record) return;
    const local = sanitizeMatches([...readJson(MATCH_HISTORY_STORAGE_KEY, { matches: [] })?.matches ?? [], record]);
    writeJson(MATCH_HISTORY_STORAGE_KEY, { version: 1, matches: local });
    if (!this.signedIn) return;
    await this.queue.add({ id: `match:${record.roundId}`, type: "match", payload: record, createdAt: nowIso() });
    await this.flush();
  }

  appendLocalChat(characterId, messages) {
    const current = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}));
    const next = sanitizeChats({ ...current, [characterId]: [...current[characterId], ...messages] });
    writeJson(CHAT_HISTORY_STORAGE_KEY, next);
    return next[characterId];
  }

  latestChat(characterId) {
    if (!CREW_IDS.includes(characterId)) return null;
    const messages = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}))[characterId] ?? [];
    return messages.at(-1) ?? null;
  }

  async recordChat(characterId, messages) {
    if (!CREW_IDS.includes(characterId) || !messages.length) return;
    const sanitized = sanitizeChats({ [characterId]: messages })[characterId];
    this.appendLocalChat(characterId, sanitized);
    if (!this.signedIn) return;
    for (const message of sanitized) {
      await this.queue.add({ id: `chat:${message.id}`, type: "chat", payload: { characterId, message }, createdAt: message.createdAt });
    }
    await this.flush();
  }

  async loadChat(characterId) {
    const local = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}))[characterId] ?? [];
    if (!this.signedIn) return local;
    try {
      const data = await this.api(`/api/account/chats/${characterId}?limit=50`);
      this.chatCursors[characterId] = data.nextCursor ?? null;
      const merged = sanitizeChats({ [characterId]: [...local, ...(data.messages ?? [])] })[characterId];
      const all = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}));
      writeJson(CHAT_HISTORY_STORAGE_KEY, { ...all, [characterId]: merged });
      return merged;
    } catch {
      return local;
    }
  }

  hasOlderChat(characterId) {
    return this.signedIn && Boolean(this.chatCursors[characterId]);
  }

  async loadOlderChat(characterId) {
    const cursor = this.chatCursors[characterId];
    if (!this.signedIn || !CREW_IDS.includes(characterId) || !cursor) return [];
    const data = await this.api(`/api/account/chats/${characterId}?limit=50&before=${encodeURIComponent(cursor)}`);
    this.chatCursors[characterId] = data.nextCursor ?? null;
    const chats = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}));
    const merged = sanitizeChats({ [characterId]: [...(data.messages ?? []), ...chats[characterId]] })[characterId];
    writeJson(CHAT_HISTORY_STORAGE_KEY, { ...chats, [characterId]: merged });
    return merged;
  }

  async uploadAvatar(dataUrl) {
    if (!this.signedIn || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
    const result = await this.api("/api/account/avatar", { method: "PUT", body: JSON.stringify({ dataUrl }) });
    const profile = readJson(PROFILE_STORAGE_KEY, {});
    writeJson(PROFILE_STORAGE_KEY, { ...profile, avatarPath: result.path, updatedAt: Date.now() });
    this.notifyLocalState();
  }

  async downloadAvatar() {
    const token = await this.auth.accessToken();
    if (!token) return;
    const response = await fetch("/api/account/avatar", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    const avatar = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("avatar_read_failed"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    const profile = readJson(PROFILE_STORAGE_KEY, {});
    writeJson(PROFILE_STORAGE_KEY, { ...profile, avatar });
    window.dispatchEvent(new CustomEvent("mars:account-hydrated", { detail: this.localSnapshot() }));
  }

  async flush() {
    if (this.flushing || !this.signedIn || !navigator.onLine) return;
    this.flushing = true;
    try {
      const items = await this.queue.list();
      for (const item of items) {
        try {
          if (item.type === "state") {
            const result = await this.api("/api/account/state", {
              method: "PATCH",
              body: JSON.stringify({ mutationId: item.id, baseRevision: this.revision, snapshot: item.payload }),
            });
            this.revision = Number(result.revision) || this.revision + 1;
          } else if (item.type === "match") {
            await this.api("/api/account/matches", { method: "POST", body: JSON.stringify(item.payload) });
          } else if (item.type === "chat") {
            await this.api(`/api/account/chats/${item.payload.characterId}`, {
              method: "POST",
              body: JSON.stringify({ messages: [item.payload.message] }),
            });
          }
          await this.queue.remove(item.id);
          this.lastSync = nowIso();
        } catch (error) {
          if (error.status === 409 && item.type === "state") {
            const remote = await this.api("/api/account/state");
            this.revision = Number(remote.snapshot?.revision) || 0;
            item.payload = mergeAccountSnapshot(item.payload, remote.snapshot, createProgression);
            await this.queue.add(item);
            continue;
          }
          throw error;
        }
      }
      this.setSyncState("saved");
    } catch {
      this.setSyncState("pending");
    } finally {
      this.flushing = false;
    }
  }

  async login() {
    await this.auth.signInWithGoogle();
  }

  async logout() {
    const userId = this.auth.session?.user?.id;
    await this.auth.signOut();
    if (userId) removeValue(`${ACCOUNT_CACHE_PREFIX}${userId}`);
    this.restoreGuestBackup();
    this.revision = 0;
    this.modalOpen = false;
    this.setSyncState("guest");
    window.dispatchEvent(new CustomEvent("mars:account-hydrated", { detail: this.localSnapshot() }));
    this.requireAuthentication("choice");
  }

  async deleteChat(characterId) {
    if (!window.confirm(text.confirmChatDelete)) return;
    if (this.signedIn) await this.api(`/api/account/chats/${characterId}`, { method: "DELETE" });
    const chats = sanitizeChats(readJson(CHAT_HISTORY_STORAGE_KEY, {}));
    writeJson(CHAT_HISTORY_STORAGE_KEY, { ...chats, [characterId]: [] });
    this.notify();
  }

  async exportData() {
    const data = this.signedIn ? await this.api("/api/account/export") : this.localSnapshot();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mars-net-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async deleteAccount() {
    if (!this.signedIn || !window.confirm(text.confirmAccountDelete)) return;
    try {
      await this.api("/api/account", { method: "DELETE" });
      await this.logout();
    } catch (error) {
      if (error.status === 401 && error.data?.error === "recent_authentication_required") window.alert(text.reauth);
      else window.alert(text.error);
    }
  }

  openModal() {
    this.modalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.modalOpen = true;
    this.renderModal();
    document.querySelector(".account-modal button")?.focus();
  }

  closeModal() {
    this.modalOpen = false;
    this.renderModal();
    this.modalOpener?.focus();
    this.modalOpener = null;
  }

  renderModal() {
    let root = document.querySelector("#account-modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "account-modal-root";
      document.body.append(root);
    }
    if (!this.modalOpen) {
      root.innerHTML = "";
      return;
    }
    const session = this.auth.session;
    const status = this.syncState === "saved" ? text.saved : this.syncState === "syncing" ? text.syncing : this.syncState === "pending" ? text.pending : text.guest;
    const feedbackSubject = encodeURIComponent(`[MARS.NET ${document.querySelector(".footer-version")?.textContent ?? "web"}] Feedback`);
    const feedbackBody = encodeURIComponent(`Language: ${locale}\nBrowser: ${navigator.userAgent}\n\nFeedback / question:\n`);
    root.innerHTML = `
      <div class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title">
        <button class="account-modal__backdrop" type="button" data-account-action="close" aria-label="${text.close}"></button>
        <section class="account-sheet">
          <header><div><small>2050 · MARS.NET</small><h2 id="account-modal-title">${text.accountTitle}</h2></div><button type="button" data-account-action="close" aria-label="${text.close}">×</button></header>
          ${session ? `
            <div class="account-identity"><span>${escapeHtml(session.user.email.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(session.user.email)}</strong><small>${text.connected}: ${session.user.provider === "google" ? text.providerGoogle : text.providerEmail}</small></div></div>
            <dl class="account-sync-detail"><div><dt>${status}</dt><dd>${text.lastSync}: ${this.lastSync ? new Date(this.lastSync).toLocaleString(locale) : text.never}</dd></div></dl>
            <button class="account-action" type="button" data-account-action="export">${text.export}</button>
            <fieldset class="account-chat-delete"><legend>${text.deleteChats}</legend>${CREW_IDS.map((id) => `<button type="button" data-account-action="delete-chat" data-character-id="${id}">${text.deleteChat(text.characters[id])}</button>`).join("")}</fieldset>
            <button class="account-action" type="button" data-account-action="logout">${text.logout}</button>
            <button class="account-danger" type="button" data-account-action="delete-account">${text.deleteAccount}</button>
          ` : `
            <p>${text.loginLead}</p>
            ${this.auth.config.enabled && this.auth.config.providers?.google
              ? `<button class="account-google" type="button" data-account-action="google"><span aria-hidden="true">G</span>${text.google}</button>`
              : ""}
            ${this.auth.config.enabled && this.auth.config.providers?.email
              ? `<button class="account-action account-email" type="button" data-account-action="email">${text.email}</button>`
              : ""}
            ${!this.auth.config.enabled ? `<p class="account-unavailable">${text.unavailable}</p>` : ""}
          `}
          <a class="account-feedback" href="mailto:su.jin.lee.developer@gmail.com?subject=${feedbackSubject}&body=${feedbackBody}">${text.feedback}</a>
        </section>
      </div>`;
    root.querySelectorAll("[data-account-action]").forEach((button) => button.addEventListener("click", (event) => {
      const action = event.currentTarget.dataset.accountAction;
      if (action === "close") this.closeModal();
      if (action === "google") void this.login().catch(() => this.setSyncState("error"));
      if (action === "email") this.requireAuthentication("email-login");
      if (action === "export") void this.exportData();
      if (action === "logout") void this.logout();
      if (action === "delete-account") void this.deleteAccount();
      if (action === "delete-chat") void this.deleteChat(event.currentTarget.dataset.characterId);
    }));
  }

  registerElements() {
    const controller = this;
    if (!customElements.get("mars-auth-gate")) customElements.define("mars-auth-gate", class extends HTMLElement {
      constructor() {
        super();
        this.view = "choice";
        this.pending = false;
        this.notice = "";
        this.error = "";
      }

      connectedCallback() {
        const requested = this.getAttribute("initial-view");
        if (["choice", "email-login", "email-signup", "email-reset", "recovery"].includes(requested)) this.view = requested;
        this.render();
      }

      validEmail(value) {
        return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
      }

      show(view) {
        this.view = view;
        this.notice = "";
        this.error = "";
        this.render();
        this.querySelector("input")?.focus();
      }

      displayError(message) {
        this.error = message;
        let status = this.querySelector(".auth-status.is-error");
        if (!status) {
          status = document.createElement("p");
          status.className = "auth-status is-error";
          status.setAttribute("role", "alert");
          this.querySelector(".auth-screen")?.append(status);
        }
        status.textContent = message;
      }

      async perform(task) {
        if (this.pending) return;
        this.pending = true;
        this.error = "";
        this.render();
        try {
          await task();
        } catch {
          this.error = text.authError;
        } finally {
          this.pending = false;
          if (this.isConnected) this.render();
        }
      }

      emailForm(view) {
        const isSignup = view === "email-signup";
        const isReset = view === "email-reset";
        const isRecovery = view === "recovery";
        const title = isSignup
          ? text.emailSignupTitle
          : isReset
            ? text.emailResetTitle
            : isRecovery
              ? text.recoveryTitle
              : text.emailLoginTitle;
        const action = isSignup
          ? text.signupAction
          : isReset
            ? text.resetAction
            : isRecovery
              ? text.updatePasswordAction
              : text.loginAction;
        return `
          <button class="auth-back" type="button" data-auth-action="back" aria-label="${text.back}">‹</button>
          <div class="auth-heading"><span>${text.authEyebrow}</span><h1 tabindex="-1">${title}</h1></div>
          <form class="auth-email-form" data-auth-form="${view}">
            ${isRecovery ? "" : `<label><span>${text.emailLabel}</span><input name="email" type="email" maxlength="254" autocomplete="email" placeholder="${text.emailPlaceholder}" required /></label>`}
            ${isReset ? "" : `<label><span>${text.passwordLabel}</span><input name="password" type="password" minlength="8" maxlength="128" autocomplete="${isSignup ? "new-password" : isRecovery ? "new-password" : "current-password"}" required /><small>${text.passwordHint}</small></label>`}
            ${isSignup || isRecovery ? `<label><span>${text.passwordConfirmLabel}</span><input name="passwordConfirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required /></label>` : ""}
            <button class="auth-primary" type="submit" ${this.pending ? "disabled" : ""}>${action}</button>
          </form>
          ${view === "email-login" ? `<div class="auth-text-actions"><button type="button" data-auth-action="email-signup">${text.createAccount}</button><button type="button" data-auth-action="email-reset">${text.forgotPassword}</button></div>` : ""}
          ${isSignup || isReset ? `<button class="auth-existing" type="button" data-auth-action="email-login">${text.existingAccount}</button>` : ""}
        `;
      }

      render() {
        if (!controller.initialized) {
          this.innerHTML = `<section class="auth-screen is-loading"><div class="auth-loading" role="status"><span>${text.authEyebrow}</span><p>${text.authLoading}</p></div></section>`;
          return;
        }
        const view = controller.auth.recoveryMode ? "recovery" : this.view;
        const content = view === "choice" ? `
          <div class="auth-brand"><span>${text.authEyebrow}</span><strong>MARS.NET</strong></div>
          <div class="auth-art" aria-hidden="true"><img src="./assets/images/mafia-astronaut-v2.png" alt="" /></div>
          <div class="auth-heading"><h1 tabindex="-1">${text.authTitle}</h1><p>${text.authLead}</p></div>
          <div class="auth-actions">
            <button class="auth-google" type="button" data-auth-action="google" ${this.pending ? "disabled" : ""}><span aria-hidden="true">G</span>${text.google}</button>
            <button class="auth-email" type="button" data-auth-action="email-login" ${this.pending ? "disabled" : ""}>${text.email}</button>
            <span class="auth-divider" aria-hidden="true"></span>
            <button class="auth-primary" type="button" data-auth-action="guest" ${this.pending ? "disabled" : ""}>${text.guestAction}</button>
            <small>${text.guestNote}</small>
            <nav class="auth-legal" aria-label="${text.privacyPolicy} · ${text.termsOfService}">
              <a href="./privacy.html" target="_blank" rel="noopener">${text.privacyPolicy}</a>
              <span aria-hidden="true">·</span>
              <a href="./terms.html" target="_blank" rel="noopener">${text.termsOfService}</a>
            </nav>
          </div>
          ${!controller.auth.config.enabled ? `<p class="account-unavailable">${text.unavailable}</p>` : ""}
        ` : this.emailForm(view);
        this.innerHTML = `
          <section class="auth-screen ${view === "choice" ? "is-choice" : "is-email"}">
            ${content}
            ${this.notice ? `<p class="auth-status is-notice" role="status">${escapeHtml(this.notice)}</p>` : ""}
            ${this.error ? `<p class="auth-status is-error" role="alert">${escapeHtml(this.error)}</p>` : ""}
          </section>`;
        this.querySelectorAll("[data-auth-action]").forEach((button) => button.addEventListener("click", () => {
          const action = button.dataset.authAction;
          if (action === "back") this.show("choice");
          if (action === "email-login" || action === "email-signup" || action === "email-reset") this.show(action);
          if (action === "guest") controller.continueAsGuest();
          if (action === "google") void this.perform(() => controller.login());
        }));
        this.querySelector("form")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const email = String(form.get("email") ?? "").trim().toLowerCase();
          const password = String(form.get("password") ?? "");
          const confirmation = String(form.get("passwordConfirm") ?? "");
          if (view !== "recovery" && !this.validEmail(email)) {
            this.displayError(text.invalidEmail);
            return;
          }
          if ((view === "email-signup" || view === "recovery") && password !== confirmation) {
            this.displayError(text.passwordMismatch);
            return;
          }
          if (view === "email-login") void this.perform(() => controller.loginWithEmail(email, password));
          if (view === "email-signup") void this.perform(async () => {
            const result = await controller.signupWithEmail(email, password);
            if (result.confirmationRequired) {
              this.view = "email-login";
              this.notice = text.confirmationSent;
            }
          });
          if (view === "email-reset") void this.perform(async () => {
            await controller.requestPasswordReset(email);
            this.view = "email-login";
            this.notice = text.resetSent;
          });
          if (view === "recovery") void this.perform(() => controller.updateRecoveredPassword(password));
        });
      }
    });
    if (!customElements.get("mars-account-control")) customElements.define("mars-account-control", class extends HTMLElement {
      connectedCallback() { this.render(); }
      render() {
        const label = controller.signedIn
          ? controller.syncState === "saved" ? text.saved : controller.syncState === "pending" ? text.pending : text.signedIn
          : text.guest;
        this.innerHTML = `<button class="account-chip ${controller.signedIn ? "is-signed-in" : ""}" type="button"><span aria-hidden="true">${controller.signedIn ? "✓" : "○"}</span>${label}</button>`;
        this.querySelector("button")?.addEventListener("click", () => controller.openModal());
      }
    });
    if (!customElements.get("mars-account-save")) customElements.define("mars-account-save", class extends HTMLElement {
      connectedCallback() { this.render(); }
      render() {
        this.innerHTML = controller.signedIn ? "" : `<article class="account-save-card"><div><strong>${text.saveTitle}</strong><p>${text.saveLead}</p></div><button type="button">${text.saveAction}</button></article>`;
        this.querySelector("button")?.addEventListener("click", () => controller.openModal());
      }
    });
  }
}

export const accountController = new AccountController();
export { createMutationId };
