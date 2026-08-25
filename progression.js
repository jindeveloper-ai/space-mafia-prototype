export const PROGRESSION_STORAGE_KEY = "mars-net-progression-v1";
export const PROGRESSION_VERSION = 3;
export const PRIVATE_DETECTIVE_ID = "private-detective";
export const FRIEND_CALL_DAILY_SECONDS = 5 * 60;
export const INITIAL_CREW_LEVELS = Object.freeze({ mina: 2, juno: 4, noel: 3 });

const CREW_IDS = ["mina", "juno", "noel"];
const QUEST_BY_CHARACTER = {
  mina: "mina-shift",
  juno: "juno-counterexample",
  noel: "noel-consistency",
};
const QUEST_IDS = Object.values(QUEST_BY_CHARACTER);
const OUTCOMES = ["win", "lose", "draw"];
const DIFFICULTY_MODES = ["normal", "hard"];

function uniqueStrings(values, predicate = () => true, limit = 200) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && predicate(value)))].slice(0, limit);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function safeAffinity(raw) {
  return Object.fromEntries(CREW_IDS.map((id) => [
    id,
    Number.isFinite(raw?.[id]) ? Math.min(999, Math.max(0, Math.floor(raw[id]))) : 0,
  ]));
}

function safeCrewLevels(raw) {
  return Object.fromEntries(CREW_IDS.map((id) => [
    id,
    Number.isFinite(raw?.[id]) ? Math.min(50, Math.max(1, Math.floor(raw[id]))) : INITIAL_CREW_LEVELS[id],
  ]));
}

function safeFriendCallUsage(raw) {
  return Object.fromEntries(CREW_IDS.map((id) => {
    const entry = raw?.[id];
    const date = isDateKey(entry?.date) ? entry.date : null;
    const seconds = Number.isFinite(entry?.seconds)
      ? Math.min(FRIEND_CALL_DAILY_SECONDS, Math.max(0, Math.floor(entry.seconds)))
      : 0;
    return [id, date ? { date, seconds } : null];
  }));
}

function safeFriendCallDates(raw) {
  return Object.fromEntries(CREW_IDS.map((id) => [
    id,
    uniqueStrings(raw?.[id], isDateKey, 30).sort(),
  ]));
}

function safeActiveQuest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const characterId = CREW_IDS.includes(raw.characterId) ? raw.characterId : null;
  const questId = QUEST_IDS.includes(raw.questId) ? raw.questId : null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 100) : "";
  if (!characterId || QUEST_BY_CHARACTER[characterId] !== questId || !id || !isDateKey(raw.acceptedDate)) return null;
  const status = raw.status === "completed" ? "completed" : "active";
  const completed = status === "completed" && raw.completed === true;
  const affinityDelta = status === "completed" && raw.affinityDelta === (completed ? 3 : 1)
    ? raw.affinityDelta
    : 0;
  return {
    id,
    questId,
    characterId,
    acceptedDate: raw.acceptedDate,
    status,
    completed,
    affinityDelta,
    gameCompletedDate: isDateKey(raw.gameCompletedDate) ? raw.gameCompletedDate : null,
    outcome: OUTCOMES.includes(raw.outcome) ? raw.outcome : null,
    selectedId: [...CREW_IDS, "player"].includes(raw.selectedId) ? raw.selectedId : null,
  };
}

function safeClues(raw) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const clue of raw) {
    if (!clue || typeof clue !== "object" || !/^private-detective-[1-5]$/.test(clue.id) || !isDateKey(clue.date)) continue;
    const characterId = clue.characterId === "group" || CREW_IDS.includes(clue.characterId) ? clue.characterId : "group";
    byId.set(clue.id, {
      id: clue.id,
      date: clue.date,
      characterId,
      outcome: OUTCOMES.includes(clue.outcome) ? clue.outcome : null,
      selectedId: [...CREW_IDS, "player"].includes(clue.selectedId) ? clue.selectedId : null,
    });
  }
  return [...byId.values()].sort((a, b) => Number(a.id.at(-1)) - Number(b.id.at(-1))).slice(0, 5);
}

