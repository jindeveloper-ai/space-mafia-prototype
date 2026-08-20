import {
  applyLie,
  applyResponse,
  createGame,
  formatClueCount,
  getClaimOptions,
  getCrew,
  getCrewMember,
  getCurrentLeans,
  getDisplayName,
  getIncident,
  getMeetingStatements,
  getResponseOptions,
  getSubquest,
  nextCaseIndex,
  nextSubquestId,
  plantEvidence,
  resolveVote,
  startGame,
} from "./game-engine.js?v=0.10.1";
import { getCopy, normalizeLocale } from "./i18n.js?v=0.10.1";
import {
  buildChatPayload,
  fallbackAccusation,
  fallbackResponse,
  MAX_CHAT_LENGTH,
  normalizeInterpretation,
} from "./chat-adapter.js?v=0.10.1";

const app = document.querySelector("#app");
const assetVersion = new URL(import.meta.url).searchParams.get("v");
const versionLabel = assetVersion ? `v${assetVersion}` : "dev";
const locale = normalizeLocale(new URLSearchParams(window.location.search).get("lang"));
const copy = getCopy(locale);
const ui = copy.ui;
const crew = getCrew(locale);
const incident = getIncident(locale);
const crewMember = (id) => getCrewMember(id, locale);
const displayName = (id) => getDisplayName(id, locale);
const clueCountLabel = (count) => formatClueCount(count, locale);

document.documentElement.lang = locale;
document.title = copy.meta.title;
document.querySelector('meta[name="description"]').content = copy.meta.description;
document.querySelector(".topbar").setAttribute("aria-label", copy.meta.gameInfo);
document.querySelector(".brand").setAttribute("aria-label", copy.meta.home);
document.querySelector(".brand").href = `./?lang=${locale}`;
document.querySelector(".brand-name").textContent = copy.meta.brand;
document.querySelector(".language-switch").setAttribute("aria-label", copy.meta.language);
document.querySelector(".footer-copy").textContent = copy.meta.footer;
document.querySelector(".footer-version").textContent = versionLabel;
document.querySelectorAll("[data-lang]").forEach((link) => {
  link.setAttribute("aria-current", link.dataset.lang === locale ? "page" : "false");
});

const themeButton = document.querySelector("[data-theme-action]");
const themeController = window.oxygenRoomTheme;

function renderThemeControl() {
  const theme = themeController?.read() ?? "system";
  const labels = copy.meta.themeModes;
  const icons = { system: "◐", light: "○", dark: "●" };
  themeButton.dataset.themeMode = theme;
  themeButton.setAttribute("aria-label", copy.meta.themeControl(labels[theme]));
  themeButton.querySelector(".theme-icon").textContent = icons[theme];
  themeButton.querySelector(".theme-text").textContent = labels[theme];
}

themeButton.addEventListener("click", () => {
  themeController?.next();
  renderThemeControl();
});
renderThemeControl();

let state = createGame({ locale });
let selectedTargetId = null;
let chatLog = [];
let chatPending = false;
let chatMode = "ready";
let chatNotice = null;

const escapeHtml = (value) => {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
};

function progress(step, label) {
  return `
    <div class="progress-wrap" aria-label="${ui.stepAria(step, label)}">
      <div class="progress-copy"><span>${step}/5</span><span>${label}</span></div>
      <div class="progress-track" aria-hidden="true">
        <span style="width: ${step * 20}%"></span>
      </div>
    </div>
  `;
}

function incidentBoard(compact = false) {
  return `
    <aside class="incident-board ${compact ? "is-compact" : ""}" aria-label="${ui.incidentAria}">
      <div><span>${ui.incidentPlace}</span><strong>${incident.place}</strong></div>
      <div><span>${ui.incidentTime}</span><strong>${incident.time}</strong></div>
      <p>${incident.confirmed}</p>
    </aside>
  `;
}

function subquestCard(mode = "active") {
  const quest = getSubquest(state.subquestId, locale);
  if (!quest) return "";
  const isResult = mode === "result";
  const statusClass = !isResult
    ? ""
    : state.subquestCompleted
      ? "is-complete"
      : "is-missed";
  const label = !isResult
    ? ui.subquestLabel
    : state.subquestCompleted
      ? ui.subquestSuccess
      : ui.subquestMissed;
  const detail = !isResult
    ? ui.subquestOptional
    : state.subquestCompleted
      ? ui.subquestSuccessDetail
      : ui.subquestMissedDetail;
  return `
    <aside class="subquest-card ${statusClass}" aria-label="${label}">
      <span>${label}</span>
      <strong>${escapeHtml(quest.title)}</strong>
      <small>${detail}</small>
    </aside>
  `;
}

