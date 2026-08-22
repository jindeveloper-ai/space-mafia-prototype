import {
  applyHardDefense,
  applyHardLie,
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
} from "./game-engine.js?v=0.17.7";
import { getCopy, normalizeLocale } from "./i18n.js?v=0.17.7";
import {
  buildChatPayload,
  fallbackAccusation,
  fallbackResponse,
  MAX_CHAT_LENGTH,
  normalizeInterpretation,
} from "./chat-adapter.js?v=0.17.7";
import {
  acceptPersonalQuest,
  awardCrewLevels,
  createProgression,
  dismissCompletedQuest,
  isAttackAllowed,
  isPrivateDetectiveEquipped,
  localDateKey,
  markDebriefViewed,
  PRIVATE_DETECTIVE_ID,
  PROGRESSION_STORAGE_KEY,
  setEquippedJob,
  setDifficultyMode,
  settlePersonalQuest,
} from "./progression.js?v=0.17.7";
import { accountController, createMutationId } from "./account-client.js?v=0.17.7";
import { createVoiceCallController } from "./voice-call.js?v=0.17.7";

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
const newRoundId = () => globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const copy = getCopy(locale);
const ui = copy.ui;
const FRIEND_EMOJI_OPTIONS = ["😂", "🥹", "😅", "🤔", "😳", "🙄", "👍", "👏", "❤️", "🔥", "👀", "🚀"];
const FRIEND_STICKERS = [
  { id: "mina-capture", ownerId: "mina", labelIndex: 0, src: "./assets/images/stickers/mina-capture-v1.gif" },
  { id: "mina-deny", ownerId: "mina", labelIndex: 1, src: "./assets/images/stickers/mina-deny-v1.gif" },
  { id: "mina-inspect", ownerId: "mina", labelIndex: 2, src: "./assets/images/stickers/mina-inspect-v1.gif" },
  { id: "juno-skeptic", ownerId: "juno", labelIndex: 0, src: "./assets/images/stickers/juno-skeptic-v1.gif" },
  { id: "juno-compare", ownerId: "juno", labelIndex: 1, src: "./assets/images/stickers/juno-compare-v1.gif" },
  { id: "juno-nod", ownerId: "juno", labelIndex: 2, src: "./assets/images/stickers/juno-nod-v1.gif" },
  { id: "noel-caught", ownerId: "noel", labelIndex: 0, src: "./assets/images/stickers/noel-caught-v1.gif" },
  { id: "noel-laugh", ownerId: "noel", labelIndex: 1, src: "./assets/images/stickers/noel-laugh-v1.gif" },
  { id: "noel-replay", ownerId: "noel", labelIndex: 2, src: "./assets/images/stickers/noel-replay-v1.gif" },
];
const CREW_AVATARS = {
  mina: "./assets/images/mina.png",
  juno: "./assets/images/juno.png",
  noel: "./assets/images/noel.png",
};
const VOICE_EXPRESSION_STICKERS = {
  mina: {
    skeptical: "./assets/images/stickers/mina-inspect-v1.gif",
    heated: "./assets/images/stickers/mina-deny-v1.gif",
    amused: "./assets/images/stickers/mina-capture-v1.gif",
  },
  juno: {
    skeptical: "./assets/images/stickers/juno-skeptic-v1.gif",
    heated: "./assets/images/stickers/juno-compare-v1.gif",
    amused: "./assets/images/stickers/juno-nod-v1.gif",
  },
  noel: {
    skeptical: "./assets/images/stickers/noel-replay-v1.gif",
    heated: "./assets/images/stickers/noel-caught-v1.gif",
    amused: "./assets/images/stickers/noel-laugh-v1.gif",
  },
};
const PROFILE_STORAGE_KEY = "oxygen-room-profile";
const ARCHIVE_VISIT_STORAGE_KEY = "mars-net-archive-visits-v1";
const ARCHIVE_MEDIA_ASSETS = {
  mina: {
    image: "./assets/images/archive/mina-broadcast-capture-v1.jpg",
    video: "./assets/video/archive/mina-dome-concert-v1.mp4",
    poster: "./assets/images/archive/mina-dome-concert-v1.jpg",
    stickers: FRIEND_STICKERS.filter((sticker) => sticker.ownerId === "mina"),
  },
  juno: {
    image: "./assets/images/archive/juno-oxygen-sensor-v1.jpg",
    video: "./assets/video/archive/juno-purifier-restart-v1.mp4",
    poster: "./assets/images/archive/juno-purifier-restart-v1.jpg",
    stickers: FRIEND_STICKERS.filter((sticker) => sticker.ownerId === "juno"),
  },
  noel: {
    image: "./assets/images/archive/noel-broadcast-reaction-v1.jpg",
    video: "./assets/video/archive/noel-editing-clip-v1.mp4",
    poster: "./assets/images/archive/noel-editing-clip-v1.jpg",
    stickers: FRIEND_STICKERS.filter((sticker) => sticker.ownerId === "noel"),
  },
};
const CONTEXT_MEDIA_RULES = {
  game: [
    {
      id: "access-card",
      pattern: /(출입\s*카드|망가진\s*카드|사물함|가짜\s*증거|access\s*card|broken\s*card|locker|planted\s*evidence)/iu,
      src: "./assets/images/archive/planted-access-card-v1.jpg",
      labelKey: "accessCard",
    },
    {
      id: "control-camera",
      pattern: /(22\s*:\s*10|조종실\s*카메라|카메라\s*기록|강한\s*알리바이|control\s*room\s*camera|camera\s*record|strong\s*alibi)/iu,
      src: "./assets/images/game/control-room-camera-v1.jpg",
      labelKey: "controlCamera",
    },
    {
      id: "oxygen-room",
      pattern: /(산소실|정화기|안전장치|산소실\s*공구|oxygen\s*room|purifier|safety\s*unit|oxygen\s*tool)/iu,
      src: "./assets/images/game/oxygen-room-failure-v1.jpg",
      labelKey: "oxygenRoom",
    },
  ],
  friend: {
    mina: [
      { id: "broadcast", pattern: /(지구\s*중계|캡처|아이돌|무대|earth\s*feed|capture|idol|stage)/iu, src: "./assets/images/archive/mina-broadcast-capture-v1.jpg", labelKey: "minaBroadcast" },
      { id: "concert", pattern: /(공연|돔|티켓|concert|dome|ticket)/iu, src: "./assets/images/archive/mina-dome-concert-v1.jpg", labelKey: "minaConcert" },
    ],
    juno: [
      { id: "sensor", pattern: /(산소실|센서|원본\s*기록|로그|oxygen|sensor|raw\s*record|log)/iu, src: "./assets/images/archive/juno-oxygen-sensor-v1.jpg", labelKey: "junoSensor" },
      { id: "restart", pattern: /(정화기|재시작|안전장치|purifier|restart|safety\s*unit)/iu, src: "./assets/images/archive/juno-purifier-restart-v1.jpg", labelKey: "junoRestart" },
    ],
    noel: [
      { id: "reaction", pattern: /(방송|반응|지구\s*중계|stream|reaction|earth\s*feed)/iu, src: "./assets/images/archive/noel-broadcast-reaction-v1.jpg", labelKey: "noelReaction" },
      { id: "edit", pattern: /(클립|편집|원본|clip|edit|raw\s*feed)/iu, src: "./assets/images/archive/noel-editing-clip-v1.jpg", labelKey: "noelEdit" },
    ],
  },
};
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
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.set("lang", link.dataset.lang);
  link.href = `./?${nextParams.toString()}`;
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