export function createProgression(raw = null) {
  const source = raw && typeof raw === "object" && [1, 2, PROGRESSION_VERSION].includes(raw.version) ? raw : {};
  const clues = safeClues(source.clues);
  const unlockedJobs = uniqueStrings(source.unlockedJobs, (id) => id === PRIVATE_DETECTIVE_ID, 1);
  const friendCallUsage = safeFriendCallUsage(source.friendCallUsage);
  const storedFriendCallDates = safeFriendCallDates(source.friendCallDates);
  const friendCallDates = Object.fromEntries(CREW_IDS.map((id) => [
    id,
    uniqueStrings(
      [...storedFriendCallDates[id], friendCallUsage[id]?.date].filter(Boolean),
      isDateKey,
      30,
    ).sort(),
  ]));
  if (clues.length >= 5 && !unlockedJobs.includes(PRIVATE_DETECTIVE_ID)) unlockedJobs.push(PRIVATE_DETECTIVE_ID);
  return {
    version: PROGRESSION_VERSION,
    affinity: safeAffinity(source.affinity),
    crewLevels: safeCrewLevels(source.crewLevels),
    friendCallUsage,
    friendCallDates,
    difficultyMode: DIFFICULTY_MODES.includes(source.difficultyMode) ? source.difficultyMode : "normal",
    leveledRoundIds: uniqueStrings(source.leveledRoundIds, (id) => id.length <= 100, 100),
    activeQuest: safeActiveQuest(source.activeQuest),
    rewardedQuestIds: uniqueStrings(source.rewardedQuestIds, (id) => id.length <= 100),
    clueDates: uniqueStrings(source.clueDates, isDateKey, 5),
    clues,
    unlockedJobs,
    equippedJob: source.equippedJob === PRIVATE_DETECTIVE_ID && unlockedJobs.includes(PRIVATE_DETECTIVE_ID)
      ? PRIVATE_DETECTIVE_ID
      : null,
  };
}

export function friendCallSecondsRemaining(progress, characterId, date = localDateKey()) {
  const current = createProgression(progress);
  const entry = current.friendCallUsage[characterId];
  const used = entry?.date === date ? entry.seconds : 0;
  return Math.max(0, FRIEND_CALL_DAILY_SECONDS - used);
}

export function recordFriendCallUsage(progress, characterId, seconds, date = localDateKey()) {
  const current = createProgression(progress);
  if (!CREW_IDS.includes(characterId) || !isDateKey(date) || !Number.isFinite(seconds) || seconds <= 0) return current;
  const previous = current.friendCallUsage[characterId];
  if (previous?.date && previous.date > date) return current;
  const used = previous?.date === date ? previous.seconds : 0;
  return {
    ...current,
    friendCallUsage: {
      ...current.friendCallUsage,
      [characterId]: {
        date,
        seconds: Math.min(FRIEND_CALL_DAILY_SECONDS, used + Math.floor(seconds)),
      },
    },
    friendCallDates: {
      ...current.friendCallDates,
      [characterId]: uniqueStrings([...current.friendCallDates[characterId], date], isDateKey, 30).sort(),
    },
  };
}

export function awardCrewLevels(progress, gameState) {
  const current = createProgression(progress);
  const roundId = typeof gameState?.roundId === "string" ? gameState.roundId.slice(0, 100) : "";
  if (gameState?.phase !== "result" || gameState.outcome !== "win" || !roundId || current.leveledRoundIds.includes(roundId)) {
    return { progress: current, growth: null };
  }
  const previous = { ...current.crewLevels };
  const crewLevels = Object.fromEntries(CREW_IDS.map((id) => [id, Math.min(50, current.crewLevels[id] + 1)]));
  const changed = CREW_IDS.some((id) => crewLevels[id] !== previous[id]);
  return {
    progress: {
      ...current,
      crewLevels,
      leveledRoundIds: [...current.leveledRoundIds, roundId].slice(-100),
    },
    growth: changed ? { previous, current: crewLevels } : null,
  };
}