function personAvatar(person, size = "normal") {
  return `<span class="avatar avatar--${size} avatar--${person.id}" aria-hidden="true">${person.icon}</span>`;
}

function roomAvatarStack() {
  return `
    <div class="room-avatar-stack" aria-hidden="true">
      ${crew.map((person) => personAvatar(person, "small")).join("")}
    </div>
  `;
}

function roomStatusLabel() {
  if (chatMode === "live") return ui.chatModeLive;
  if (chatNotice) return ui.chatModeMock;
  return ui.roomStatus;
}

function currentThemeIcon() {
  return { system: "◐", light: "○", dark: "●" }[themeController?.read() ?? "system"];
}

function gameRoomBar(step, label) {
  return `
    <header class="game-room-bar">
      <a class="room-back" href="./?lang=${locale}" aria-label="${copy.meta.home}">‹</a>
      ${roomAvatarStack()}
      <div class="game-room-bar__copy">
        <strong>${ui.chatRoomTitle}</strong>
        <small>${roomStatusLabel()}</small>
      </div>
      <span class="room-phase"><strong>${step}/5</strong><span>${label}</span></span>
      <button class="room-theme" type="button" data-action="cycle-theme" aria-label="${copy.meta.themeControl(copy.meta.themeModes[themeController?.read() ?? "system"])}">
        <span aria-hidden="true">${currentThemeIcon()}</span>
      </button>
    </header>
  `;
}

function chatContext() {
  return `
    <details class="chat-context">
      <summary>
        <span>${ui.incidentAria}</span>
        <strong>${incident.place} · ${incident.time}</strong>
      </summary>
      <div class="chat-context__body">
        ${incidentBoard(true)}
        ${subquestCard()}
      </div>
    </details>
  `;
}