let progression = loadProgression();
let state = {
  ...createGame({ locale, crewLevels: progression.crewLevels, difficultyMode: progression.difficultyMode, roundId: newRoundId() }),
  phase: "auth",
};
let authInitialView = "choice";
let selectedTargetId = null;
let chatLog = [];
let chatPending = false;
let chatMode = "ready";
let chatNotice = null;
let typingSpeakerId = null;
let selectedFriendId = null;
let friendConversationIndex = 0;
let friendChatLoadingOlder = false;
let playerProfile = loadPlayerProfile();
let questOfferCharacterId = null;
let lastPersonalQuestResult = null;
let lastClueAward = null;
let lastLevelGrowth = null;
let detectiveInspection = null;
let openArchiveCharacterId = null;
let openArchiveView = "profile";
let archiveReturnFocusId = null;
let playMode = "text";
let voiceController = null;
let voiceConsentBusy = false;
let voiceFallbackNotice = null;
const voicedOpeningKeys = new Set();
const archiveSessionComments = Object.create(null);
const archivePendingReplies = Object.create(null);
const shownContextMedia = new Set();

document.querySelectorAll("[data-lang]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (["auth", "welcome", "profile", "home", "intro"].includes(state.phase)) return;
    if (!window.confirm(ui.languageRestartConfirm)) event.preventDefault();
  });
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wait = (milliseconds) => new Promise((resolve) => {
  window.setTimeout(resolve, reducedMotion.matches ? 0 : milliseconds);
});

function voiceStageForPhase(phase = state.phase) {
  if (phase === "lie") return "accusation";
  if (phase === "hard-final") return "hard-final";
  if (phase === "hard-defense-1" || phase === "hard-defense-2") return "hard-response";
  if (phase === "challenge") return "response";
  return null;
}

function createRoundVoiceController() {
  voiceController?.end();
  const debugVoice = ["127.0.0.1", "localhost"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get("voiceDebug") === "1";
  voiceController = createVoiceCallController({
    locale,
    soundController,
    onUpdate() {
      if (playMode === "voice" && (state.phase === "voice-consent" || voiceStageForPhase())) render();
    },
    onMeter(level) {
      const wave = app.querySelector("[data-voice-wave]");
      if (!wave) return;
      wave.style.setProperty("--voice-level", level.toFixed(3));
    },
    async onFinalTranscript(utterance) {
      const stage = voiceStageForPhase();
      if (!stage || playMode !== "voice") return;
      await handleChatSubmit(stage, utterance.text, { inputMode: "voice", utteranceId: utterance.id });
    },
    onFallback() {
      voiceFallbackNotice = ui.voice.fallbackNotice;
      render();
    },
    onMetrics(metrics) {
      if (debugVoice) console.debug("[MARS.NET voice metrics]", metrics);
    },
  });
  return voiceController;
}

async function speakVoiceOpening(controller) {
  const openingKey = `${state.roundId ?? state.caseIndex}:accusation`;
  if (voicedOpeningKeys.has(openingKey) || controller !== voiceController) return;
  const statements = getMeetingStatements(state);
  const opening = statements[state.caseIndex % Math.max(1, statements.length)];
  if (!opening) return;
  try {
    const spoken = await controller.speak(opening.id, opening.text, {
      emotion: voiceEmotionForReply(opening, "accusation"),
    });
    if (spoken.completed) voicedOpeningKeys.add(openingKey);
  } catch {
    controller.end({ fallback: true });
    voiceFallbackNotice = ui.voice.fallbackNotice;
    render();
  }
}

async function reconnectVoiceGame() {
  voiceFallbackNotice = null;
  const controller = createRoundVoiceController();
  render();
  if (!await controller.prepare()) return;
  if (!await controller.connect()) return;
  await speakVoiceOpening(controller);
  render();
}

function switchVoiceGameToText() {
  voiceController?.end({ fallback: true });
  voiceController = null;
  playMode = "text";
  voiceFallbackNotice = null;
  chatNotice = ui.voice.switchedToText;
  render();
}

function endVoiceGame() {
  voiceController?.end();
  voiceController = null;
  playMode = "text";
  voiceFallbackNotice = null;
  chatLog = [];
  chatPending = false;
  chatNotice = null;
  typingSpeakerId = null;
  state = { ...state, phase: "intro" };
  render();
}

async function beginVoiceGame() {
  if (voiceConsentBusy) return;
  voiceConsentBusy = true;
  playMode = "voice";
  const controller = createRoundVoiceController();
  render();
  const ready = await controller.prepare();
  voiceConsentBusy = false;
  if (!ready) {
    render();
    return;
  }
  voiceFallbackNotice = null;
  detectiveInspection = null;
  lastPersonalQuestResult = null;
  lastClueAward = null;
  const nextState = state.targetId || state.outcome
    ? createGame({
      caseIndex: nextCaseIndex(state.caseIndex),
      subquestId: nextSubquestId(state.subquestId),
      locale,
      crewLevels: progression.crewLevels,
      difficultyMode: progression.difficultyMode,
      roundId: newRoundId(),
    })
    : state;
  state = startGame(nextState);
  render();
}

function beginTextGame() {
  voiceController?.end({ fallback: true });
  voiceController = null;
  playMode = "text";
  detectiveInspection = null;
  lastPersonalQuestResult = null;
  lastClueAward = null;
  const nextState = state.targetId || state.outcome
    ? createGame({
      caseIndex: nextCaseIndex(state.caseIndex),
      subquestId: nextSubquestId(state.subquestId),
      locale,
      crewLevels: progression.crewLevels,
      difficultyMode: progression.difficultyMode,
      roundId: newRoundId(),
    })
    : state;
  state = startGame(nextState);
}

const escapeHtml = (value) => {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
};

function recordArchiveVisit() {
  let dates = [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(ARCHIVE_VISIT_STORAGE_KEY) ?? "null");
    dates = Array.isArray(stored?.dates)
      ? stored.dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      : [];
  } catch {
    dates = [];
  }
  const today = currentDateKey();
  if (!dates.includes(today)) dates.push(today);
  dates = [...new Set(dates)].sort();
  try {
    window.localStorage.setItem(ARCHIVE_VISIT_STORAGE_KEY, JSON.stringify({ version: 1, dates }));
  } catch {
    // The archive remains available for this session when storage is blocked.
  }
  return dates;
}

let archiveVisitDates = recordArchiveVisit();

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
  accountController.notifyLocalState();
  return progression;
}

function savePlayerProfile(profile) {
  playerProfile = { ...profile, locale, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(playerProfile));
  } catch {
    // The session still works if browser storage is unavailable.
  }
  accountController.notifyLocalState();
  if (playerProfile.avatar) void accountController.uploadAvatar(playerProfile.avatar);
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

function voiceEmotionForReply(reply, stage = "accusation") {
  const text = String(reply?.text ?? "");
  if (/(ㅋㅋ|lol|lmao|인정|fair|맞네|okay)/iu.test(text)) return "amused";
  if (stage.startsWith("hard") || /(!|왜|아니|근데|말이 안|no way|wait|but)/iu.test(text)) return "heated";
  return "skeptical";
}

function voiceAvatar(person, emotion = "neutral") {
  const source = VOICE_EXPRESSION_STICKERS[person.id]?.[emotion] ?? CREW_AVATARS[person.id];
  return `<span class="avatar avatar--large avatar--${person.id} voice-expression is-${emotion}" aria-hidden="true"><img src="${source}" alt="" /></span>`;
}

function characterProfileButton(person, size, origin) {
  const triggerId = `character-profile-${origin}`;
  return `
    <button
      id="${triggerId}"
      class="avatar avatar--${size} avatar--${person.id} character-profile-trigger"
      type="button"
      data-character-profile="${person.id}"
      aria-label="${escapeHtml(ui.characterArchive.open(person.name))}"
      title="${escapeHtml(ui.characterArchive.open(person.name))}"
    ><img src="${CREW_AVATARS[person.id]}" alt="" /></button>
  `;
}

function crewLevelLabel(personId) {
  return ui.level.label(progression.crewLevels[personId]);
}

function roomAvatarStack() {
  return `
    <div class="room-avatar-stack" aria-hidden="true">
      ${crew.map((person) => personAvatar(person, "small")).join("")}
    </div>
  `;
}

