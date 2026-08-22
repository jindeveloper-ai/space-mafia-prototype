import { getFriendCopy } from "./friend-i18n.js?v=0.20.3";

const app = document.querySelector("#friend-app");
const params = new URLSearchParams(window.location.search);
const locale = params.get("lang") === "en" ? "en" : "ko";
const copy = getFriendCopy(locale);
const SESSION_KEY = "mars-net-friend-room-v1";
const PROFILE_KEY = "oxygen-room-profile";
const EMOJI = ["😂", "🥹", "😅", "🤔", "👀", "😳", "👍", "👏", "❤️", "🔥", "🚀", "🤨"];
const AVATARS = {
  "astronaut-purple": "👾",
  "astronaut-green": "🧩",
  "astronaut-gold": "🌕",
  initial: "A",
};
const CHARACTER_IMAGES = {
  mina: "./assets/images/mina.png",
  juno: "./assets/images/juno.png",
  noel: "./assets/images/noel.png",
};
const CHARACTER_NAMES = locale === "ko"
  ? { mina: "미나", juno: "주노", noel: "노엘" }
  : { mina: "Mina", juno: "Juno", noel: "Noel" };

let mode = params.get("room") ? "join" : "create";
let session = loadSession();
let snapshot = null;
let socket = null;
let shouldReconnect = true;
let reconnectAttempt = 0;
let reconnectTimer = null;
let disconnectRefreshTimer = null;
let connectionState = "disconnected";
let busy = false;
let errorCode = null;
let copied = false;
let pendingChatActionId = null;

document.documentElement.lang = locale;
document.title = copy.meta.title;
document.querySelector("[data-home-link]").href = `./?lang=${locale}`;
document.querySelector("[data-home-link]").setAttribute("aria-label", copy.meta.back);
document.querySelector(".language-switch").setAttribute("aria-label", copy.meta.language);
document.querySelectorAll("[data-lang]").forEach((link) => {
  const next = new URL(link.href);
  if (snapshot?.code || params.get("room")) next.searchParams.set("room", snapshot?.code || params.get("room"));
  link.href = next.toString();
  link.setAttribute("aria-current", link.dataset.lang === locale ? "page" : "false");
});