export function setDifficultyMode(progress, difficultyMode) {
  const current = createProgression(progress);
  return { ...current, difficultyMode: DIFFICULTY_MODES.includes(difficultyMode) ? difficultyMode : "normal" };
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getQuestForCharacter(characterId) {
  const questId = QUEST_BY_CHARACTER[characterId];
  return questId ? { questId, characterId } : null;
}

export function acceptPersonalQuest(progress, characterId, options = {}) {
  const current = createProgression(progress);
  if (current.activeQuest) return current;
  const quest = getQuestForCharacter(characterId);
  if (!quest) return current;
  const acceptedDate = options.date ?? localDateKey();
  const id = String(options.id ?? `${quest.questId}:${acceptedDate}:${Date.now()}`).slice(0, 100);
  return {
    ...current,
    activeQuest: {
      ...quest,
      id,
      acceptedDate,
      status: "active",
      completed: false,
      affinityDelta: 0,
      gameCompletedDate: null,
      outcome: null,
      selectedId: null,
    },
  };
}

export function evaluatePersonalQuest(quest, gameState) {
  if (!quest || !gameState || gameState.phase !== "result") return false;
  if (quest.characterId === "mina") {
    const before = gameState.leanHistory?.afterEvidence?.find((lean) => lean.voterId === "mina")?.candidateId;
    const after = gameState.votes?.find((vote) => vote.voterId === "mina")?.candidateId;
    return Boolean(before && after && before !== after);
  }
  if (quest.characterId === "juno") {
    const impact = gameState.facts?.[gameState.accusedId]?.impacts?.[gameState.claimId];
    return gameState.targetId !== gameState.accusedId && Number.isFinite(impact) && impact >= 20;
  }
  if (quest.characterId === "noel") {
    return Boolean(gameState.accusedId) && gameState.responseId !== "return-evidence";
  }
  return false;
}

function questResult(quest, awarded) {
  return {
    id: quest.id,
    questId: quest.questId,
    characterId: quest.characterId,
    success: quest.completed,
    affinityDelta: quest.affinityDelta,
    awarded,
  };
}

export function settlePersonalQuest(progress, gameState, options = {}) {
  const current = createProgression(progress);
  const quest = current.activeQuest;
  if (!quest || gameState?.phase !== "result") return { progress: current, result: null };
  if (quest.status === "completed") return { progress: current, result: questResult(quest, false) };

  const success = evaluatePersonalQuest(quest, gameState);
  const affinityDelta = success ? 3 : 1;
  const alreadyRewarded = current.rewardedQuestIds.includes(quest.id);
  const completedQuest = {
    ...quest,
    status: "completed",
    completed: success,
    affinityDelta,
    gameCompletedDate: options.date ?? localDateKey(),
    outcome: gameState.outcome,
    selectedId: gameState.selectedId,
  };
  const next = {
    ...current,
    affinity: alreadyRewarded
      ? current.affinity
      : { ...current.affinity, [quest.characterId]: current.affinity[quest.characterId] + affinityDelta },
    activeQuest: completedQuest,
    rewardedQuestIds: alreadyRewarded ? current.rewardedQuestIds : [...current.rewardedQuestIds, quest.id],
  };
  return { progress: next, result: questResult(completedQuest, !alreadyRewarded) };
}

export function markDebriefViewed(progress, options = {}) {
  const current = createProgression(progress);
  const quest = current.activeQuest;
  const date = options.date ?? localDateKey();
  const completedQuest = quest?.status === "completed" && quest.gameCompletedDate === date ? quest : null;
  const gameState = options.gameState;
  const completedRound = gameState?.phase === "result" && OUTCOMES.includes(gameState.outcome) ? gameState : null;
  const characterId = completedQuest?.characterId
    ?? [completedRound?.challengerId, completedRound?.accusedId, completedRound?.targetId]
      .find((id) => CREW_IDS.includes(id));
  if (!completedQuest && !completedRound) return { progress: current, clue: null, unlocked: false };

  const canAward = !current.clueDates.includes(date) && current.clues.length < 5;
  let clue = null;
  let clues = current.clues;
  let clueDates = current.clueDates;
  let unlockedJobs = current.unlockedJobs;
  if (canAward) {
    const clueNumber = current.clues.length + 1;
    clue = {
      id: `${PRIVATE_DETECTIVE_ID}-${clueNumber}`,
      date,
      characterId: clueNumber === 5 ? "group" : characterId ?? "group",
      outcome: completedQuest?.outcome ?? completedRound?.outcome ?? null,
      selectedId: completedQuest?.selectedId ?? completedRound?.selectedId ?? null,
    };
    clues = [...current.clues, clue];
    clueDates = [...current.clueDates, date];
    if (clueNumber === 5) unlockedJobs = [...new Set([...current.unlockedJobs, PRIVATE_DETECTIVE_ID])];
  }
  return {
    progress: {
      ...current,
      activeQuest: completedQuest ? null : current.activeQuest,
      clues,
      clueDates,
      unlockedJobs,
    },
    clue,
    unlocked: Boolean(clue && clues.length === 5),
  };
}

export function dismissCompletedQuest(progress) {
  const current = createProgression(progress);
  return current.activeQuest?.status === "completed" ? { ...current, activeQuest: null } : current;
}

export function setEquippedJob(progress, jobId) {
  const current = createProgression(progress);
  const equippedJob = jobId === PRIVATE_DETECTIVE_ID && current.unlockedJobs.includes(PRIVATE_DETECTIVE_ID)
    ? PRIVATE_DETECTIVE_ID
    : null;
  return { ...current, equippedJob };
}

export function isPrivateDetectiveEquipped(progress) {
  return createProgression(progress).equippedJob === PRIVATE_DETECTIVE_ID;
}

export function isAttackAllowed(investigatedId, targetId) {
  return !investigatedId || investigatedId !== targetId;
}