function generatedArchivePost(person, templateIndex, date = null) {
  const templates = ui.characterArchive.dailyTemplates[person.id];
  const template = templates[templateIndex % templates.length];
  const board = person.style.split(" · ")[0];
  const time = date ? ui.characterArchive.dailyTime(date) : ui.characterArchive.seedTimes[templateIndex];
  return {
    board,
    time,
    title: template.title,
    body: template.body,
    meta: ui.characterArchive.dailyMeta(templateIndex),
    isHistory: templateIndex === 1,
    comments: [
      { author: ui.characterArchive.anonymous, text: template.comment, time },
      { author: ui.characterArchive.author, text: template.reply, time, isAuthor: true },
    ],
  };
}

function archiveMediaFor(person, postIndex) {
  const assets = ARCHIVE_MEDIA_ASSETS[person.id];
  const generatedSlots = {
    mina: ["image", "sticker", "video"],
    juno: ["image", "video", "sticker"],
    noel: ["image", "video", "sticker"],
  };
  const mediaType = postIndex === 0
    ? "image"
    : postIndex === 1
      ? "video"
      : generatedSlots[person.id][(postIndex - 2) % 3];
  const sticker = assets.stickers[postIndex % assets.stickers.length];
  return {
    type: mediaType,
    src: mediaType === "video" ? assets.video : mediaType === "sticker" ? sticker.src : assets.image,
    poster: assets.poster,
    label: mediaType === "video"
      ? ui.characterArchive.videoLabel(person.name)
      : mediaType === "sticker"
        ? ui.characterArchive.stickerLabel(person.name)
        : ui.characterArchive.photoLabel(person.name),
  };
}

function addAmbientArchiveComments(person, post, postIndex) {
  const ambient = ui.characterArchive.ambientComments[person.id];
  const existingAnonymous = post.comments.filter((comment) => !comment.isAuthor);
  if (existingAnonymous.length >= 3) return post;
  const authorComments = post.comments.filter((comment) => comment.isAuthor);
  const extraCount = 3 - existingAnonymous.length;
  const extra = Array.from({ length: extraCount }, (_, offset) => ({
    author: `${ui.characterArchive.anonymous}${existingAnonymous.length + offset + 1}`,
    text: ambient[(postIndex * 2 + offset) % ambient.length],
    time: post.time,
  }));
  return { ...post, comments: [...existingAnonymous, ...extra, ...authorComments] };
}

function archiveReplyForComment(person, comment, postIndex) {
  const normalized = comment.toLocaleLowerCase(locale);
  if (/(?:내가|i)\s*.{0,24}(?:카드|card).{0,24}(?:넣|심|plant|put)/iu.test(normalized)) {
    return ui.characterArchive.confessionReplies[person.id];
  }
  if (/(카드|사물함|출입|기록|원본|사진|영상|card|locker|access|record|original|photo|video)/iu.test(normalized)) {
    return ui.characterArchive.evidenceReplies[person.id];
  }
  const replies = ui.characterArchive.genericReplies[person.id];
  return replies[postIndex % replies.length];
}

function archivePostsFor(person) {
  const basePosts = ui.characterArchive.posts[person.id] ?? [];
  const seedPosts = [0, 1, 2].map((index) => generatedArchivePost(person, index));
  const dailyPosts = archiveVisitDates.map((date, index) => generatedArchivePost(person, index + 3, date));
  return [...basePosts, ...seedPosts, ...dailyPosts].map((post, index) => ({
    ...addAmbientArchiveComments(person, post, index),
    media: archiveMediaFor(person, index),
  }));
}

function renderArchiveMedia(media) {
  if (!media) return "";
  if (media.type === "video") {
    return `<figure class="archive-media"><video controls playsinline preload="metadata" poster="${media.poster}" aria-label="${escapeHtml(media.label)}"><source src="${media.src}" type="video/mp4" /></video><figcaption>${escapeHtml(media.label)}</figcaption></figure>`;
  }
  if (media.type === "sticker") {
    return `<figure class="archive-media is-sticker"><img src="${media.src}" alt="${escapeHtml(media.label)}" loading="lazy" /><figcaption>${escapeHtml(media.label)}</figcaption></figure>`;
  }
  return `<figure class="archive-media"><img src="${media.src}" alt="${escapeHtml(media.label)}" loading="lazy" /><figcaption>${escapeHtml(media.label)}</figcaption></figure>`;
}

function contextMediaForMessage(mode, message, personId = null) {
  const rules = mode === "game" ? CONTEXT_MEDIA_RULES.game : CONTEXT_MEDIA_RULES.friend[personId] ?? [];
  const rule = rules.find((candidate) => candidate.pattern.test(message));
  if (!rule) return null;
  const key = `${mode}:${personId ?? "room"}:${rule.id}`;
  if (shownContextMedia.has(key)) return null;
  shownContextMedia.add(key);
  return { id: rule.id, src: rule.src, label: ui.contextMedia[rule.labelKey] };
}

function appendContextMedia(mode, message, personId = null) {
  const media = contextMediaForMessage(mode, message, personId);
  if (media) chatLog.push({ speakerId: "media", media });
}

function renderContextMedia(media) {
  return `
    <figure class="chat-media-card">
      <img src="${media.src}" alt="${escapeHtml(media.label)}" loading="lazy" />
      <figcaption>${escapeHtml(media.label)}</figcaption>
    </figure>
  `;
}

function renderHabitatMap(open = false) {
  return `
    <details class="habitat-map-card" ${open ? "open" : ""}>
      <summary><span>${ui.habitatMapTitle}</span><strong>${ui.habitatMapOpen}</strong></summary>
      <figure>
        <img src="./assets/images/game/habitat-map-${locale}-v1.jpg" alt="${escapeHtml(ui.habitatMapAlt)}" loading="lazy" />
        <figcaption>${ui.habitatMapHint}</figcaption>
        <div class="habitat-map-locations" aria-label="${escapeHtml(ui.habitatMapLocationsLabel)}">
          ${ui.habitatMapLocations.map((location) => `<span>${escapeHtml(location)}</span>`).join("")}
        </div>
      </figure>
    </details>
  `;
}