const themeController = window.oxygenRoomTheme;
const themeButton = document.querySelector("[data-theme-action]");
function renderTheme() {
  const theme = themeController?.read() ?? "system";
  const name = locale === "ko"
    ? { system: "자동", light: "라이트", dark: "다크" }[theme]
    : { system: "Auto", light: "Light", dark: "Dark" }[theme];
  themeButton.querySelector(".theme-icon").textContent = { system: "◐", light: "○", dark: "●" }[theme];
  themeButton.querySelector(".theme-text").textContent = name;
  themeButton.setAttribute("aria-label", copy.meta.themeControl(name));
}
themeButton.addEventListener("click", () => { themeController?.next(); renderTheme(); });
renderTheme();
window.oxygenRoomSound?.setLabels(copy.meta.audio);

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function loadSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
    return parsed && typeof parsed.code === "string" && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(value) {
  session = value;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

function savedName() {
  try {
    return String(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null")?.name ?? "").slice(0, 12);
  } catch {
    return "";
  }
}

function newActionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function errorText(code) {
  return copy.errors[code] ?? copy.errors.generic;
}

function participantMap() {
  if (!snapshot) return {};
  const values = Object.fromEntries(snapshot.players.map((player) => [player.id, player]));
  snapshot.characters.forEach((character) => { values[character.id] = character; });
  return values;
}

function displayName(id) {
  return participantMap()[id]?.name ?? CHARACTER_NAMES[id] ?? id;
}

function avatar(id, avatarId, name) {
  if (CHARACTER_IMAGES[id]) {
    return `<span class="friend-player__avatar"><img src="${CHARACTER_IMAGES[id]}" alt="" /></span>`;
  }
  const symbol = avatarId === "initial" ? String(name || "?").slice(0, 1).toUpperCase() : AVATARS[avatarId] ?? "A";
  return `<span class="friend-player__avatar" aria-hidden="true">${escapeHtml(symbol)}</span>`;
}

function renderError() {
  return errorCode ? `<p class="friend-error" role="alert">${escapeHtml(errorText(errorCode))}</p>` : "";
}

function renderDisconnectControl() {
  const other = snapshot?.players.find((player) => player.id !== snapshot.self.id && !player.connected);
  if (!other) return "";
  if ((other.graceRemaining ?? 0) > 0) {
    return `<aside class="friend-disconnect-card"><strong>${copy.connection.reconnecting}</strong><small>${escapeHtml(other.name)} · ${other.graceRemaining}s</small></aside>`;
  }
  return `<aside class="friend-disconnect-card"><strong>${copy.connection.disconnected}</strong><button type="button" data-action="end-disconnected">${copy.connection.end}</button></aside>`;
}

function renderEntry() {
  const inviteCode = (params.get("room") ?? "").toUpperCase().slice(0, 6);
  return `
    <section class="friend-view">
      <div class="friend-copy">
        <span>${copy.entry.eyebrow}</span>
        <h1>${copy.entry.title}</h1>
        <p>${copy.entry.lead}</p>
      </div>
      <div class="friend-tabs" role="tablist">
        <button type="button" class="${mode === "create" ? "is-selected" : ""}" data-action="set-mode" data-mode="create">${copy.entry.create}</button>
        <button type="button" class="${mode === "join" ? "is-selected" : ""}" data-action="set-mode" data-mode="join">${copy.entry.join}</button>
      </div>
      ${renderError()}
      <form class="friend-form" data-room-form="${mode}">
        ${mode === "join" ? `<label>${copy.entry.code}<input name="code" maxlength="6" value="${escapeHtml(inviteCode)}" placeholder="${copy.entry.codePlaceholder}" required /></label>` : ""}
        <label>${copy.entry.name}<input name="name" maxlength="12" value="${escapeHtml(savedName())}" placeholder="${copy.entry.namePlaceholder}" required /></label>
        <fieldset>
          <legend>${copy.entry.avatar}</legend>
          <div class="friend-avatar-picker">
            ${Object.entries(AVATARS).map(([id, symbol], index) => `<label><input type="radio" name="avatarId" value="${id}" ${index === 0 ? "checked" : ""} /><span aria-hidden="true">${symbol}</span></label>`).join("")}
          </div>
        </fieldset>
        <button class="friend-primary" type="submit" ${busy ? "disabled" : ""}>${mode === "create" ? copy.entry.submitCreate : copy.entry.submitJoin}</button>
        <small class="friend-muted">${copy.entry.privacy}</small>
      </form>
    </section>`;
}

function playerRow(player) {
  const connectionLabel = player.connected
    ? copy.connection.connected
    : player.graceRemaining != null ? `${copy.connection.reconnecting} ${player.graceRemaining}s` : copy.connection.disconnected;
  return `<article class="friend-player">
    ${avatar(player.id, player.avatarId, player.name)}
    <div><strong>${escapeHtml(player.name)}${player.id === snapshot.self.id ? " · ME" : ""}</strong><small>${copy.lobby.player} · ${player.ready ? copy.lobby.ready : "—"}</small></div>
    <span class="${player.connected ? "is-online" : ""}">${escapeHtml(connectionLabel)}</span>
  </article>`;
}

function characterRow(character) {
  return `<article class="friend-player">
    ${avatar(character.id, character.avatarId, character.name)}
    <div><strong>${escapeHtml(character.name)}</strong><small>${copy.lobby.character}</small></div>
    <span class="is-online">${copy.connection.connected}</span>
  </article>`;
}

function renderLobby() {
  const self = snapshot.players.find((player) => player.id === snapshot.self.id);
  const inviteUrl = new URL("./friend.html", window.location.href);
  inviteUrl.search = "";
  inviteUrl.searchParams.set("lang", locale);
  inviteUrl.searchParams.set("room", snapshot.code);
  return `<section class="friend-view">
    <div class="friend-copy"><span>${copy.lobby.eyebrow}</span><h1>${copy.lobby.title}</h1><p>${copy.lobby.rotation}</p></div>
    <article class="friend-code-card"><span>${copy.lobby.code}</span><div class="friend-code-row"><strong>${escapeHtml(snapshot.code)}</strong><button type="button" data-action="copy-invite" data-url="${escapeHtml(inviteUrl)}">${copied ? copy.lobby.copied : copy.lobby.copy}</button></div></article>
    ${renderError()}
    <div class="friend-player-list">${snapshot.players.map(playerRow).join("")}</div>
    ${snapshot.players.length < 2 ? `<p class="friend-muted">${copy.lobby.waiting}</p>` : ""}
    <button class="friend-primary" type="button" data-action="toggle-ready" ${snapshot.players.length < 2 || busy ? "disabled" : ""}>${self?.ready ? copy.lobby.cancelReady : copy.lobby.ready}</button>
  </section>`;
}

function renderRole() {
  const role = snapshot.self.role;
  const self = snapshot.players.find((player) => player.id === snapshot.self.id);
  return `<section class="friend-view">
    <article class="friend-role-card ${role === "mafia" ? "is-mafia" : ""}">
      <span>${copy.role.eyebrow}</span><h1>${role === "mafia" ? copy.role.mafia : copy.role.citizen}</h1><p>${role === "mafia" ? copy.role.mafiaLead : copy.role.citizenLead}</p>
    </article>
    ${renderError()}
    <button class="friend-primary" type="button" data-action="ack-role" ${snapshot.self.roleAcknowledged || busy ? "disabled" : ""}>${snapshot.self.roleAcknowledged ? copy.role.wait : copy.role.confirm}</button>
    ${self?.roleAcknowledged ? `<p class="friend-muted">${copy.role.wait}</p>` : ""}
  </section>`;
}

function candidateButtons(action, label) {
  const participants = participantMap();
  return snapshot.privateAction?.candidateIds.map((id) => {
    const person = participants[id];
    return `<button class="friend-candidate" type="button" data-action="${action}" data-id="${id}">${label(person.name)}</button>`;
  }).join("") ?? "";
}

function renderPlant() {
  if (!snapshot.self.canPlant) {
    return `<section class="friend-view"><div class="friend-copy"><h1>${copy.plant.wait}</h1><p>${copy.role.citizenLead}</p></div>${renderPlayerSummary()}</section>`;
  }
  return `<section class="friend-view"><div class="friend-copy"><h1>${copy.plant.title}</h1><p>${copy.plant.lead}</p></div>${renderError()}<div class="friend-candidates">${candidateButtons("plant", copy.plant.action)}</div></section>`;
}

function renderPlayerSummary() {
  return `<div class="friend-player-list">${snapshot.players.map(playerRow).join("")}${snapshot.characters.map(characterRow).join("")}</div>`;
}

function renderFacts() {
  return `<section class="friend-view">
    <div class="friend-copy"><span>${copy.facts.eyebrow}</span><h1>${copy.facts.title}</h1><p>${copy.facts.lead}</p></div>
    <div class="friend-facts">${snapshot.publicFacts.map((fact) => `<article class="friend-fact"><strong>${escapeHtml(displayName(fact.participantId))}</strong><p>${escapeHtml(fact.text)}</p></article>`).join("")}</div>
    ${renderError()}
    <button class="friend-primary" type="button" data-action="ack-facts" ${snapshot.self.factsAcknowledged || busy ? "disabled" : ""}>${snapshot.self.factsAcknowledged ? copy.facts.wait : copy.facts.confirm}</button>
  </section>`;
}

function messageRow(item) {
  const participant = participantMap()[item.speakerId] ?? {};
  const isSelf = item.speakerId === snapshot.self.id;
  return `<article class="friend-message ${isSelf ? "is-self" : ""}">
    ${avatar(item.speakerId, participant.avatarId, participant.name)}
    <div class="friend-message__body"><strong>${escapeHtml(displayName(item.speakerId))}</strong><p>${escapeHtml(item.text)}</p></div>
  </article>`;
}

function renderVotePanel() {
  if (snapshot.self.canVote) {
    return `<section class="friend-vote-panel"><h2>${copy.chat.voteTitle}</h2><p>${copy.chat.voteLead}</p><div class="friend-candidates">${candidateButtons("vote", copy.chat.vote)}</div></section>`;
  }
  return snapshot.self.role === "mafia" ? `<section class="friend-vote-panel"><p>${copy.chat.mafiaWait}</p></section>` : "";
}

function renderChat() {
  return `<section class="friend-view is-chat">
    <header class="friend-room-heading"><strong>${copy.chat.title} · ${escapeHtml(snapshot.code)}</strong><small>${copy.chat.lead}</small></header>
    <div class="friend-connection">${connectionState === "connected" ? copy.connection.connected : copy.connection.reconnecting}</div>
    <section class="friend-transcript" aria-label="${escapeHtml(copy.chat.title)}">
      ${snapshot.transcript.map(messageRow).join("")}
      ${snapshot.typingCharacterIds.map((id) => `<p class="friend-typing">${escapeHtml(copy.chat.typing(displayName(id)))}</p>`).join("")}
      ${renderVotePanel()}
    </section>
    <div class="friend-chat-dock">
      ${renderError()}
      <form class="friend-chat-form" data-chat-form>
        <details class="friend-emoji"><summary aria-label="${copy.chat.emoji}">☺</summary><div class="friend-emoji__panel">${EMOJI.map((emoji) => `<button type="button" data-action="emoji" data-emoji="${emoji}">${emoji}</button>`).join("")}</div></details>
        <textarea name="message" maxlength="280" rows="1" placeholder="${copy.chat.placeholder}" ${connectionState !== "connected" || pendingChatActionId ? "disabled" : ""} required></textarea>
        <button type="submit" aria-label="${copy.chat.send}" ${connectionState !== "connected" || pendingChatActionId ? "disabled" : ""}>↑</button>
      </form>
    </div>
  </section>`;
}

function renderResult() {
  const result = snapshot.result;
  const heading = { mafia_win: copy.result.mafiaWin, mafia_loss: copy.result.mafiaLoss, draw: copy.result.draw }[result.outcome];
  const lead = result.selectedId ? copy.result.selected(displayName(result.selectedId)) : copy.result.drawLead;
  const self = snapshot.players.find((player) => player.id === snapshot.self.id);
  return `<section class="friend-view">
    <div class="friend-copy"><span>ROUND ${snapshot.roundNumber}</span><h1>${heading}</h1><p>${lead}</p></div>
    <article class="friend-result-card"><strong>${copy.result.roles}</strong><div class="friend-result-list">${result.roles.map((item) => `<p>${escapeHtml(displayName(item.participantId))} · <b>${item.role === "mafia" ? copy.role.mafia : copy.role.citizen}</b></p>`).join("")}</div></article>
    <article class="friend-result-card"><strong>${copy.result.votes}</strong><div class="friend-result-list">${result.votes.map((vote) => {
      const reason = result.voteReasons?.[vote.voterId] === "manual_vote" ? copy.result.reasonManual : copy.result.reasonEvidence;
      return `<p>${escapeHtml(displayName(vote.voterId))} → <b>${escapeHtml(displayName(vote.candidateId))}</b><small>${escapeHtml(reason)}</small></p>`;
    }).join("")}</div></article>
    <article class="friend-result-card"><strong>MARS.NET</strong><div class="friend-result-list">${snapshot.characters.map((character) => `<p><b>${escapeHtml(character.name)}</b><small>${escapeHtml(copy.result.reactions[result.outcome][character.id])}</small></p>`).join("")}</div></article>
    ${renderError()}
    <button class="friend-primary" type="button" data-action="rematch" ${self?.rematchReady || busy ? "disabled" : ""}>${self?.rematchReady ? copy.result.rematchWaiting : copy.result.rematch}</button>
  </section>`;
}

function renderEnded() {
  return `<section class="friend-view"><div class="friend-copy"><h1>${copy.connection.expired}</h1><p>${copy.entry.lead}</p></div><a class="friend-primary" href="./friend.html?lang=${locale}">${copy.entry.create}</a></section>`;
}

function render() {
  clearTimeout(disconnectRefreshTimer);
  if (!snapshot) app.innerHTML = renderEntry();
  else {
    app.innerHTML = ({ lobby: renderLobby, role: renderRole, plant: renderPlant, facts: renderFacts, chat: renderChat, result: renderResult, ended: renderEnded }[snapshot.phase] ?? renderEnded)();
    app.insertAdjacentHTML("beforeend", renderDisconnectControl());
    const other = snapshot.players.find((player) => player.id !== snapshot.self.id && !player.connected);
    if (other && (other.graceRemaining ?? 0) > 0) disconnectRefreshTimer = window.setTimeout(refreshSnapshot, 5000);
  }
  app.querySelector(".friend-transcript")?.scrollTo(0, 100000);
  window.oxygenRoomSound?.setScene(!snapshot || snapshot.phase === "lobby" ? "lobby" : "game");
  window.oxygenRoomSound?.refresh();
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  if (session?.token) headers["X-Participant-Token"] = session.token;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "generic");
  return data;
}

async function refreshSnapshot() {
  if (!session) return;
  try {
    snapshot = await request(`/api/rooms/${encodeURIComponent(session.code)}/snapshot`);
    errorCode = null;
    render();
  } catch (error) {
    errorCode = error.message;
    if (["room_expired", "room_not_found"].includes(error.message)) {
      sessionStorage.removeItem(SESSION_KEY);
      session = null;
      snapshot = null;
    }
    render();
  }
}

function connectSocket() {
  if (!session || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  connectionState = reconnectAttempt ? "reconnecting" : "disconnected";
  render();
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const activeSocket = new WebSocket(`${scheme}://${window.location.host}/ws/rooms/${encodeURIComponent(session.code)}`);
  socket = activeSocket;
  activeSocket.addEventListener("open", () => {
    reconnectAttempt = 0;
    connectionState = "connected";
    activeSocket.send(JSON.stringify({ type: "authenticate", token: session.token, lastSeq: snapshot?.eventSeq ?? 0 }));
  });
  activeSocket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "ping") {
      activeSocket.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (data.type === "error") {
      errorCode = data.error;
      pendingChatActionId = null;
      render();
      return;
    }
    if (data.type === "snapshot") {
      snapshot = data.snapshot;
      connectionState = "connected";
      errorCode = null;
      pendingChatActionId = null;
      render();
    }
  });
  activeSocket.addEventListener("close", () => {
    if (socket !== activeSocket) return;
    socket = null;
    connectionState = "reconnecting";
    render();
    if (!shouldReconnect || !session) return;
    const delay = Math.min(8000, 500 * (2 ** reconnectAttempt));
    reconnectAttempt += 1;
    clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connectSocket, delay);
  });
}