function renderIntro() {
  return `
    <p class="scene-setting">${ui.sceneSetting}</p>

    <article class="community-post">
      <div class="post-author">
        <span class="anonymous-avatar" aria-hidden="true">A</span>
        <div><strong>${ui.communityAuthor}</strong><small>${ui.communityBoard}</small></div>
      </div>
      <h1 tabindex="-1">${ui.communityPostTitle}</h1>
      <p>${ui.communityPostBody}</p>
      <small class="post-meta">${ui.communityPostMeta}</small>
    </article>

    <section class="room-preview" aria-label="${ui.roomMembers}">
      <div class="room-preview__header">
        <div><span>${ui.roomBadge}</span><strong>${ui.roomMembers}</strong></div>
        <small>${ui.roomStatus}</small>
      </div>
      <div class="member-list">
        ${crew.map((person) => `
          <div class="member-row">
            ${personAvatar(person, "small")}
            <div><strong>${person.name}</strong><small>${person.style}</small></div>
            <span class="online-dot" aria-label="${ui.online}"></span>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="role-panel">
      <span>${ui.roleLabel}</span>
      <strong>${ui.introTitle}</strong>
      <p>${ui.introLead}</p>
    </section>

    <button class="primary-button" data-action="start">${ui.start}</button>

    <ol class="rules" aria-label="${ui.rulesAria}">
      ${ui.rules.map((rule, index) => `<li><span>${index + 1}</span><p>${rule}</p></li>`).join("")}
    </ol>
  `;
}

function crewChoiceCard(person, selectedId, action) {
  const isSelected = selectedId === person.id;
  return `
    <button
      class="crew-action ${isSelected ? "is-selected" : ""}"
      data-action="${action}"
      data-id="${person.id}"
      role="radio"
      aria-checked="${isSelected}"
    >
      ${personAvatar(person, "small")}
      <span>${person.name}</span>
      <small>${isSelected ? ui.selected : ui.select}</small>
    </button>
  `;
}

function renderEvidence() {
  return `
    <div class="game-room-view is-chat is-setup">
      ${gameRoomBar(1, ui.stages.evidence)}
      <section class="chat-room is-focus" aria-label="${ui.chatTranscriptAria}">
        <div class="chat-transcript setup-transcript">
          <p class="chat-day">${incident.place} · ${incident.time}</p>
          <p class="chat-event">${ui.incidentHappened}</p>
          <article class="room-system-card is-alert">
            <span class="eyebrow">${ui.secretMessage}</span>
            <h1 tabindex="-1">${incident.title}</h1>
            <p>${incident.description}</p>
          </article>
          ${subquestCard()}
          <article class="private-action-card">
            <span>${ui.evidenceMark}</span>
            <div><strong>${incident.evidence}</strong><p>${ui.evidencePrompt}</p></div>
          </article>
        </div>
      </section>
      <div class="chat-dock setup-dock">
        <div class="crew-action-row" role="radiogroup" aria-label="${ui.evidenceGroup}">
          ${crew.map((person) => crewChoiceCard(person, selectedTargetId, "select-target")).join("")}
        </div>
        <button class="primary-button" data-action="plant" ${selectedTargetId ? "" : "disabled"}>
          ${selectedTargetId ? ui.plant(crewMember(selectedTargetId).name) : ui.chooseOne}
        </button>
      </div>
    </div>
  `;
}

function factCard(person) {
  const fact = state.facts[person.id];
  return `
    <article class="fact-card">
      <span class="fact-icon" aria-hidden="true">${ui.factMarks[fact.id]}</span>
      <div>
        <div class="fact-name"><strong>${person.name}</strong><span>${fact.badge}</span></div>
        <p>${fact.text}</p>
        <small class="fact-guidance ${fact.id === "alibi" ? "is-warning" : ""}">${fact.guidance}</small>
      </div>
    </article>
  `;
}

function renderMeeting() {
  const target = crewMember(state.targetId);
  return `
    <div class="game-room-view is-chat is-setup">
      ${gameRoomBar(2, ui.stages.facts)}
      <details class="chat-context clue-context" open>
        <summary><span>${ui.publicFacts}</span><strong>${ui.clueCount(crew.length)}</strong></summary>
        <div class="chat-context__body fact-list">${crew.map((person) => factCard(person)).join("")}</div>
      </details>
      <section class="chat-room is-focus" aria-label="${ui.openingStatements}">
        <div class="chat-transcript setup-transcript">
          <p class="chat-day">${incident.place} · ${incident.time}</p>
          <p class="chat-event">${ui.evidenceFound}</p>
          <article class="room-system-card">
            <h1 tabindex="-1">${ui.meetingTitle(target.name)}</h1>
            <p>${ui.roundFacts}</p>
          </article>
          ${getMeetingStatements(state)
            .map((statement) => chatMessage({ speakerId: statement.id, text: statement.text }))
            .join("")}
        </div>
      </section>
      <div class="chat-dock setup-dock is-single-action">
        <button class="primary-button" data-action="open-chat">${ui.makeLie}</button>
      </div>
    </div>
  `;
}

function strongestClaim(personId) {
  return getClaimOptions(personId, locale).reduce((best, claim) =>
    state.facts[personId].impacts[claim.id] > state.facts[personId].impacts[best.id]
      ? claim
      : best,
  getClaimOptions(personId, locale)[0]);
}

function chatSuggestions(stage) {
  const suggestions = stage === "accusation"
    ? crew.map((person) => {
      const claim = strongestClaim(person.id);
      const impact = state.facts[person.id].impacts[claim.id];
      const relation = impact < 0 ? ui.relationConflict : impact >= 20 ? ui.relationStrong : ui.relationWeak;
      return { text: claim.label, meta: `${person.name} · ${relation}`, tone: impact < 0 ? "is-conflict" : impact >= 20 ? "is-strong" : "is-weak" };
    })
    : getResponseOptions(state).map((option) => ({
      text: option.label.replaceAll("“", "").replaceAll("”", ""),
      meta: option.hint,
      tone: "is-weak",
    }));
  return `
    <div class="chat-suggestions" aria-label="${ui.chatSuggestions}">
      <span>${ui.chatSuggestions}<small>${ui.chatSuggestionsHint}</small></span>
      ${suggestions.map((suggestion) => `
        <button type="button" class="chat-suggestion ${suggestion.tone}" data-action="draft-message" data-message="${encodeURIComponent(suggestion.text)}">
          <small>${escapeHtml(suggestion.meta)}</small>
          <span>${escapeHtml(suggestion.text)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function chatMessage(item) {
  if (item.speakerId === "system") {
    return `<p class="chat-event">${escapeHtml(item.text)}</p>`;
  }
  const person = item.speakerId === "player" ? null : crewMember(item.speakerId);
  return `
    <article class="chat-message ${item.speakerId === "player" ? "is-player" : ""}">
      ${person ? personAvatar(person, "small") : `<span class="avatar avatar--small avatar--player" aria-hidden="true">${ui.chatYouMark}</span>`}
      <div>
        <strong>${item.speakerId === "player" ? ui.chatYou : escapeHtml(person?.name ?? item.speakerId)}<small>${ui.chatNow}</small></strong>
        <p>${escapeHtml(item.text)}</p>
      </div>
    </article>
  `;
}

function renderChat() {
  const isAccusation = state.phase === "lie";
  const stage = isAccusation ? "accusation" : "response";
  const step = isAccusation ? 3 : 4;
  const stageLabel = isAccusation ? ui.stages.lie : ui.stages.challenge;
  return `
    <div class="game-room-view is-chat">
      ${gameRoomBar(step, stageLabel)}
      <div class="chat-turn-banner">
        <span>${ui.yourTurn} · ${ui.freeChat}</span>
        <h1 tabindex="-1">${isAccusation ? ui.chatAccuseTitle : ui.chatReplyTitle}</h1>
      </div>
      ${chatContext()}

      <section class="chat-room is-focus" aria-label="${ui.chatTranscriptAria}">
        <div class="chat-transcript" aria-live="polite">
          ${chatLog.map(chatMessage).join("")}
          ${chatPending ? `<p class="chat-pending">${ui.chatTyping}</p>` : ""}
        </div>
      </section>

      <div class="chat-dock">
        ${chatNotice ? `<p class="chat-notice" role="status">${escapeHtml(chatNotice)}</p>` : ""}
        ${chatSuggestions(stage)}

        <form class="chat-composer" data-chat-stage="${stage}">
          <label class="visually-hidden" for="player-message">${ui.chatInputLabel}</label>
          <div class="chat-composer__row">
            <textarea id="player-message" name="message" maxlength="${MAX_CHAT_LENGTH}" rows="1" placeholder="${isAccusation ? ui.chatPlaceholderAccuse : ui.chatPlaceholderReply}" ${chatPending ? "disabled" : ""} required></textarea>
            <button class="composer-send" type="submit" aria-label="${ui.chatSend}" ${chatPending ? "disabled" : ""}><span aria-hidden="true">↑</span></button>
          </div>
          <small class="chat-limit">${ui.chatLength(MAX_CHAT_LENGTH)}</small>
        </form>
      </div>
    </div>
  `;
}

function renderResponse() {
  const leans = getCurrentLeans(state);
  return `
    <div class="game-room-view is-chat is-summary">
      ${gameRoomBar(4, ui.stages.meetingEnd)}
      <div class="chat-turn-banner">
        <span>${ui.yourResponse}</span>
        <h1 tabindex="-1">${ui.chatDecisionTitle}</h1>
      </div>
      <section class="chat-room is-focus" aria-label="${ui.chatTranscriptAria}">
        <div class="chat-transcript">${chatLog.map(chatMessage).join("")}</div>
      </section>

      <section class="pre-vote-sheet" aria-label="${ui.preVoteAria}">
        <strong>${ui.chatDecisionLead}</strong>
        <div class="lean-list">
          ${leans
            .map(
              (lean) => `
                <div class="lean-card">
                  <span>${displayName(lean.voterId)}</span>
                  <small>${clueCountLabel(lean.clueCount)}</small>
                  <strong>${displayName(lean.candidateId)}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>

      <div class="room-action-dock">
        <button class="primary-button" data-action="vote">${ui.showVote}</button>
      </div>
    </div>
  `;
}

function resultExplanation() {
  const result = ui.result;
  if (state.outcome === "draw") {
    return result.drawExplanation;
  }
  if (state.outcome === "lose") {
    return result.loseExplanation;
  }
  if (state.selectedId === state.accusedId && state.accusedId !== state.targetId) {
    return result.redirectedExplanation(displayName(state.accusedId), state.voteShiftCount);
  }
  if (state.selectedId === state.targetId) {
    return state.voteShiftCount === 0
      ? result.safeExplanation
      : result.shiftedExplanation(state.voteShiftCount);
  }
  return result.splitExplanation;
}

function renderVoteShifts() {
  const beforeByVoter = new Map(
    state.leanHistory.afterEvidence.map((lean) => [lean.voterId, lean]),
  );
  return `
    <section class="vote-shifts" aria-label="${ui.voteShiftAria}">
      <strong>${ui.beforeAfter}</strong>
      <div>
        ${state.votes
          .map((vote) => {
            const before = beforeByVoter.get(vote.voterId);
            const changed = before?.candidateId !== vote.candidateId;
            return `
              <p class="${changed ? "is-changed" : ""}">
                <span>${displayName(vote.voterId)}</span>
                <span>${displayName(before?.candidateId)} → ${displayName(vote.candidateId)}</span>
                <small>${changed ? ui.changed : ui.unchanged}</small>
              </p>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderResult() {
  const result = ui.result;
  const isWin = state.outcome === "win";
  const isDraw = state.outcome === "draw";
  const resultClass = isDraw ? "draw" : isWin ? "win" : "lose";
  const resultSymbol = isDraw ? "–" : isWin ? "✓" : "!";
  const eyebrow = isDraw ? result.drawEyebrow : isWin ? result.tiers[state.resultTier] : result.loseEyebrow;
  const title = isDraw
    ? result.drawTitle
    : isWin
      ? result.winTitle(displayName(state.selectedId))
      : result.loseTitle;
  const description = isDraw
    ? result.drawDescription
    : isWin
      ? state.voteShiftCount > 0
        ? result.shiftedDescription(state.voteShiftCount)
        : result.safeDescription
      : result.loseDescription;
  const explanationTitle = isDraw
    ? result.drawWhy
    : isWin
      ? state.voteShiftCount > 0 ? result.shiftWhy : result.safeWhy
      : result.loseWhy;
  return `
    ${progress(5, ui.stages.result)}
    <div class="result-symbol ${resultClass}" aria-hidden="true">${resultSymbol}</div>
    <div class="section-heading result-heading">
      <span class="eyebrow">${eyebrow}</span>
      <h1 tabindex="-1">${title}</h1>
      <p>${description}</p>
    </div>

    ${subquestCard("result")}

    ${renderVoteShifts()}

    <div class="vote-grid" aria-label="${ui.resultAria}">
      ${state.votes
        .map(
          (vote) => `
            <article class="vote-card detailed">
              <div><span>${displayName(vote.voterId)}</span><span aria-hidden="true">→</span><strong>${displayName(vote.candidateId)}</strong></div>
              <small class="clue-count">${clueCountLabel(vote.clueCount)}</small>
              <p>${escapeHtml(vote.reason)}</p>
            </article>
          `,
        )
        .join("")}
    </div>

    <div class="result-explanation">
      <strong>${explanationTitle}</strong>
      <p>${resultExplanation()}</p>
    </div>

    <div class="next-round-promise">
      <strong>${ui.nextRoundTitle}</strong>
      <span>${ui.nextRoundDetail}</span>
    </div>

    <button class="primary-button" data-action="restart">${ui.restart}</button>
  `;
}

function startChat() {
  chatLog = [
    { speakerId: "system", text: ui.chatAccuseLead },
    ...getMeetingStatements(state).map((statement) => ({
      speakerId: statement.id,
      text: statement.text,
    })),
  ];
  chatPending = false;
  chatMode = "ready";
  chatNotice = null;
  state = { ...state, phase: "lie" };
}

async function requestCharacterChat(stage, message) {
  const payload = buildChatPayload({ locale, stage, message, state, crew, incident, transcript: chatLog });
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.mode !== "live" || !Array.isArray(data.replies)) {
    throw new Error(data.error ?? "chat_unavailable");
  }
  return data;
}

function safeLiveReplies(replies) {
  const seen = new Set();
  return replies.flatMap((reply) => {
    if (!crew.some((member) => member.id === reply?.speakerId) || seen.has(reply.speakerId)) return [];
    const text = String(reply.message ?? "").trim().slice(0, 120);
    if (!text) return [];
    seen.add(reply.speakerId);
    return [{ speakerId: reply.speakerId, text }];
  });
}

function fallbackAccusationReplies(nextState) {
  const leans = new Map(getCurrentLeans(nextState).map((lean) => [lean.voterId, lean]));
  return crew.map((member) => ({
    speakerId: member.id,
    text: member.id === nextState.challengerId
      ? nextState.challengeText
      : ui.chatPracticeReaction(member.personality, displayName(leans.get(member.id).candidateId)),
  }));
}

function fallbackResponseReplies(nextState) {
  return getCurrentLeans(nextState).map((lean) => ({
    speakerId: lean.voterId,
    text: ui.chatPracticeDecision(
      crewMember(lean.voterId).personality,
      displayName(lean.candidateId),
    ),
  }));
}

async function handleChatSubmit(stage, rawMessage) {
  if (chatPending) return;
  const message = String(rawMessage).trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) return;

  chatLog.push({ speakerId: "player", text: message });
  chatPending = true;
  chatNotice = null;
  render();

  let remote = null;
  try {
    remote = await requestCharacterChat(stage, message);
    chatMode = "live";
  } catch {
    chatMode = "mock";
    chatNotice = ui.chatFallback;
  }

  if (stage === "accusation") {
    const localFallback = fallbackAccusation(message, state, crew);
    const interpretation = normalizeInterpretation(
      stage,
      remote?.interpretation ?? localFallback,
      message,
      state,
      crew,
    );
    const nextState = applyLie(state, interpretation.accusedId, interpretation.claimId);
    chatLog.push({ speakerId: "system", text: ui.chatInterpretedLie(nextState.lie) });
    const replies = safeLiveReplies(remote?.replies ?? []);
    chatLog.push(...(replies.length === crew.length ? replies : fallbackAccusationReplies(nextState)));
    chatLog.push({ speakerId: "system", text: ui.chatReplyLead });
    state = nextState;
  } else {
    const localFallback = fallbackResponse(message);
    const interpretation = normalizeInterpretation(
      stage,
      remote?.interpretation ?? localFallback,
      message,
      state,
      crew,
    );
    const nextState = applyResponse(state, interpretation.responseId);
    chatLog.push({ speakerId: "system", text: ui.chatInterpretedResponse(nextState.responseText) });
    const replies = safeLiveReplies(remote?.replies ?? []);
    chatLog.push(...(replies.length === crew.length ? replies : fallbackResponseReplies(nextState)));
    state = nextState;
  }

  chatPending = false;
  render();
}

let renderedPhase = null;

function render() {
  const views = {
    intro: renderIntro,
    evidence: renderEvidence,
    meeting: renderMeeting,
    lie: renderChat,
    challenge: renderChat,
    response: renderResponse,
    result: renderResult,
  };
  const phaseChanged = renderedPhase !== state.phase;
  document.body.dataset.phase = state.phase;
  app.dataset.phase = state.phase;
  app.innerHTML = views[state.phase]();
  if (phaseChanged) {
    window.scrollTo(0, 0);
    app.querySelector("h1")?.focus({ preventScroll: true });
  }
  if (["lie", "challenge", "response"].includes(state.phase)) {
    app.querySelector(".chat-transcript")?.scrollTo(0, 10_000);
  }
  renderedPhase = state.phase;
}

function resetGame() {
  state = startGame(createGame({
    caseIndex: nextCaseIndex(state.caseIndex),
    subquestId: nextSubquestId(state.subquestId),
    locale,
  }));
  selectedTargetId = null;
  chatLog = [];
  chatPending = false;
  chatMode = "ready";
  chatNotice = null;
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "start") state = startGame(state);
  if (action === "select-target") selectedTargetId = button.dataset.id;
  if (action === "plant" && selectedTargetId) state = plantEvidence(state, selectedTargetId);
  if (action === "open-chat") startChat();
  if (action === "cycle-theme") {
    themeController?.next();
    renderThemeControl();
  }
  if (action === "draft-message") {
    const input = app.querySelector("#player-message");
    if (input) {
      input.value = decodeURIComponent(button.dataset.message ?? "");
      input.focus();
    }
    return;
  }
  if (action === "vote") state = resolveVote(state);
  if (action === "restart") return resetGame();

  render();
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest(".chat-composer");
  if (!form) return;
  event.preventDefault();
  const message = new FormData(form).get("message");
  handleChatSubmit(form.dataset.chatStage, message);
});

app.addEventListener("input", (event) => {
  const input = event.target.closest("#player-message");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
});

app.addEventListener("keydown", (event) => {
  const input = event.target.closest("#player-message");
  if (!input || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  input.closest("form")?.requestSubmit();
});

render();