function renderCharacterArchive() {
  const person = crewMember(openArchiveCharacterId);
  const posts = person ? archivePostsFor(person) : null;
  if (!person || !posts) return "";
  const [board, ...traitParts] = person.style.split(" · ");
  const traits = traitParts.join(" · ");
  const isPostsView = openArchiveView === "posts";
  return `
    <div class="character-archive" role="dialog" aria-modal="true" aria-labelledby="character-archive-title">
      <button class="character-archive__backdrop" type="button" data-action="close-character-archive" aria-label="${ui.characterArchive.close}"></button>
      <section class="character-archive__sheet">
        ${isPostsView ? `<button class="character-archive__nav-back" type="button" data-action="back-character-profile">‹ ${ui.characterArchive.profileBack}</button>` : ""}
        <header>
          ${personAvatar(person, "normal")}
          <div>
            <span>${isPostsView ? ui.characterArchive.eyebrow : ui.characterArchive.profileEyebrow}</span>
            <h2 id="character-archive-title">${isPostsView ? ui.characterArchive.title(person.name) : ui.characterArchive.profileTitle(person.name)}</h2>
            <small>${isPostsView ? person.style : ui.online}</small>
          </div>
          <button type="button" data-action="close-character-archive" aria-label="${ui.characterArchive.close}">×</button>
        </header>
        ${!isPostsView ? `
          <div class="character-profile__summary">
            <p>${escapeHtml(person.background)}</p>
            <dl>
              <div><dt>${ui.characterArchive.levelLabel}</dt><dd>${crewLevelLabel(person.id)}</dd></div>
              <div><dt>${ui.characterArchive.affinityLabel}</dt><dd>${ui.affinity(progression.affinity[person.id])}</dd></div>
              <div><dt>${ui.characterArchive.boardLabel}</dt><dd>${escapeHtml(board)}</dd></div>
              <div><dt>${ui.characterArchive.traitsLabel}</dt><dd>${escapeHtml(traits)}</dd></div>
            </dl>
            <button class="character-profile__posts-button" type="button" data-action="view-character-posts">${ui.characterArchive.viewPosts(posts.length)}</button>
          </div>
        ` : `
          <p class="character-archive__lead">${ui.characterArchive.lead}</p>
          <div class="character-archive__posts">
          ${posts.map((post, postIndex) => {
            const threadKey = `${person.id}:${postIndex}`;
            const sessionComments = archiveSessionComments[threadKey] ?? [];
            const safePostBody = escapeHtml(post.body);
            // Static localized copy is escaped before interpolation; no user-controlled HTML reaches the template.
            const postBodyMarkup = `<p>${safePostBody}</p>`; // nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format
            return `
            <article class="archive-post ${post.isHistory ? "is-history" : ""}">
              <div><span>${escapeHtml(post.board)}</span>${post.isHistory ? `<b>${ui.characterArchive.historyTag}</b>` : ""}</div>
              <small>${ui.characterArchive.anonymous} · ${escapeHtml(post.time)}</small>
              <h3>${escapeHtml(post.title)}</h3>
              ${postBodyMarkup}
              ${renderArchiveMedia(post.media)}
              <footer>${escapeHtml(post.meta)}</footer>
              <section class="archive-comments" aria-label="${ui.characterArchive.comments}">
                <strong>${ui.characterArchive.comments}</strong>
                ${[...post.comments, ...sessionComments].map((comment) => `
                  <p class="archive-comment ${comment.isAuthor ? "is-author" : ""}">
                    <b>${escapeHtml(comment.author)}</b><span>${escapeHtml(comment.text)}</span><small>${escapeHtml(comment.time ?? ui.characterArchive.now)}</small>
                  </p>
                `).join("")}
                ${archivePendingReplies[threadKey] ? `<p class="archive-comment is-author is-typing"><b>${ui.characterArchive.author}</b><span>${ui.characterArchive.replyLoading}</span><small>${ui.characterArchive.now}</small></p>` : ""}
                <form class="archive-comment-form" data-character-id="${person.id}" data-post-index="${postIndex}">
                  <label class="visually-hidden" for="archive-comment-${person.id}-${postIndex}">${ui.characterArchive.commentPlaceholder}</label>
                  <input id="archive-comment-${person.id}-${postIndex}" name="comment" maxlength="120" placeholder="${ui.characterArchive.commentPlaceholder}" ${archivePendingReplies[threadKey] ? "disabled" : ""} required />
                  <button type="submit" ${archivePendingReplies[threadKey] ? "disabled" : ""}>${ui.characterArchive.commentSend}</button>
                </form>
                <small class="archive-comments__privacy">${ui.characterArchive.sessionOnly}</small>
              </section>
            </article>
          `;}).join("")}
          </div>
        `}
      </section>
    </div>
  `;
}

function closeCharacterArchive() {
  const returnFocusId = archiveReturnFocusId;
  openArchiveCharacterId = null;
  openArchiveView = "profile";
  archiveReturnFocusId = null;
  render();
  if (returnFocusId) document.getElementById(returnFocusId)?.focus();
}