async function sendHttpAction(action, extra = {}) {
  if (!snapshot || busy) return;
  busy = true;
  errorCode = null;
  render();
  const endpoint = action === "ready" ? "ready" : "actions";
  const body = action === "ready"
    ? { ready: extra.ready, actionId: newActionId(), expectedSeq: snapshot.eventSeq }
    : { action, actionId: newActionId(), expectedSeq: snapshot.eventSeq, ...extra };
  try {
    snapshot = await request(`/api/rooms/${encodeURIComponent(session.code)}/${endpoint}`, { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    errorCode = error.message;
    if (error.message === "stale_event") await refreshSnapshot();
  } finally {
    busy = false;
    render();
  }
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "set-mode") { mode = button.dataset.mode; errorCode = null; render(); }
  if (action === "copy-invite") {
    try { await navigator.clipboard.writeText(button.dataset.url); copied = true; render(); }
    catch { errorCode = "generic"; render(); }
  }
  if (action === "toggle-ready") {
    const self = snapshot.players.find((player) => player.id === snapshot.self.id);
    await sendHttpAction("ready", { ready: !self.ready });
  }
  if (action === "ack-role") await sendHttpAction("ack_role");
  if (action === "plant") await sendHttpAction("plant_evidence", { targetId: button.dataset.id });
  if (action === "ack-facts") await sendHttpAction("ack_facts");
  if (action === "vote") await sendHttpAction("vote", { targetId: button.dataset.id });
  if (action === "rematch") await sendHttpAction("rematch");
  if (action === "end-disconnected") await sendHttpAction("end_disconnected");
  if (action === "emoji") {
    const textarea = app.querySelector('textarea[name="message"]');
    if (!textarea) return;
    textarea.setRangeText(button.dataset.emoji, textarea.selectionStart, textarea.selectionEnd, "end");
    button.closest("details")?.removeAttribute("open");
    textarea.focus();
  }
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.matches("[data-room-form]")) {
    busy = true;
    errorCode = null;
    render();
    const data = new FormData(form);
    const payload = { name: data.get("name"), avatarId: data.get("avatarId"), locale };
    const code = String(data.get("code") ?? "").trim().toUpperCase();
    try {
      const result = form.dataset.roomForm === "create"
        ? await request("/api/rooms", { method: "POST", body: JSON.stringify(payload) })
        : await request(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify(payload) });
      saveSession({ code: result.code, token: result.token, playerId: result.playerId });
      snapshot = result.snapshot;
      const url = new URL(window.location.href);
      url.searchParams.set("lang", locale);
      url.searchParams.set("room", result.code);
      history.replaceState(null, "", url);
      connectSocket();
    } catch (error) {
      errorCode = error.message;
    } finally {
      busy = false;
      render();
    }
    return;
  }
  if (form.matches("[data-chat-form]") && socket?.readyState === WebSocket.OPEN && !pendingChatActionId) {
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message) return;
    pendingChatActionId = newActionId();
    socket.send(JSON.stringify({ type: "action", action: "chat", message, actionId: pendingChatActionId, expectedSeq: snapshot.eventSeq }));
    form.reset();
    render();
  }
});

window.addEventListener("pagehide", () => {
  shouldReconnect = false;
  clearTimeout(reconnectTimer);
  clearTimeout(disconnectRefreshTimer);
  socket?.close(1000, "pagehide");
});

async function boot() {
  const requestedCode = (params.get("room") ?? "").toUpperCase();
  if (session && requestedCode && session.code !== requestedCode) {
    sessionStorage.removeItem(SESSION_KEY);
    session = null;
  }
  if (session) {
    await refreshSnapshot();
    if (session) connectSocket();
  }
  render();
}

void boot();
