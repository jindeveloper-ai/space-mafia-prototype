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
  nextCaseIndex,
  plantEvidence,
  resolveVote,
  startGame,
} from "./game-engine.js?v=0.5.0";
import { getCopy, normalizeLocale } from "./i18n.js?v=0.5.0";

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
document.querySelector(".mode-badge").textContent = `${versionLabel} · ${ui.mode}`;
document.querySelector(".language-switch").setAttribute("aria-label", copy.meta.language);
document.querySelector("footer").textContent = copy.meta.footer;
document.querySelectorAll("[data-lang]").forEach((link) => {
  link.setAttribute("aria-current", link.dataset.lang === locale ? "page" : "false");
});

let state = createGame({ locale });
let selectedTargetId = null;
let selectedAccusedId = null;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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
      <div><span>${ui.incidentPlace}</span><strong>🚪 ${incident.place}</strong></div>
      <div><span>${ui.incidentTime}</span><strong>🕙 ${incident.time}</strong></div>
      <p>${incident.confirmed}</p>
    </aside>
  `;
}

function personAvatar(person, size = "normal") {
  return `<span class="avatar avatar--${size}" aria-hidden="true">${person.icon}</span>`;
}

function renderIntro() {
  return `
    <div class="hero-copy">
      <span class="eyebrow">${versionLabel} · ${ui.gameLength}</span>
      <h1 tabindex="-1">${ui.introTitle}</h1>
      <p class="lead">${ui.introLead}</p>
    </div>

    <ol class="rules" aria-label="${ui.rulesAria}">
      ${ui.rules.map((rule, index) => `<li><span>${index + 1}</span><p>${rule}</p></li>`).join("")}
    </ol>

    <button class="primary-button" data-action="start">${ui.start}</button>
  `;
}

function crewChoiceCard(person, selectedId, action, fact = null) {
  const isSelected = selectedId === person.id;
  return `
    <button
      class="crew-card ${isSelected ? "is-selected" : ""}"
      data-action="${action}"
      data-id="${person.id}"
      role="radio"
      aria-checked="${isSelected}"
    >
      ${personAvatar(person)}
      <span class="crew-name">${person.name}</span>
      <span class="crew-style">${person.style}</span>
      ${fact ? `<span class="crew-fact-badge ${fact.id === "alibi" ? "is-alibi" : ""}">${fact.icon} ${fact.badge}</span>` : ""}
      <span class="selected-label">${isSelected ? ui.selected : ui.select}</span>
    </button>
  `;
}

function renderEvidence() {
  return `
    ${progress(1, ui.stages.evidence)}
    <div class="section-heading">
      <span class="eyebrow">${ui.incidentHappened}</span>
      <h1 tabindex="-1">${incident.title}</h1>
      <p>${incident.description}</p>
    </div>

    ${incidentBoard()}

    <div class="evidence-note">
      <span aria-hidden="true">🪪</span>
      <div><strong>${incident.evidence}</strong><p>${ui.evidencePrompt}</p></div>
    </div>

    <div class="crew-grid" role="radiogroup" aria-label="${ui.evidenceGroup}">
      ${crew.map((person) => crewChoiceCard(person, selectedTargetId, "select-target")).join("")}
    </div>

    <button class="primary-button" data-action="plant" ${selectedTargetId ? "" : "disabled"}>
      ${selectedTargetId ? ui.plant(crewMember(selectedTargetId).name) : ui.chooseOne}
    </button>
  `;
}

function factCard(person, compact = false) {
  const fact = state.facts[person.id];
  return `
    <article class="fact-card ${compact ? "is-compact" : ""}">
      <span class="fact-icon" aria-hidden="true">${fact.icon}</span>
      <div>
        <div class="fact-name"><strong>${person.name}</strong><span>${fact.badge}</span></div>
        <p>${fact.text}</p>
        ${compact ? "" : `<small class="fact-guidance ${fact.id === "alibi" ? "is-warning" : ""}">${fact.guidance}</small>`}
      </div>
    </article>
  `;
}

function speechCard(person) {
  return `
    <article class="speech-card">
      ${personAvatar(person, "small")}
      <div>
        <div class="speech-name"><strong>${person.name}</strong><span>${person.style}</span></div>
        <p>“${escapeHtml(person.text)}”</p>
      </div>
    </article>
  `;
}

function renderMeeting() {
  const target = crewMember(state.targetId);
  return `
    ${progress(2, ui.stages.facts)}
    <div class="section-heading">
      <span class="eyebrow">${ui.evidenceFound}</span>
      <h1 tabindex="-1">${ui.meetingTitle(target.name)}</h1>
      <p>${ui.roundFacts}</p>
    </div>

    ${incidentBoard(true)}

    <div class="fact-list" aria-label="${ui.publicFacts}">
      ${crew.map(factCard).join("")}
    </div>

    <details class="meeting-talk">
      <summary>${ui.openingStatements}</summary>
      <div class="speech-list compact">
        ${getMeetingStatements(state).map(speechCard).join("")}
      </div>
    </details>

    <button class="primary-button" data-action="open-lie-builder">${ui.makeLie}</button>
  `;
}

function renderLieBuilder() {
  const accused = crewMember(selectedAccusedId);
  return `
    ${progress(3, ui.stages.lie)}
    <div class="section-heading">
      <span class="eyebrow">${ui.yourTurn}</span>
      <h1 tabindex="-1">${ui.accuseTitle}</h1>
      <p>${ui.accuseLead}</p>
    </div>

    ${incidentBoard(true)}

    <div class="fact-list fact-list--compact" aria-label="${ui.factSummary}">
      ${crew.map((person) => factCard(person, true)).join("")}
    </div>

    <div class="crew-grid compact-grid" role="radiogroup" aria-label="${ui.accusedGroup}">
      ${crew.map((person) => crewChoiceCard(person, selectedAccusedId, "select-accused", state.facts[person.id])).join("")}
    </div>

    ${
      accused
        ? `
          <div class="selected-fact">
            <span aria-hidden="true">${state.facts[accused.id].icon}</span>
            <p><strong>${ui.selectedFact(accused.name)}</strong><br />${state.facts[accused.id].text}</p>
          </div>
          <div class="builder-step">
            <span class="eyebrow">${ui.chooseLie}</span>
            <div class="lie-list">
              ${getClaimOptions(accused.id, locale)
                .map(
                  (claim) => {
                    const impact = state.facts[accused.id].impacts[claim.id];
                    const relation = impact < 0
                      ? { label: ui.relationConflict, className: "is-danger" }
                      : impact >= 12
                        ? { label: ui.relationMatch, className: "is-match" }
                        : { label: ui.relationWeak, className: "is-weak" };
                    return `
                    <button class="lie-option" data-action="make-claim" data-id="${claim.id}">
                      <span>“${claim.label}”</span>
                      <small>${claim.short} · <strong class="claim-relation ${relation.className}">${relation.label}</strong></small>
                    </button>
                  `;
                  },
                )
                .join("")}
            </div>
          </div>
        `
        : `<div class="choice-prompt">${ui.chooseAccused}</div>`
    }
  `;
}

function renderChallenge() {
  const challenger = crewMember(state.challengerId);
  return `
    ${progress(4, ui.stages.challenge)}
    <div class="section-heading">
      <span class="eyebrow">${ui.yourLie}</span>
      <h1 tabindex="-1">“${escapeHtml(state.lie)}”</h1>
    </div>

    ${incidentBoard(true)}

    <article class="challenge-card">
      ${personAvatar(challenger)}
      <div>
        <span>${ui.challengeBy(challenger.name)}</span>
        <p>“${escapeHtml(state.challengeText)}”</p>
      </div>
    </article>

    <div class="builder-step">
      <span class="eyebrow">${ui.finalResponsePrompt}</span>
      <div class="lie-list">
        ${getResponseOptions(state)
          .map(
            (option) => `
              <button class="lie-option" data-action="respond" data-id="${option.id}">
                <span>${option.label}</span>
                <small>${option.hint}</small>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderResponse() {
  const leans = getCurrentLeans(state);
  return `
    ${progress(4, ui.stages.meetingEnd)}
    <div class="section-heading">
      <span class="eyebrow">${ui.yourResponse}</span>
      <h1 tabindex="-1">“${escapeHtml(state.responseText)}”</h1>
      <p>${ui.crewDecided}</p>
    </div>

    ${incidentBoard(true)}

    <div class="lean-list" aria-label="${ui.preVoteAria}">
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

    <button class="primary-button" data-action="vote">${ui.showVote}</button>
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

    <button class="primary-button" data-action="restart">${ui.restart}</button>
  `;
}

function render() {
  const views = {
    intro: renderIntro,
    evidence: renderEvidence,
    meeting: renderMeeting,
    lie: renderLieBuilder,
    challenge: renderChallenge,
    response: renderResponse,
    result: renderResult,
  };
  app.innerHTML = views[state.phase]();
  app.querySelector("h1")?.focus({ preventScroll: true });
}

function resetGame() {
  state = startGame(createGame({ caseIndex: nextCaseIndex(state.caseIndex), locale }));
  selectedTargetId = null;
  selectedAccusedId = null;
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "start") state = startGame(state);
  if (action === "select-target") selectedTargetId = button.dataset.id;
  if (action === "plant" && selectedTargetId) state = plantEvidence(state, selectedTargetId);
  if (action === "open-lie-builder") state = { ...state, phase: "lie" };
  if (action === "select-accused") selectedAccusedId = button.dataset.id;
  if (action === "make-claim" && selectedAccusedId) {
    state = applyLie(state, selectedAccusedId, button.dataset.id);
  }
  if (action === "respond") state = applyResponse(state, button.dataset.id);
  if (action === "vote") state = resolveVote(state);
  if (action === "restart") return resetGame();

  render();
});

render();