function roomStatusLabel() {
  const status = chatMode === "live" ? ui.chatModeLive : chatNotice ? ui.chatModeMock : ui.roomStatus;
  return `${status} · ${ui.difficulty.short[state.difficultyMode ?? "normal"]}`;
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
        <div class="chat-context__facts" aria-label="${ui.publicFacts}">
          ${crew.map((person) => factCard(person)).join("")}
        </div>
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
        <picture>
          <source media="(prefers-reduced-motion: reduce)" srcset="./assets/images/mafia-astronaut-v2.png" />
          <img src="./assets/images/mafia-astronaut-v2.gif" alt="" />
        </picture>
      </div>
      <div class="welcome-copy">
        <h1 tabindex="-1">${ui.welcomeTitle}</h1>
        <p>${ui.welcomeLead}</p>
      </div>
      <button class="welcome-start" type="button" data-action="get-started">${ui.welcomeStart}</button>
    </section>
  `;
}

function renderAuthGate() {
  return `<mars-auth-gate initial-view="${escapeHtml(authInitialView)}"></mars-auth-gate>`;
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
  const latestMessage = accountController.latestChat(person.id);
  const preview = latestMessage?.body ?? ui.homeHistoryPreview[person.personality];
  return `
    <div class="home-history-row ${index === 1 ? "is-featured" : ""}">
      ${characterProfileButton(person, "small", `home-${person.id}`)}
      <button class="home-history-row__chat" type="button" data-action="choose-friend" data-id="${person.id}" aria-label="${ui.friendChatWith(person.name)}">
        <span><strong>${person.name} <small class="level-badge">${crewLevelLabel(person.id)}</small></strong><small>${escapeHtml(preview)}</small></span>
        <time>${ui.homeHistoryTime[index]}</time>
        <span aria-hidden="true">›</span>
      </button>
    </div>
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

function renderDifficultyChoice() {
  const selected = progression.difficultyMode;
  return `
    <section class="difficulty-choice" aria-label="${ui.difficulty.title}">
      <div><span>${ui.difficulty.eyebrow}</span><strong>${ui.difficulty.title}</strong></div>
      <div class="difficulty-choice__buttons">
        ${["normal", "hard"].map((mode) => `
          <button class="${selected === mode ? "is-selected" : ""}" type="button" data-action="set-difficulty" data-id="${mode}" aria-pressed="${selected === mode}">
            <strong>${ui.difficulty.names[mode]}</strong><small>${ui.difficulty.descriptions[mode]}</small>
          </button>
        `).join("")}
      </div>
      <small>${ui.difficulty.current(ui.difficulty.names[selected])}</small>
    </section>
  `;
}

function renderVoiceConsent() {
  const voiceState = voiceController?.snapshot().state ?? "idle";
  return `
    <section class="voice-consent-screen">
      <button class="plain-back" type="button" data-action="cancel-voice" aria-label="${ui.homeBack}">‹</button>
      <div class="voice-consent-copy">
        <span>${ui.voice.consentEyebrow}</span>
        <h1 tabindex="-1">${ui.voice.consentTitle}</h1>
        <p>${ui.voice.consentLead}</p>
      </div>
      <div class="voice-consent-avatar" aria-hidden="true">${roomAvatarStack()}</div>
      <ul class="voice-disclosures">
        ${ui.voice.disclosures.map((item) => `<li>${item}</li>`).join("")}
      </ul>
      ${voiceFallbackNotice ? `<p class="voice-consent-error" role="alert">${escapeHtml(voiceFallbackNotice)}</p>` : ""}
      <div class="voice-consent-actions">
        <button class="primary-button" type="button" data-action="confirm-voice" ${voiceConsentBusy ? "disabled" : ""}>
          ${voiceConsentBusy ? ui.voice.status[voiceState] : ui.voice.consentAction}
        </button>
        <button class="secondary-button" type="button" data-action="start-text">${ui.voice.textFallback}</button>
      </div>
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

      <mars-account-control></mars-account-control>

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
        <button class="home-action is-multiplayer" type="button" data-action="open-multiplayer">
          <span>${ui.homeMultiplayerEyebrow}</span><strong>${ui.homeMultiplayerTitle}</strong><small>${ui.homeMultiplayerLead}</small><b aria-hidden="true">↗</b>
        </button>
      </div>

      <section class="home-history" aria-label="${ui.homeHistory}">
        <div class="home-history__heading"><h2>${ui.homeHistory}</h2><button type="button" data-action="open-friends">${ui.homeSeeAll}</button></div>
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
            ${characterProfileButton(person, "small", `tutorial-${person.id}`)}
            <div><strong>${person.name} <span class="level-badge">${crewLevelLabel(person.id)}</span></strong><small>${person.style}</small></div>
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

    ${renderDifficultyChoice()}

    <section class="game-mode-choice" aria-label="${ui.voice.modeTitle}">
      <span>${ui.voice.modeTitle}</span>
      <button class="game-mode-card is-text" data-action="start">
        <span aria-hidden="true">⌨</span><strong>${ui.voice.playText}</strong><small>${ui.voice.textModeDescription}</small>
      </button>
      <button class="game-mode-card is-voice" data-action="start-voice">
        <span aria-hidden="true">●</span><strong>${ui.voice.playVoice}</strong><small>${ui.voice.voiceModeDescription}</small>
      </button>
    </section>
    <div class="intro-actions">
      <button class="secondary-button" data-action="open-friends">${ui.friendChatOpen}</button>
    </div>

    <ol class="rules" aria-label="${ui.rulesAria}">
      ${ui.rules.map((rule, index) => `<li><span>${index + 1}</span><p>${rule}</p></li>`).join("")}
    </ol>
  `;
}

function renderVoiceCall() {
  const voice = voiceController?.snapshot() ?? {
    state: "connecting",
    muted: false,
    paused: false,
    captionsEnabled: true,
    captionText: "",
    activeSpeakerId: null,
    activeSpeakerIds: [],
    activeEmotion: "neutral",
    lastSpeakerId: "mina",
  };
  const speakerId = voice.activeSpeakerId ?? voice.lastSpeakerId ?? "mina";
  const speaker = crewMember(speakerId);
  const speakingNames = (voice.activeSpeakerIds ?? []).map((id) => crewMember(id)?.name).filter(Boolean);
  const status = speakingNames.length > 1
    ? ui.voice.speakingTogether(speakingNames)
    : voice.activeSpeakerId
      ? ui.voice.speaking(speaker.name)
      : ui.voice.status[voice.state] ?? ui.voice.status.processing;
  const secondaryCrew = crew.filter((person) => person.id !== speakerId);
  const canPause = Boolean(voice.activeSpeakerId) || voice.paused;
  const canTalk = voice.connected && !voice.muted && !["connecting", "reconnecting", "processing"].includes(voice.state);
  return `
    <div class="voice-call-view" data-voice-state="${voice.state}">
      <header class="voice-call-header">
        <button type="button" data-action="voice-end" aria-label="${ui.voice.end}">‹</button>
        <div><strong>${ui.voice.callTitle}</strong><small>${ui.voice.callStage}</small></div>
        <button type="button" data-action="voice-toggle-captions" aria-pressed="${voice.captionsEnabled}" aria-label="${ui.voice.captionLabel}">CC</button>
      </header>

      <section class="voice-stage" aria-label="${status}">
        <div class="voice-secondary-avatars" aria-hidden="true">
          ${secondaryCrew.map((person) => `<span class="voice-secondary-avatar">${personAvatar(person, "normal")}</span>`).join("")}
        </div>
        <div class="voice-active-avatar" data-speaker="${speakerId}" data-emotion="${voice.activeEmotion ?? "neutral"}">
          ${voiceAvatar(speaker, voice.activeEmotion)}
          <span>${speaker.name}</span>
        </div>
        <div class="voice-wave" data-voice-wave aria-hidden="true">
          ${Array.from({ length: 7 }, (_, index) => `<i style="--bar:${index}"></i>`).join("")}
        </div>
        <strong class="voice-status" role="status">${status}</strong>
        <div class="voice-caption" aria-label="${ui.voice.captionLabel}">
          ${voice.captionsEnabled ? escapeHtml(voice.captionText || ui.voice.waitingCaption) : ui.voice.captionOff}
        </div>
      </section>

      <details class="voice-call-context">
        <summary>${ui.publicFacts}</summary>
        <div>${crew.map((person) => `<p><strong>${person.name}</strong><span>${state.facts[person.id].text}</span></p>`).join("")}</div>
      </details>

      ${voiceFallbackNotice ? `<p class="voice-call-notice">${escapeHtml(voiceFallbackNotice)}</p>` : ""}
      ${voice.state === "reconnecting" || voiceFallbackNotice ? `<button class="voice-reconnect" type="button" data-action="voice-reconnect">${ui.voice.reconnect}</button>` : ""}

      <form class="voice-text-composer chat-composer" data-chat-stage="${voiceStageForPhase()}" data-input-mode="voice-text">
        <span>${ui.voice.textInputHint}</span>
        <div class="chat-composer__row">
          <label class="visually-hidden" for="player-message">${ui.chatInputLabel}</label>
          <textarea id="player-message" name="message" maxlength="${MAX_CHAT_LENGTH}" rows="1" placeholder="${ui.voice.textInputPlaceholder}" ${chatPending ? "disabled" : ""} required></textarea>
          <button class="composer-send" type="submit" aria-label="${ui.chatSend}" ${chatPending ? "disabled" : ""}><span aria-hidden="true">↑</span></button>
        </div>
      </form>

      <button class="voice-talk ${voice.manualTurnActive ? "is-active" : ""}" type="button" data-action="voice-toggle-talk" aria-pressed="${voice.manualTurnActive}" ${canTalk ? "" : "disabled"}>
        <strong>${voice.manualTurnActive ? ui.voice.talkStop : ui.voice.talkStart}</strong>
        <small>${voice.manualTurnActive ? ui.voice.talkStopHint : ui.voice.talkStartHint}</small>
      </button>

      <div class="voice-call-controls">
        <button class="voice-control" type="button" data-action="voice-toggle-mute" aria-pressed="${voice.muted}" aria-label="${voice.muted ? ui.voice.unmute : ui.voice.mute}">
          <span aria-hidden="true">${voice.muted ? "⌁" : "●"}</span><small>${voice.muted ? ui.voice.unmute : ui.voice.mute}</small>
        </button>
        <button class="voice-end" type="button" data-action="voice-end" aria-label="${ui.voice.end}"><span aria-hidden="true">⌕</span></button>
        <button class="voice-control" type="button" data-action="voice-toggle-pause" aria-pressed="${voice.paused}" aria-label="${voice.paused ? ui.voice.resume : ui.voice.pause}" ${canPause ? "" : "disabled"}>
          <span aria-hidden="true">${voice.paused ? "▶" : "Ⅱ"}</span><small>${voice.paused ? ui.voice.resume : ui.voice.pause}</small>
        </button>
      </div>
      <button class="voice-text-fallback" type="button" data-action="voice-fallback">${ui.voice.textFallback}</button>
    </div>
  `;
}

function renderDiscussion() {
  return playMode === "voice" ? renderVoiceCall() : renderChat();
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
            <div class="friend-row" role="listitem">
              ${characterProfileButton(person, "normal", `friend-list-${person.id}`)}
              <button class="friend-row__chat" type="button" data-action="choose-friend" data-id="${person.id}" aria-label="${ui.friendChatWith(person.name)}">
                <span><strong>${person.name} <small class="level-badge">${crewLevelLabel(person.id)}</small></strong><small>${person.style} · ${ui.affinity(progression.affinity[person.id])}</small></span>
                <span class="online-dot" aria-label="${ui.online}"></span>
                <span class="friend-row__arrow" aria-hidden="true">›</span>
              </button>
            </div>
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
  friendChatLoadingOlder = false;
  questOfferCharacterId = null;
  friendConversationIndex += 1;
  chatLog = [{ speakerId: personId, text: ui.friendGreetings[person.personality][variant] }];
  chatPending = false;
  chatMode = "ready";
  chatNotice = null;
  typingSpeakerId = null;
  shownContextMedia.clear();
  state = { ...state, phase: "friend-chat" };
  void accountController.loadChat(personId).then((messages) => {
    if (selectedFriendId !== personId || state.phase !== "friend-chat" || !messages.length) return;
    chatLog = messages.map((message) => ({
      speakerId: message.sender === "player" ? "player" : personId,
      text: message.body,
      clientMessageId: message.id,
    }));
    render();
  });
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
      ${renderHabitatMap(true)}
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
  if (state.difficultyMode === "hard") return "";

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

function chatMessage(item, index) {
  if (item.speakerId === "media" && item.media) {
    return renderContextMedia(item.media);
  }
  if (item.speakerId === "system") {
    return `<p class="chat-event">${escapeHtml(item.text)}</p>`;
  }
  const person = item.speakerId === "player" ? null : crewMember(item.speakerId);
  const avatar = !person
    ? profileAvatar("small")
    : state.phase === "friend-chat"
      ? characterProfileButton(person, "small", `friend-message-${person.id}-${index}`)
      : personAvatar(person, "small");
  return `
    <article class="chat-message ${item.speakerId === "player" ? "is-player" : ""}">
      ${avatar}
      <div>
        <strong>${item.speakerId === "player" ? escapeHtml(playerProfile.name || ui.chatYou) : escapeHtml(person?.name ?? item.speakerId)}<small>${ui.chatNow}</small></strong>
        ${item.stickerId
          ? `<img class="chat-sticker" src="${FRIEND_STICKERS.find((sticker) => sticker.id === item.stickerId)?.src ?? ""}" alt="${escapeHtml(item.stickerLabel ?? ui.friendSticker)}" />`
          : `<p>${escapeHtml(item.text)}</p>`}
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
  const hardDefenseNumber = {
    "hard-defense-1": 1,
    "hard-defense-2": 2,
    "hard-final": 3,
  }[state.phase] ?? 0;
  const stage = isAccusation
    ? "accusation"
    : state.phase === "hard-final"
      ? "hard-final"
      : hardDefenseNumber
        ? "hard-response"
        : "response";
  const step = isAccusation ? 3 : 4;
  const stageLabel = isAccusation ? ui.stages.lie : ui.stages.challenge;
  const title = isAccusation
    ? ui.chatAccuseTitle
    : hardDefenseNumber
      ? ui.hardReplyTitles[hardDefenseNumber - 1]
      : ui.chatReplyTitle;
  const turnLabel = hardDefenseNumber ? ui.hardTurn(hardDefenseNumber, 3) : `${ui.yourTurn} · ${ui.freeChat}`;
  return `
    <div class="game-room-view is-chat">
      ${gameRoomBar(step, stageLabel)}
      <div class="chat-turn-banner">
        <span>${turnLabel}</span>
        <h1 tabindex="-1">${title}</h1>
        ${hardDefenseNumber ? `<p>${ui.hardReplyLeads[hardDefenseNumber - 1]}</p>` : ""}
      </div>
      ${chatContext()}
      ${renderHabitatMap()}

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
      ${characterProfileButton(person, "small", `friend-header-${person.id}`)}
      <div class="game-room-bar__copy">
        <strong>${person.name}</strong>
        <small>${chatPending ? ui.chatTypingPerson(person.name) : friendStatusLabel()} · ${crewLevelLabel(person.id)} · ${ui.affinity(progression.affinity[person.id])}</small>
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
          ${accountController.hasOlderChat(person.id) ? `<button class="chat-history-more" type="button" data-action="load-older-chat" ${friendChatLoadingOlder ? "disabled" : ""}>${friendChatLoadingOlder ? ui.friendChatOlderLoading : ui.friendChatOlder}</button>` : ""}
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
                <span class="emoji-picker__divider">${ui.friendStickerPicker}</span>
                ${FRIEND_STICKERS.map((sticker) => {
                  const label = `${crewMember(sticker.ownerId).name} · ${ui.characterArchive.stickerText[sticker.ownerId][sticker.labelIndex]}`;
                  return `
                    <button class="sticker-option" type="button" data-action="send-friend-sticker" data-sticker-id="${sticker.id}" aria-label="${ui.friendStickerSend(label)}">
                      <img src="${sticker.src}" alt="" loading="lazy" />
                    </button>
                  `;
                }).join("")}
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

function renderLevelGrowth() {
  if (!lastLevelGrowth) return "";
  return `
    <section class="level-growth" aria-label="${ui.level.growthTitle}">
      <div><span aria-hidden="true">↑</span><strong>${ui.level.growthTitle}</strong><small>${ui.level.growthDetail}</small></div>
      <ul>${crew.map((person) => `<li><span>${person.name}</span><strong>${ui.level.label(lastLevelGrowth.current[person.id])}</strong></li>`).join("")}</ul>
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

    ${renderLevelGrowth()}

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

    <mars-account-save></mars-account-save>

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
  shownContextMedia.clear();
  chatLog = [
    { speakerId: "system", text: state.difficultyMode === "hard" ? ui.chatHardAccuseLead : ui.chatAccuseLead },
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
  if (playMode === "voice") {
    const controller = voiceController ?? createRoundVoiceController();
    void controller.connect().then(async (connected) => {
      if (!connected) {
        voiceFallbackNotice = ui.voice.fallbackNotice;
        render();
        return;
      }
      voiceFallbackNotice = null;
      await speakVoiceOpening(controller);
      render();
    });
  }
}

async function requestCharacterChat(stage, message, friendId = null, options = {}) {
  const payload = buildChatPayload({
    locale,
    stage,
    message,
    state,
    crew,
    incident,
    transcript: chatLog,
    friendId,
    inputMode: options.inputMode,
    utteranceId: options.utteranceId,
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

function fallbackHardReplies(nextState, interpretation) {
  const fact = nextState.facts[interpretation.targetId];
  const changed = interpretation.targetId !== nextState.accusedId;
  const conflict = fact.impacts[interpretation.claimId] < 0;
  const round = Math.max(1, nextState.hardTurns.length - 1);
  return crew.map((member) => ({
    speakerId: member.id,
    text: ui.hardPracticeChallenge(
      member.personality,
      displayName(interpretation.targetId),
      fact.text,
      changed,
      conflict,
      round,
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
  const ordered = orderedReplies(replies, stage).map((reply) => ({
    ...reply,
    emotion: voiceEmotionForReply(reply, stage),
  }));
  if (playMode === "voice" && voiceController && ordered.length > 1) {
    typingSpeakerId = ordered[0].speakerId;
    render();
    try {
      const staggerMs = stage.startsWith("hard") ? 650 : 1_050;
      await voiceController.speakGroup(ordered, { staggerMs });
      ordered.forEach(({ emotion, ...reply }) => chatLog.push(reply));
    } catch {
      voiceController?.end({ fallback: true });
      voiceFallbackNotice = ui.voice.fallbackNotice;
      chatNotice = ui.voice.fallbackNotice;
    }
    typingSpeakerId = null;
    render();
    return;
  }
  for (const reply of ordered) {
    typingSpeakerId = reply.speakerId;
    render();
    if (playMode === "voice" && voiceController) {
      try {
        const spoken = await voiceController.speak(reply.speakerId, reply.text, { emotion: reply.emotion });
        if (!spoken.completed) {
          typingSpeakerId = null;
          render();
          break;
        }
      } catch {
        voiceController?.end({ fallback: true });
        voiceFallbackNotice = ui.voice.fallbackNotice;
        chatNotice = ui.voice.fallbackNotice;
        render();
        break;
      }
    } else {
      await wait(typingDuration(reply));
    }
    typingSpeakerId = null;
    const { emotion, ...visibleReply } = reply;
    chatLog.push(visibleReply);
    render();
    await wait(140);
  }
}

async function handleChatSubmit(stage, rawMessage, options = {}) {
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
  appendContextMedia("game", message);
  chatPending = true;
  chatNotice = null;
  render();

  let remote = null;
  try {
    remote = await requestCharacterChat(stage, message, null, options);
    chatMode = "live";
  } catch {
    chatMode = "mock";
    chatNotice = ui.chatFallback;
  }

  if (options.inputMode === "voice" && remote?.clarification) {
    const speakerId = state.challengerId ?? crew[(state.caseIndex + chatLog.length) % crew.length].id;
    const clarification = remote.clarification === "target"
      ? ui.voice.clarificationTarget
      : ui.voice.clarificationClaim;
    const reply = { speakerId, text: clarification };
    typingSpeakerId = speakerId;
    render();
    try {
      await voiceController?.speak(speakerId, clarification);
    } catch {
      voiceController?.end({ fallback: true });
      voiceFallbackNotice = ui.voice.fallbackNotice;
      chatNotice = ui.voice.fallbackNotice;
    }
    typingSpeakerId = null;
    chatLog.push(reply);
    chatPending = false;
    render();
    return;
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
    const nextState = state.difficultyMode === "hard"
      ? applyHardLie(state, interpretation.accusedId, interpretation.claimId)
      : applyLie(state, interpretation.accusedId, interpretation.claimId);
    const interpretedClaim = getClaimOptions(interpretation.accusedId, locale)
      .find((option) => option.id === interpretation.claimId);
    chatLog.push({
      speakerId: "system",
      text: ui.chatInterpretedLie(
        displayName(interpretation.accusedId),
        interpretedClaim?.short ?? interpretation.claimId,
      ),
    });
    const replies = safeLiveReplies(remote?.replies ?? []);
    await revealReplies(replies.length === crew.length ? replies : fallbackAccusationReplies(nextState), stage);
    chatLog.push({
      speakerId: "system",
      text: state.difficultyMode === "hard" ? ui.hardReplyLeads[0] : ui.chatReplyLead,
    });
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
    if (stage === "hard-response" || stage === "hard-final") {
      const nextState = applyHardDefense(state, interpretation);
      const claim = getClaimOptions(interpretation.targetId, locale)
        .find((option) => option.id === interpretation.claimId);
      const response = getResponseOptions(nextState)
        .find((option) => option.id === interpretation.responseId);
      chatLog.push({
        speakerId: "system",
        text: ui.hardInterpreted(
          displayName(interpretation.targetId),
          claim?.short ?? interpretation.claimId,
          response?.label.replaceAll("“", "").replaceAll("”", "") ?? interpretation.responseId,
        ),
      });
      if (stage === "hard-final") {
        chatLog.push({ speakerId: "system", text: ui.hardFinalSubmitted });
      } else {
        const replies = safeLiveReplies(remote?.replies ?? []);
        await revealReplies(replies.length === crew.length ? replies : fallbackHardReplies(nextState, interpretation), stage);
      }
      state = nextState;
    } else {
      const nextState = applyResponse(state, interpretation.responseId);
      chatLog.push({ speakerId: "system", text: ui.chatInterpretedResponse(nextState.responseText) });
      const replies = safeLiveReplies(remote?.replies ?? []);
      await revealReplies(replies.length === crew.length ? replies : fallbackResponseReplies(nextState), stage);
      state = nextState;
    }
  }

  typingSpeakerId = null;
  chatPending = false;
  if (playMode === "voice" && state.phase === "response") {
    voiceController?.setMuted(true);
    voiceController?.end();
    voiceController = null;
  }
  render();
}

async function handleFriendSubmit(rawMessage) {
  if (chatPending || !selectedFriendId) return;
  const message = String(rawMessage).trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) return;

  const playerMessage = {
    speakerId: "player",
    text: message,
    clientMessageId: createMutationId(),
  };
  chatLog.push(playerMessage);
  void accountController.recordChat(selectedFriendId, [{
    id: playerMessage.clientMessageId,
    sender: "player",
    body: message,
    createdAt: new Date().toISOString(),
    modelMode: chatMode,
  }]);
  appendContextMedia("friend", message, selectedFriendId);
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

  const visibleReplies = (replies.length === 1 ? replies : fallbackFriendReply(message)).map((reply) => ({
    ...reply,
    clientMessageId: createMutationId(),
  }));
  await revealReplies(visibleReplies, "friend");
  void accountController.recordChat(selectedFriendId, visibleReplies.map((reply) => ({
    id: reply.clientMessageId,
    sender: "character",
    body: reply.text,
    createdAt: new Date().toISOString(),
    modelMode: chatMode,
  })));
  typingSpeakerId = null;
  chatPending = false;
  if (!progression.activeQuest) questOfferCharacterId = selectedFriendId;
  render();
}

let renderedPhase = null;

function render() {
  const views = {
    auth: renderAuthGate,
    welcome: renderWelcome,
    profile: renderProfileSetup,
    home: renderHome,
    intro: renderIntro,
    "voice-consent": renderVoiceConsent,
    "friend-select": renderFriendSelect,
    "friend-chat": renderFriendChat,
    evidence: renderEvidence,
    meeting: renderMeeting,
    lie: renderDiscussion,
    challenge: renderDiscussion,
    "hard-defense-1": renderDiscussion,
    "hard-defense-2": renderDiscussion,
    "hard-final": renderDiscussion,
    response: renderResponse,
    result: renderResult,
    debrief: renderDebrief,
  };
  const phaseChanged = renderedPhase !== state.phase;
  document.body.dataset.phase = state.phase;
  document.body.dataset.playMode = playMode;
  app.dataset.phase = state.phase;
  app.innerHTML = `${views[state.phase]()}${renderCharacterArchive()}`;
  if (phaseChanged) {
    window.scrollTo(0, 0);
    app.querySelector("h1")?.focus({ preventScroll: true });
  }
  if (playMode !== "voice" && ["lie", "challenge", "hard-defense-1", "hard-defense-2", "hard-final", "response", "friend-chat", "debrief"].includes(state.phase)) {
    app.querySelector(".chat-transcript")?.scrollTo(0, 10_000);
  }
  soundController?.setScene(["auth", "welcome", "profile", "home", "intro", "friend-select", "friend-chat", "debrief"].includes(state.phase) ? "lobby" : "game");
  soundController?.refresh();
  renderedPhase = state.phase;
}

function resetGame() {
  state = startGame(createGame({
    caseIndex: nextCaseIndex(state.caseIndex),
    subquestId: nextSubquestId(state.subquestId),
    locale,
    crewLevels: progression.crewLevels,
    difficultyMode: progression.difficultyMode,
    roundId: newRoundId(),
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
  lastLevelGrowth = null;
  detectiveInspection = null;
  shownContextMedia.clear();
  if (playMode === "voice") {
    const controller = createRoundVoiceController();
    void controller.prepare().then((ready) => {
      if (!ready) {
        voiceFallbackNotice = ui.voice.fallbackNotice;
        render();
      }
    });
  }
  render();
}

app.addEventListener("click", (event) => {
  const archiveAvatar = event.target.closest("[data-character-profile]");
  if (archiveAvatar) {
    openArchiveCharacterId = archiveAvatar.dataset.characterProfile;
    openArchiveView = "profile";
    archiveReturnFocusId = archiveAvatar.id || null;
    render();
    app.querySelector('.character-archive [data-action="close-character-archive"]')?.focus();
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "close-character-archive") {
    closeCharacterArchive();
    return;
  }
  if (action === "view-character-posts") {
    openArchiveView = "posts";
    render();
    app.querySelector('[data-action="back-character-profile"]')?.focus();
    return;
  }
  if (action === "back-character-profile") {
    openArchiveView = "profile";
    render();
    app.querySelector('[data-action="view-character-posts"]')?.focus();
    return;
  }
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
  if (action === "send-friend-sticker") {
    const sticker = FRIEND_STICKERS.find((candidate) => candidate.id === button.dataset.stickerId);
    if (!sticker || chatPending || state.phase !== "friend-chat") return;
    const label = `${crewMember(sticker.ownerId).name} · ${ui.characterArchive.stickerText[sticker.ownerId][sticker.labelIndex]}`;
    const clientMessageId = createMutationId();
    chatLog.push({ speakerId: "player", stickerId: sticker.id, stickerLabel: label, clientMessageId });
    void accountController.recordChat(selectedFriendId, [{
      id: clientMessageId,
      sender: "player",
      body: `[${ui.friendStickerPicker}] ${label}`,
      createdAt: new Date().toISOString(),
      modelMode: "mock",
    }]);
    button.closest("details")?.removeAttribute("open");
    render();
    return;
  }
  if (action === "load-older-chat") {
    if (friendChatLoadingOlder || !selectedFriendId) return;
    const personId = selectedFriendId;
    friendChatLoadingOlder = true;
    render();
    void accountController.loadOlderChat(personId).then((messages) => {
      if (selectedFriendId !== personId || state.phase !== "friend-chat") return;
      chatLog = messages.map((message) => ({
        speakerId: message.sender === "player" ? "player" : personId,
        text: message.body,
        clientMessageId: message.id,
      }));
    }).catch(() => {
      chatNotice = ui.friendChatFallback;
    }).finally(() => {
      friendChatLoadingOlder = false;
      if (state.phase === "friend-chat") render();
    });
    return;
  }
  if (action === "get-started") {
    void soundController?.start?.();
    state = { ...state, phase: playerProfile.name ? "intro" : "profile" };
  }
  if (action === "back-welcome") {
    voiceController?.end();
    voiceController = null;
    playMode = "text";
    state = { ...state, phase: "welcome" };
  }
  if (action === "edit-profile") state = { ...state, phase: "profile" };
  if (action === "go-home") {
    voiceController?.end();
    voiceController = null;
    state = { ...state, phase: "home" };
  }
  if (action === "open-tutorial") state = { ...state, phase: "intro" };
  if (action === "start") beginTextGame();
  if (action === "start-voice") {
    playMode = "voice";
    voiceFallbackNotice = null;
    state = { ...state, phase: "voice-consent" };
  }
  if (action === "confirm-voice") {
    void beginVoiceGame();
    return;
  }
  if (action === "cancel-voice") {
    voiceController?.end();
    voiceController = null;
    playMode = "text";
    voiceConsentBusy = false;
    state = { ...state, phase: "intro" };
  }
  if (action === "start-text") beginTextGame();
  if (action === "open-friends") state = { ...state, phase: "friend-select" };
  if (action === "open-multiplayer") window.location.assign(`./friend.html?lang=${locale}`);
  if (action === "back-home") state = { ...state, phase: "home" };
  if (action === "back-friends") {
    selectedFriendId = null;
    friendChatLoadingOlder = false;
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
  if (action === "set-difficulty") {
    saveProgression(setDifficultyMode(progression, button.dataset.id));
    state = {
      ...state,
      crewLevels: { ...progression.crewLevels },
      difficultyMode: progression.difficultyMode,
    };
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
  if (action === "voice-toggle-mute") voiceController?.setMuted();
  if (action === "voice-toggle-talk") voiceController?.toggleTalking();
  if (action === "voice-toggle-pause") void voiceController?.setPaused();
  if (action === "voice-toggle-captions") voiceController?.setCaptions();
  if (action === "voice-reconnect") return void reconnectVoiceGame();
  if (action === "voice-fallback") return switchVoiceGameToText();
  if (action === "voice-end") return endVoiceGame();
  if (action === "draft-message") {
    const input = app.querySelector("#player-message");
    if (input) {
      input.value = decodeURIComponent(button.dataset.message ?? "");
      input.focus();
    }
    return;
  }
  if (action === "vote") {
    voiceController?.end();
    voiceController = null;
    state = resolveVote(state);
    const levelAward = awardCrewLevels(progression, state);
    const settlement = settlePersonalQuest(levelAward.progress, state, { date: currentDateKey() });
    saveProgression(settlement.progress);
    lastLevelGrowth = levelAward.growth;
    lastPersonalQuestResult = settlement.result;
    void accountController.recordMatch(state, versionLabel);
  }
  if (action === "debrief") return openDebrief();
  if (action === "restart") {
    saveProgression(dismissCompletedQuest(progression));
    return resetGame();
  }

  render();
});

app.addEventListener("submit", (event) => {
  const archiveForm = event.target.closest(".archive-comment-form");
  if (archiveForm) {
    event.preventDefault();
    const characterId = archiveForm.dataset.characterId;
    const postIndex = Number(archiveForm.dataset.postIndex);
    const comment = String(new FormData(archiveForm).get("comment") ?? "").trim().slice(0, 120);
    const person = crewMember(characterId);
    if (!comment || !person) return;
    const threadKey = `${characterId}:${postIndex}`;
    const archiveScrollTop = app.querySelector(".character-archive__sheet")?.scrollTop ?? 0;
    archiveSessionComments[threadKey] = [
      ...(archiveSessionComments[threadKey] ?? []),
      { author: ui.characterArchive.youAnonymous, text: comment, time: ui.characterArchive.now },
    ];
    archivePendingReplies[threadKey] = true;
    render();
    window.requestAnimationFrame(() => {
      const sheet = app.querySelector(".character-archive__sheet");
      if (sheet) sheet.scrollTop = archiveScrollTop;
    });
    const normalizedComment = comment.toLocaleLowerCase(locale);
    const mentionsCharacter = normalizedComment.includes(person.name.toLocaleLowerCase(locale))
      || normalizedComment.includes(person.id);
    const replyOptions = ui.characterArchive.denialReplies[characterId];
    const reply = mentionsCharacter
      ? replyOptions[postIndex % replyOptions.length]
      : archiveReplyForComment(person, comment, postIndex);
    window.setTimeout(() => {
      archiveSessionComments[threadKey] = [
        ...(archiveSessionComments[threadKey] ?? []),
        { author: ui.characterArchive.author, text: reply, time: ui.characterArchive.now, isAuthor: true },
      ];
      delete archivePendingReplies[threadKey];
      if (openArchiveCharacterId === characterId && openArchiveView === "posts") {
        const currentScrollTop = app.querySelector(".character-archive__sheet")?.scrollTop ?? archiveScrollTop;
        render();
        window.requestAnimationFrame(() => {
          const sheet = app.querySelector(".character-archive__sheet");
          if (sheet) sheet.scrollTop = currentScrollTop;
          app.querySelector(`#archive-comment-${characterId}-${postIndex}`)?.focus({ preventScroll: true });
        });
      }
    }, reducedMotion.matches ? 0 : 900 + ((postIndex % 3) * 180));
    return;
  }
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
  else handleChatSubmit(form.dataset.chatStage, message, {
    inputMode: form.dataset.inputMode === "voice-text" ? "text" : undefined,
  });
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
  if (event.key === "Escape" && openArchiveCharacterId) {
    closeCharacterArchive();
    return;
  }
  const input = event.target.closest("#player-message");
  if (!input || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  input.closest("form")?.requestSubmit();
});

window.addEventListener("mars:account-hydrated", () => {
  playerProfile = loadPlayerProfile();
  progression = loadProgression();
  try {
    const stored = JSON.parse(window.localStorage.getItem(ARCHIVE_VISIT_STORAGE_KEY) ?? "null");
    archiveVisitDates = Array.isArray(stored?.dates) ? stored.dates : archiveVisitDates;
  } catch {
    // Keep the in-memory archive when storage is unavailable.
  }
  state = {
    ...state,
    crewLevels: { ...progression.crewLevels },
    difficultyMode: progression.difficultyMode,
  };
  render();
});

window.addEventListener("mars:auth-entered", () => {
  authInitialView = "choice";
  state = { ...state, phase: "welcome" };
  render();
});

window.addEventListener("mars:auth-required", (event) => {
  voiceController?.end();
  voiceController = null;
  playMode = "text";
  authInitialView = event.detail?.view ?? "choice";
  state = { ...state, phase: "auth" };
  render();
});

window.addEventListener("pagehide", () => voiceController?.end(), { once: true });

void accountController.initialize();
render();
