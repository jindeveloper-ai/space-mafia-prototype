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
} from "./game-engine.js?v=0.12.7";
import { getCopy, normalizeLocale } from "./i18n.js?v=0.12.7";
import {
  buildChatPayload,
  fallbackAccusation,
  fallbackResponse,
  MAX_CHAT_LENGTH,
  normalizeInterpretation,
} from "./chat-adapter.js?v=0.12.7";
import {
  acceptPersonalQuest,
  createProgression,
  dismissCompletedQuest,
  isAttackAllowed,
  isPrivateDetectiveEquipped,
  localDateKey,
  markDebriefViewed,
  PRIVATE_DETECTIVE_ID,
  PROGRESSION_STORAGE_KEY,
  setEquippedJob,
  settlePersonalQuest,
} from "./progression.js?v=0.12.7";

const app = document.querySelector("#app");
const assetVersion = new URL(import.meta.url).searchParams.get("v");
const versionLabel = assetVersion ? `v${assetVersion}` : "dev";
const locale = normalizeLocale(new URLSearchParams(window.location.search).get("lang"));
const requestedTestDate = new URLSearchParams(window.location.search).get("testDate");
const injectedTestDate = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && /^\d{4}-\d{2}-\d{2}$/.test(requestedTestDate ?? "")
  ? requestedTestDate
  : null;
const currentDateKey = () => injectedTestDate ?? localDateKey();
const copy = getCopy(locale);
const ui = copy.ui;
const FRIEND_EMOJI_OPTIONS = ["😂", "🥹", "😅", "🤔", "😳", "🙄", "👍", "👏", "❤️", "🔥", "👀", "🚀"];
const CREW_AVATARS = {
  mina: "./assets/images/mina.png",
  juno: "./assets/images/juno.png",
  noel: "./assets/images/noel.png",
};
const PROFILE_STORAGE_KEY = "oxygen-room-profile";
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
const soundController = window.oxygenRoomSound;

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
soundController?.setLabels({
  start: ui.audioStart,
  mute: ui.audioMute,
  unmute: ui.audioUnmute,
  volume: ui.audioVolume,
});

let state = { ...createGame({ locale }), phase: "welcome" };
let selectedTargetId = null;
let chatLog = [];
let chatPending = false;
let chatMode = "ready";
let chatNotice = null;
let typingSpeakerId = null;
let selectedFriendId = null;
let friendConversationIndex = 0;
let playerProfile = loadPlayerProfile();
let progression = loadProgression();
let questOfferCharacterId = null;
let lastPersonalQuestResult = null;
let lastClueAward = null;
let detectiveInspection = null;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wait = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, reducedMotion.matches ? 0 : milliseconds);
});

const escapeHtml = (value) => {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
};

function loadPlayerProfile() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null");
    const name = String(stored?.name ?? "").trim().slice(0, 12);
    const avatar = typeof stored?.avatar === "string" && stored.avatar.startsWith("data:image/") ? stored.avatar : "";
    return { name, avatar };
  } catch {
    return { name: "", avatar: "" };
  }
}

function loadProgression() {
  try {
    return createProgression(JSON.parse(window.localStorage.getItem(PROGRESSION_STORAGE_KEY) ?? "null"));
  } catch {
    return createProgression();
  }
}

function saveProgression(nextProgression) {
  progression = createProgression(nextProgression);
  try {
    window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(progression));
  } catch {
    // The current session still works when browser storage is unavailable.
  }
  return progression;
}

function savePlayerProfile(profile) {
  playerProfile = profile;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // The session still works if browser storage is unavailable.
  }
}

function profileAvatar(size = "normal", avatar = playerProfile.avatar, name = playerProfile.name) {
  const mark = escapeHtml((name || ui.profileDefaultName).slice(0, 1).toUpperCase());
  const image = avatar ? `<img src="${avatar}" alt="" />` : mark;
  return `<span class="avatar avatar--${size} avatar--player" aria-hidden="true">${image}</span>`;
}

function resizeProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/") || file.size > 2_000_000) {
      reject(new Error("invalid_profile_photo"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("profile_photo_read_failed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("profile_photo_decode_failed"));
      image.onload = () => {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("profile_photo_canvas_failed"));
        context.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          256,
          256,
        );
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

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
  return `<span class="avatar avatar--${size} avatar--${person.id}" aria-hidden="true"><img src="${CREW_AVATARS[person.id]}" alt="" /></span>`;
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

function friendStatusLabel() {
  if (chatMode === "live") return ui.chatModeLive;
  if (chatNotice) return ui.chatModeMock;
  return ui.online;
}

function practiceVariant(speakerId, stage) {
  const source = [
    state.caseIndex,
    state.subquestId,
    state.targetId,
    state.accusedId,
    state.claimId,
    speakerId,
    stage,
    chatLog.filter((item) => item.speakerId === "player").length,
  ].join(":");
  return [...source].reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
}

function currentThemeIcon() {
  return { system: "◐", light: "○", dark: "●" }[themeController?.read() ?? "system"];
}

function screenAudioControl(includeVolume = false) {
  return `
    <div class="screen-audio ${includeVolume ? "has-volume" : ""}">
      <button type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
      ${includeVolume ? `<input data-audio-volume type="range" min="0" max="60" step="1" value="30" aria-label="${ui.audioVolume}" />` : ""}
    </div>
  `;
}

function gameRoomBar(step, label) {
  return `
    <header class="game-room-bar">
      <button class="room-back" type="button" data-action="go-home" aria-label="${copy.meta.home}">‹</button>
      ${roomAvatarStack()}
      <div class="game-room-bar__copy">
        <strong>${ui.chatRoomTitle}</strong>
        <small>${roomStatusLabel()}</small>
      </div>
      <span class="room-phase"><strong>${step}/5</strong><span>${label}</span></span>
      <button class="room-sound" type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
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
        ${renderActivePersonalQuest("game")}
      </div>
    </details>
  `;
}

function renderWelcome() {
  return `
    <section class="welcome-screen">
      ${screenAudioControl(true)}
      <span class="welcome-pill">${ui.welcomePill}</span>
      <div class="welcome-art" aria-hidden="true">
        <img src="./assets/images/mafia-astronaut-v2.png" alt="" />
      </div>
      <div class="welcome-copy">
        <h1 tabindex="-1">${ui.welcomeTitle}</h1>
        <p>${ui.welcomeLead}</p>
      </div>
      <button class="welcome-start" type="button" data-action="get-started">${ui.welcomeStart}</button>
    </section>
  `;
}

function renderProfileSetup() {
  return `
    <section class="profile-screen">
      ${screenAudioControl()}
      <button class="plain-back" type="button" data-action="back-welcome" aria-label="${ui.profileBack}">‹</button>
      <div class="profile-copy">
        <span>${ui.profileStep}</span>
        <h1 tabindex="-1">${ui.profileTitle}</h1>
        <p>${ui.profileLead}</p>
      </div>
      <form class="profile-form">
        <label class="profile-photo" for="profile-photo-input">
          <span class="profile-preview">${profileAvatar("large")}</span>
          <strong>${ui.profilePhoto}</strong>
          <small>${ui.profilePhotoOptional}</small>
        </label>
        <input id="profile-photo-input" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" />
        <label class="profile-name" for="profile-name-input">
          <span>${ui.profileName}</span>
          <input id="profile-name-input" name="name" minlength="1" maxlength="12" autocomplete="nickname" value="${escapeHtml(playerProfile.name)}" placeholder="${ui.profileNamePlaceholder}" required />
        </label>
        <p class="profile-error" role="alert" hidden></p>
        <button class="welcome-start" type="submit">${ui.profileContinue}</button>
        <small class="profile-privacy">${ui.profilePrivacy}</small>
      </form>
    </section>
  `;
}

function homeHistoryRow(person, index) {
  return `
    <button class="home-history-row ${index === 1 ? "is-featured" : ""}" type="button" data-action="choose-friend" data-id="${person.id}">
      ${personAvatar(person, "small")}
      <span><strong>${person.name}</strong><small>${ui.homeHistoryPreview[person.personality]}</small></span>
      <time>${ui.homeHistoryTime[index]}</time>
      <span aria-hidden="true">›</span>
    </button>
  `;
}

function personalQuestCopy(quest = progression.activeQuest) {
  if (!quest) return null;
  return {
    name: ui.personalQuest.names[quest.questId],
    goal: ui.personalQuest.goals[quest.questId],
    person: crewMember(quest.characterId),
  };
}

function renderQuestOffer(person) {
  if (questOfferCharacterId !== person.id || progression.activeQuest) return "";
  const questId = { mina: "mina-shift", juno: "juno-counterexample", noel: "noel-consistency" }[person.id];
  return `
    <article class="personal-quest-card is-offer">
      <div class="personal-quest-card__person">${personAvatar(person, "small")}<span><small>${ui.personalQuest.title}</small><strong>${person.name}</strong></span></div>
      <h2>${ui.personalQuest.names[questId]}</h2>
      <p>${ui.personalQuest.goals[questId]}</p>
      <div class="personal-quest-card__actions">
        <button class="tonal-button" type="button" data-action="accept-personal-quest" data-id="${person.id}">${ui.personalQuest.accept}</button>
        <button class="text-button" type="button" data-action="later-personal-quest">${ui.personalQuest.later}</button>
      </div>
    </article>
  `;
}

function renderActivePersonalQuest(mode = "game") {
  const result = mode === "result" ? lastPersonalQuestResult : null;
  const quest = progression.activeQuest ?? result;
  if (!quest || (mode === "game" && quest.status !== "active")) return "";
  const detail = personalQuestCopy(quest);
  if (mode === "result" && !result) return "";
  const status = result
    ? result.success ? ui.personalQuest.success : ui.personalQuest.failure
    : mode === "friend" ? ui.personalQuest.accepted : ui.personalQuest.inProgress;
  return `
    <details class="personal-quest-card is-${mode}" ${mode === "game" ? "" : "open"}>
      <summary>
        ${personAvatar(detail.person, "small")}
        <span><small>${mode === "game" ? ui.personalQuest.inGameLabel : ui.personalQuest.title}</small><strong>${detail.name}</strong></span>
        <b>${status}</b>
      </summary>
      <div class="personal-quest-card__body">
        <p>${detail.goal}</p>
        ${result ? `<strong>${ui.personalQuest.affinityGain(result.affinityDelta)}</strong><p>${ui.personalQuest.reactions[result.characterId][result.success ? "success" : "failure"]}</p>` : ""}
      </div>
    </details>
  `;
}

function clueBody(clue, index) {
  const speaker = clue.characterId === "group" ? ui.journal.groupName : crewMember(clue.characterId).name;
  const outcome = clue.outcome ? ui.debriefOutcome[clue.outcome] : "";
  const selected = clue.selectedId ? displayName(clue.selectedId) : ui.debriefNoSelection;
  return ui.journal.clueBodies[index](speaker, outcome, selected);
}

function renderJournal() {
  const count = progression.clues.length;
  const todayComplete = progression.clueDates.includes(currentDateKey());
  const nextPerson = progression.activeQuest
    ? crewMember(progression.activeQuest.characterId)
    : crewMember(selectedFriendId) ?? crew[0];
  return `
    <section class="job-journal" aria-label="${ui.journal.title}">
      <div class="job-journal__head">
        <span aria-hidden="true">${count >= 5 ? "✓" : "?"}</span>
        <div><strong>${ui.journal.title}</strong><small>${ui.journal.progress(count)}</small></div>
      </div>
      <div class="job-journal__track"><span style="width:${count * 20}%"></span></div>
      <p>${count >= 5 ? ui.journal.complete : todayComplete ? ui.journal.todayComplete : ui.journal.next(nextPerson.name)}</p>
      ${count ? `
        <details>
          <summary>${ui.journal.cluesOpen}</summary>
          <ol>${progression.clues.map((clue, index) => `<li><strong>${ui.journal.clueTitles[index]}</strong><span>${clueBody(clue, index)}</span></li>`).join("")}</ol>
        </details>
      ` : `<div class="job-silhouette" aria-label="${ui.journal.locked}">?</div>`}
    </section>
  `;
}

function renderJobChoice() {
  if (!progression.unlockedJobs.includes(PRIVATE_DETECTIVE_ID)) return renderJournal();
  const equipped = isPrivateDetectiveEquipped(progression);
  return `
    ${renderJournal()}
    <section class="job-choice">
      <span>${ui.detective.jobTitle}</span>
      <div>
        <button class="${equipped ? "is-selected" : ""}" type="button" data-action="equip-job" data-id="${PRIVATE_DETECTIVE_ID}">${ui.detective.equip}</button>
        <button class="${equipped ? "" : "is-selected"}" type="button" data-action="equip-job" data-id="basic">${ui.detective.playBasic}</button>
      </div>
      <small>${equipped ? ui.detective.equipped : ui.detective.basic}</small>
    </section>
  `;
}

function renderHome() {
  const name = escapeHtml(playerProfile.name || ui.profileDefaultName);
  return `
    <section class="home-screen">
      <header class="home-header">
        <button class="home-menu" type="button" data-action="open-tutorial" aria-label="${ui.homeTutorial}"></button>
        <p><small>${ui.homeGreeting}</small><strong>${ui.homeHello(name)}</strong></p>
        <button class="home-sound" type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
        <button class="home-profile" type="button" data-action="edit-profile" aria-label="${ui.homeEditProfile}">${profileAvatar("small")}</button>
      </header>

      <div class="home-hero">
        <h1 tabindex="-1">${ui.homeTitle}</h1>
        <button class="home-search" type="button" data-action="open-friends"><span aria-hidden="true">⌕</span>${ui.homeSearch}</button>
      </div>

      <div class="home-actions">
        <button class="home-action is-primary" type="button" data-action="open-tutorial">
          <span>${ui.homePlayEyebrow}</span><strong>${ui.homePlayTitle}</strong><small>${ui.homePlayLead}</small><b aria-hidden="true">↗</b>
        </button>
        <button class="home-action" type="button" data-action="open-friends">
          <span>${ui.homeChatEyebrow}</span><strong>${ui.homeChatTitle}</strong><small>${ui.homeChatLead}</small><b aria-hidden="true">↗</b>
        </button>
      </div>

      <section class="home-history" aria-label="${ui.homeHistory}">
        <div><h2>${ui.homeHistory}</h2><button type="button" data-action="open-friends">${ui.homeSeeAll}</button></div>
        ${crew.map(homeHistoryRow).join("")}
      </section>
    </section>
  `;
}

function renderIntro() {
  return `
    <div class="tutorial-head">
      <button class="plain-back" type="button" data-action="go-home" aria-label="${ui.homeBack}">‹</button>
      <span>${ui.tutorialLabel}</span>
      <strong>${ui.tutorialTitle}</strong>
    </div>
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

    ${renderJobChoice()}

    <div class="intro-actions">
      <button class="primary-button" data-action="start">${ui.start}</button>
      <button class="secondary-button" data-action="open-friends">${ui.friendChatOpen}</button>
    </div>

    <ol class="rules" aria-label="${ui.rulesAria}">
      ${ui.rules.map((rule, index) => `<li><span>${index + 1}</span><p>${rule}</p></li>`).join("")}
    </ol>
  `;
}

function friendSelectBar() {
  return `
    <header class="game-room-bar friend-room-bar">
      <button class="room-back" type="button" data-action="back-home" aria-label="${copy.meta.home}">‹</button>
      ${roomAvatarStack()}
      <div class="game-room-bar__copy">
        <strong>${ui.friendChatTitle}</strong>
        <small>${ui.friendChatSelectLead}</small>
      </div>
      <button class="room-sound" type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
      <button class="room-theme" type="button" data-action="cycle-theme" aria-label="${copy.meta.themeControl(copy.meta.themeModes[themeController?.read() ?? "system"])}">
        <span aria-hidden="true">${currentThemeIcon()}</span>
      </button>
    </header>
  `;
}

function renderFriendSelect() {
  return `
    <div class="game-room-view friend-select-view">
      ${friendSelectBar()}
      <section class="friend-select-content">
        <div class="section-heading">
          <span class="eyebrow">${ui.friendChatEyebrow}</span>
          <h1 tabindex="-1">${ui.friendChatSelectTitle}</h1>
          <p>${ui.friendChatSelectDescription}</p>
        </div>
        ${renderJournal()}
        <div class="friend-list" role="list">
          ${crew.map((person) => `
            <button class="friend-row" type="button" data-action="choose-friend" data-id="${person.id}" aria-label="${ui.friendChatWith(person.name)}">
              ${personAvatar(person)}
              <span><strong>${person.name}</strong><small>${person.style} · ${ui.affinity(progression.affinity[person.id])}</small></span>
              <span class="online-dot" aria-label="${ui.online}"></span>
              <span class="friend-row__arrow" aria-hidden="true">›</span>
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function openFriendChat(personId) {
  const person = crewMember(personId);
  const variant = (state.caseIndex + friendConversationIndex + crew.findIndex((item) => item.id === personId)) % 3;
  selectedFriendId = personId;
  questOfferCharacterId = null;
  friendConversationIndex += 1;
  chatLog = [{ speakerId: personId, text: ui.friendGreetings[person.personality][variant] }];
  chatPending = false;
  chatMode = "ready";
  chatNotice = null;
  typingSpeakerId = null;
  state = { ...state, phase: "friend-chat" };
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
          ${renderActivePersonalQuest("game")}
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

function renderDetectivePanel() {
  if (!isPrivateDetectiveEquipped(progression)) return "";
  if (detectiveInspection) {
    const voter = crewMember(detectiveInspection.voterId);
    return `
      <details class="detective-panel is-revealed" open>
        <summary><span>${ui.detective.abilityTitle}</span><strong>${ui.detective.blocked}</strong></summary>
        <p>${ui.detective.revealed(voter.name, displayName(detectiveInspection.candidateId))}</p>
      </details>
    `;
  }
  return `
    <details class="detective-panel">
      <summary><span>${ui.detective.abilityTitle}</span><strong>${ui.detective.choose}</strong></summary>
      <p>${ui.detective.abilityLead}</p>
      <div>${crew.map((person) => `<button type="button" data-action="inspect-suspicion" data-id="${person.id}">${ui.detective.inspect(person.name)}</button>`).join("")}</div>
    </details>
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
      ${renderActivePersonalQuest("game")}
      ${renderDetectivePanel()}
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
      const blocked = !isAttackAllowed(detectiveInspection?.voterId, person.id);
      return { text: claim.label, meta: blocked ? ui.detective.blocked : `${person.name} · ${relation}`, tone: blocked ? "is-blocked" : impact < 0 ? "is-conflict" : impact >= 20 ? "is-strong" : "is-weak", blocked };
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
        <button type="button" class="chat-suggestion ${suggestion.tone}" data-action="draft-message" data-message="${encodeURIComponent(suggestion.text)}" ${suggestion.blocked ? "disabled" : ""}>
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
      ${person ? personAvatar(person, "small") : profileAvatar("small")}
      <div>
        <strong>${item.speakerId === "player" ? escapeHtml(playerProfile.name || ui.chatYou) : escapeHtml(person?.name ?? item.speakerId)}<small>${ui.chatNow}</small></strong>
        <p>${escapeHtml(item.text)}</p>
      </div>
    </article>
  `;
}

function typingIndicator() {
  if (!chatPending) return "";
  const dots = `
    <span class="typing-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `;
  if (!typingSpeakerId) {
    return `<p class="chat-pending">${dots}<span>${ui.chatTyping}</span></p>`;
  }
  const person = crewMember(typingSpeakerId);
  return `
    <article class="chat-message chat-message--typing" aria-label="${ui.chatTypingPerson(person.name)}">
      ${personAvatar(person, "small")}
      <div>
        <strong>${escapeHtml(person.name)}<small>${ui.chatNow}</small></strong>
        <p>${dots}<span class="visually-hidden">${ui.chatTypingPerson(person.name)}</span></p>
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
          ${typingIndicator()}
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

function friendRoomBar(person) {
  return `
    <header class="game-room-bar friend-room-bar">
      <button class="room-back" type="button" data-action="back-friends" aria-label="${ui.friendChatBack}" ${chatPending ? "disabled" : ""}>‹</button>
      ${personAvatar(person, "small")}
      <div class="game-room-bar__copy">
        <strong>${person.name}</strong>
        <small>${chatPending ? ui.chatTypingPerson(person.name) : friendStatusLabel()} · ${ui.affinity(progression.affinity[person.id])}</small>
      </div>
      <button class="room-sound" type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
      <button class="room-theme" type="button" data-action="cycle-theme" aria-label="${copy.meta.themeControl(copy.meta.themeModes[themeController?.read() ?? "system"])}">
        <span aria-hidden="true">${currentThemeIcon()}</span>
      </button>
    </header>
  `;
}

function renderFriendChat() {
  const person = crewMember(selectedFriendId);
  return `
    <div class="game-room-view is-chat friend-chat-view">
      ${friendRoomBar(person)}
      <section class="chat-room is-focus" aria-label="${ui.friendTranscriptAria(person.name)}">
        <div class="chat-transcript" aria-live="polite">
          <p class="chat-day">${ui.friendChatDay}</p>
          ${chatLog.map(chatMessage).join("")}
          ${typingIndicator()}
          ${renderQuestOffer(person)}
          ${progression.activeQuest?.characterId === person.id ? renderActivePersonalQuest("friend") : ""}
        </div>
      </section>
      <div class="chat-dock friend-chat-dock">
        ${chatNotice ? `<p class="chat-notice" role="status">${escapeHtml(chatNotice)}</p>` : ""}
        ${renderJournal()}
        <form class="chat-composer" data-chat-stage="friend">
          <label class="visually-hidden" for="player-message">${ui.chatInputLabel}</label>
          <div class="chat-composer__row has-emoji">
            <details class="emoji-picker">
              <summary aria-label="${ui.friendEmojiOpen}" title="${ui.friendEmojiOpen}"><span aria-hidden="true">☺</span></summary>
              <div class="emoji-picker__panel" role="group" aria-label="${ui.friendEmojiPicker}">
                ${FRIEND_EMOJI_OPTIONS.map((emoji) => `
                  <button class="emoji-option" type="button" data-action="insert-friend-emoji" data-emoji="${emoji}" aria-label="${ui.friendEmojiInsert(emoji)}">
                    <span aria-hidden="true">${emoji}</span>
                  </button>
                `).join("")}
              </div>
            </details>
            <textarea id="player-message" name="message" maxlength="${MAX_CHAT_LENGTH}" rows="1" placeholder="${ui.friendChatPlaceholder(person.name)}" ${chatPending ? "disabled" : ""} required></textarea>
            <button class="composer-send" type="submit" aria-label="${ui.chatSend}" ${chatPending ? "disabled" : ""}><span aria-hidden="true">↑</span></button>
          </div>
          <small class="chat-limit">${ui.friendChatPrivacy} · ${ui.chatLength(MAX_CHAT_LENGTH)}</small>
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

      ${renderActivePersonalQuest("game")}

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

    ${renderActivePersonalQuest("result")}

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

    <div class="result-actions">
      <button class="primary-button" data-action="debrief">${ui.debriefOpen}</button>
      <button class="secondary-button" data-action="restart">${ui.restart}</button>
    </div>
  `;
}

function buildDebriefSummary() {
  return {
    outcome: state.outcome,
    targetId: state.targetId,
    accusedId: state.accusedId,
    claimId: state.claimId,
    responseId: state.responseId,
    selectedId: state.selectedId,
    voteShiftCount: state.voteShiftCount,
    votes: state.votes.map((vote) => ({ voterId: vote.voterId, candidateId: vote.candidateId })),
    personalQuest: lastPersonalQuestResult ? {
      questId: lastPersonalQuestResult.questId,
      characterId: lastPersonalQuestResult.characterId,
      success: lastPersonalQuestResult.success,
      affinityDelta: lastPersonalQuestResult.affinityDelta,
    } : null,
  };
}

function debriefSummaryLine() {
  const selected = state.selectedId
    ? displayName(state.selectedId)
    : ui.debriefNoSelection;
  return ui.debriefRoundLine(
    displayName(state.targetId),
    displayName(state.accusedId),
    selected,
  );
}

function fallbackDebriefReplies() {
  const outcome = ui.debriefOutcome[state.outcome];
  return crew.map((person) => {
    const questReaction = lastPersonalQuestResult?.characterId === person.id
      ? ui.personalQuest.reactions[person.id][lastPersonalQuestResult.success ? "success" : "failure"]
      : null;
    return {
      speakerId: person.id,
      text: questReaction ?? ui.debriefPractice[person.personality](
        person.personality === "record"
          ? displayName(state.selectedId)
          : person.personality === "skeptic"
            ? displayName(state.accusedId)
            : outcome,
      ),
    };
  });
}

function renderDebrief() {
  return `
    <div class="game-room-view is-chat debrief-view">
      <header class="game-room-bar friend-room-bar">
        <button class="room-back" type="button" data-action="go-home" aria-label="${ui.homeBack}">‹</button>
        ${roomAvatarStack()}
        <div class="game-room-bar__copy"><strong>${ui.debriefTitle}</strong><small>${roomStatusLabel()}</small></div>
        <button class="room-sound" type="button" data-audio-toggle aria-label="${ui.audioMute}"><span aria-hidden="true">♪</span></button>
      </header>
      <section class="debrief-summary" aria-label="${ui.debriefSummary}">
        <span>${ui.debriefSummary}</span>
        <strong>${ui.debriefOutcome[state.outcome]}</strong>
        <p>${debriefSummaryLine()}</p>
      </section>
      ${renderActivePersonalQuest("result")}
      ${lastClueAward ? `<p class="clue-award-banner"><strong>${ui.journal.clueAwarded}</strong><span>${progression.clues.length >= 5 ? ui.journal.unlock : ui.journal.clueTitles[progression.clues.length - 1]}</span></p>` : ""}
      ${renderJournal()}
      <section class="chat-room is-focus" aria-label="${ui.debriefTitle}">
        <div class="chat-transcript" aria-live="polite">
          ${chatLog.map(chatMessage).join("")}
          ${typingIndicator()}
        </div>
      </section>
      <div class="chat-dock debrief-dock">
        ${chatNotice ? `<p class="chat-notice" role="status">${escapeHtml(chatNotice)}</p>` : ""}
        <p>${ui.debriefLead}</p>
        <div class="debrief-actions">
          <button class="primary-button" type="button" data-action="restart" ${chatPending ? "disabled" : ""}>${ui.restart}</button>
          <button class="secondary-button" type="button" data-action="go-home" ${chatPending ? "disabled" : ""}>${ui.debriefHome}</button>
        </div>
      </div>
    </div>
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
  typingSpeakerId = null;
  state = { ...state, phase: "lie" };
}

async function requestCharacterChat(stage, message, friendId = null) {
  const payload = buildChatPayload({
    locale,
    stage,
    message,
    state,
    crew,
    incident,
    transcript: chatLog,
    friendId,
  });
  if (stage === "debrief") payload.debrief = buildDebriefSummary();
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

async function openDebrief() {
  if (chatPending) return;
  const dailyProgress = markDebriefViewed(progression, { date: currentDateKey() });
  saveProgression(dailyProgress.progress);
  lastClueAward = dailyProgress.clue;
  chatLog = [{ speakerId: "system", text: debriefSummaryLine() }];
  chatPending = true;
  chatNotice = null;
  typingSpeakerId = null;
  state = { ...state, phase: "debrief" };
  render();

  let replies = [];
  try {
    const remote = await requestCharacterChat("debrief", ui.debriefRequest);
    replies = safeLiveReplies(remote?.replies ?? [], 140);
    chatMode = "live";
  } catch {
    chatMode = "mock";
    chatNotice = ui.debriefFallback;
  }

  await revealReplies(replies.length === crew.length ? replies : fallbackDebriefReplies(), "debrief");
  typingSpeakerId = null;
  chatPending = false;
  render();
}

function safeLiveReplies(replies, maxLength = 120) {
  const seen = new Set();
  return replies.flatMap((reply) => {
    if (!crew.some((member) => member.id === reply?.speakerId) || seen.has(reply.speakerId)) return [];
    const text = String(reply.message ?? "").trim().slice(0, maxLength);
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
      : ui.chatPracticeReaction(
        member.personality,
        displayName(leans.get(member.id).candidateId),
        practiceVariant(member.id, "accusation"),
      ),
  }));
}

function fallbackResponseReplies(nextState) {
  return getCurrentLeans(nextState).map((lean) => ({
    speakerId: lean.voterId,
    text: ui.chatPracticeDecision(
      crewMember(lean.voterId).personality,
      displayName(lean.candidateId),
      practiceVariant(lean.voterId, "response"),
    ),
  }));
}

function fallbackFriendReply(message) {
  const person = crewMember(selectedFriendId);
  return [{
    speakerId: person.id,
    text: ui.friendPracticeReply(
      person.personality,
      practiceVariant(person.id, "friend"),
      message.slice(0, 28),
    ),
  }];
}

function orderedReplies(replies, stage) {
  if (stage === "friend" || replies.length < 2) return replies;
  const byId = new Map(replies.map((reply) => [reply.speakerId, reply]));
  const ordered = crew.map((person) => byId.get(person.id)).filter(Boolean);
  const offset = (state.caseIndex + (stage === "response" ? 1 : 0)) % ordered.length;
  return [...ordered.slice(offset), ...ordered.slice(0, offset)];
}

function typingDuration(reply) {
  const millisecondsPerCharacter = { mina: 8, juno: 11, noel: 14 }[reply.speakerId] ?? 10;
  return Math.min(1_450, 420 + reply.text.length * millisecondsPerCharacter);
}

async function revealReplies(replies, stage) {
  for (const reply of orderedReplies(replies, stage)) {
    typingSpeakerId = reply.speakerId;
    render();
    await wait(typingDuration(reply));
    typingSpeakerId = null;
    chatLog.push(reply);
    render();
    await wait(140);
  }
}

async function handleChatSubmit(stage, rawMessage) {
  if (chatPending) return;
  const message = String(rawMessage).trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) return;
  const blockedPerson = stage === "accusation" && detectiveInspection
    ? crewMember(detectiveInspection.voterId)
    : null;
  if (blockedPerson) {
    const normalized = message.toLocaleLowerCase();
    if (normalized.includes(blockedPerson.id) || normalized.includes(blockedPerson.name.toLocaleLowerCase())) {
      chatNotice = ui.detective.cannotAccuse(blockedPerson.name);
      render();
      return;
    }
  }

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
    const allowedCrew = detectiveInspection
      ? crew.filter((person) => isAttackAllowed(detectiveInspection.voterId, person.id))
      : crew;
    const localFallback = fallbackAccusation(message, state, allowedCrew);
    const interpretation = normalizeInterpretation(
      stage,
      remote?.interpretation ?? localFallback,
      message,
      state,
      allowedCrew,
    );
    const nextState = applyLie(state, interpretation.accusedId, interpretation.claimId);
    chatLog.push({ speakerId: "system", text: ui.chatInterpretedLie(nextState.lie) });
    const replies = safeLiveReplies(remote?.replies ?? []);
    await revealReplies(replies.length === crew.length ? replies : fallbackAccusationReplies(nextState), stage);
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
    await revealReplies(replies.length === crew.length ? replies : fallbackResponseReplies(nextState), stage);
    state = nextState;
  }

  typingSpeakerId = null;
  chatPending = false;
  render();
}

async function handleFriendSubmit(rawMessage) {
  if (chatPending || !selectedFriendId) return;
  const message = String(rawMessage).trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) return;

  chatLog.push({ speakerId: "player", text: message });
  chatPending = true;
  chatNotice = null;
  typingSpeakerId = null;
  render();

  let replies = [];
  try {
    const remote = await requestCharacterChat("friend", message, selectedFriendId);
    replies = safeLiveReplies(remote?.replies ?? [], 160).filter((reply) => reply.speakerId === selectedFriendId);
    chatMode = "live";
  } catch {
    chatMode = "mock";
    chatNotice = ui.friendChatFallback;
  }

  await revealReplies(replies.length === 1 ? replies : fallbackFriendReply(message), "friend");
  typingSpeakerId = null;
  chatPending = false;
  if (!progression.activeQuest) questOfferCharacterId = selectedFriendId;
  render();
}

let renderedPhase = null;

function render() {
  const views = {
    welcome: renderWelcome,
    profile: renderProfileSetup,
    home: renderHome,
    intro: renderIntro,
    "friend-select": renderFriendSelect,
    "friend-chat": renderFriendChat,
    evidence: renderEvidence,
    meeting: renderMeeting,
    lie: renderChat,
    challenge: renderChat,
    response: renderResponse,
    result: renderResult,
    debrief: renderDebrief,
  };
  const phaseChanged = renderedPhase !== state.phase;
  document.body.dataset.phase = state.phase;
  app.dataset.phase = state.phase;
  app.innerHTML = views[state.phase]();
  if (phaseChanged) {
    window.scrollTo(0, 0);
    app.querySelector("h1")?.focus({ preventScroll: true });
  }
  if (["lie", "challenge", "response", "friend-chat", "debrief"].includes(state.phase)) {
    app.querySelector(".chat-transcript")?.scrollTo(0, 10_000);
  }
  soundController?.setScene(["welcome", "profile", "home", "intro", "friend-select", "friend-chat", "debrief"].includes(state.phase) ? "lobby" : "game");
  soundController?.refresh();
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
  typingSpeakerId = null;
  selectedFriendId = null;
  questOfferCharacterId = null;
  lastPersonalQuestResult = null;
  lastClueAward = null;
  detectiveInspection = null;
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "insert-friend-emoji") {
    const input = app.querySelector("#player-message");
    const emoji = button.dataset.emoji ?? "";
    if (!input || input.disabled || !emoji) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (input.value.length - (end - start) + emoji.length > MAX_CHAT_LENGTH) return;
    input.setRangeText(emoji, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    button.closest("details")?.removeAttribute("open");
    input.focus();
    return;
  }
  if (action === "get-started") {
    void soundController?.start?.();
    state = { ...state, phase: playerProfile.name ? "intro" : "profile" };
  }
  if (action === "back-welcome") state = { ...state, phase: "welcome" };
  if (action === "edit-profile") state = { ...state, phase: "profile" };
  if (action === "go-home") state = { ...state, phase: "home" };
  if (action === "open-tutorial") state = { ...state, phase: "intro" };
  if (action === "start") {
    detectiveInspection = null;
    lastPersonalQuestResult = null;
    lastClueAward = null;
    state = startGame(state);
  }
  if (action === "open-friends") state = { ...state, phase: "friend-select" };
  if (action === "back-home") state = { ...state, phase: "home" };
  if (action === "back-friends") {
    selectedFriendId = null;
    chatLog = [];
    chatPending = false;
    typingSpeakerId = null;
    state = { ...state, phase: "friend-select" };
  }
  if (action === "choose-friend") openFriendChat(button.dataset.id);
  if (action === "accept-personal-quest") {
    saveProgression(acceptPersonalQuest(progression, button.dataset.id, { date: currentDateKey() }));
    questOfferCharacterId = null;
  }
  if (action === "later-personal-quest") questOfferCharacterId = null;
  if (action === "equip-job") {
    saveProgression(setEquippedJob(progression, button.dataset.id === PRIVATE_DETECTIVE_ID ? PRIVATE_DETECTIVE_ID : null));
  }
  if (action === "inspect-suspicion" && isPrivateDetectiveEquipped(progression) && !detectiveInspection && state.phase === "meeting") {
    const voterId = button.dataset.id;
    const lean = getCurrentLeans(state).find((item) => item.voterId === voterId);
    if (lean) detectiveInspection = { voterId, candidateId: lean.candidateId };
  }
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
  if (action === "vote") {
    state = resolveVote(state);
    const settlement = settlePersonalQuest(progression, state, { date: currentDateKey() });
    saveProgression(settlement.progress);
    lastPersonalQuestResult = settlement.result;
  }
  if (action === "debrief") return openDebrief();
  if (action === "restart") {
    saveProgression(dismissCompletedQuest(progression));
    return resetGame();
  }

  render();
});

app.addEventListener("submit", (event) => {
  const profileForm = event.target.closest(".profile-form");
  if (profileForm) {
    event.preventDefault();
    const name = String(new FormData(profileForm).get("name") ?? "").trim().slice(0, 12);
    if (!name) return profileForm.querySelector("#profile-name-input")?.focus();
    savePlayerProfile({ name, avatar: playerProfile.avatar });
    state = { ...state, phase: "intro" };
    render();
    return;
  }
  const form = event.target.closest(".chat-composer");
  if (!form) return;
  event.preventDefault();
  const message = new FormData(form).get("message");
  if (form.dataset.chatStage === "friend") handleFriendSubmit(message);
  else handleChatSubmit(form.dataset.chatStage, message);
});

app.addEventListener("input", (event) => {
  const input = event.target.closest("#player-message");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
});

app.addEventListener("change", async (event) => {
  const input = event.target.closest("#profile-photo-input");
  if (!input) return;
  const error = app.querySelector(".profile-error");
  try {
    const avatar = await resizeProfilePhoto(input.files?.[0]);
    playerProfile = { ...playerProfile, avatar };
    const preview = app.querySelector(".profile-preview");
    if (preview) preview.innerHTML = profileAvatar("large");
    if (error) error.hidden = true;
  } catch {
    input.value = "";
    if (error) {
      error.textContent = ui.profilePhotoError;
      error.hidden = false;
    }
  }
});

app.addEventListener("keydown", (event) => {
  const input = event.target.closest("#player-message");
  if (!input || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  input.closest("form")?.requestSubmit();
});

render();
