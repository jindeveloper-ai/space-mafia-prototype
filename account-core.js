export const ACCOUNT_SCHEMA_VERSION = 1;
export const PROFILE_STORAGE_KEY = "oxygen-room-profile";
export const PROGRESSION_STORAGE_KEY = "mars-net-progression-v1";
export const ARCHIVE_VISIT_STORAGE_KEY = "mars-net-archive-visits-v1";
export const MATCH_HISTORY_STORAGE_KEY = "mars-net-match-history-v1";
export const CHAT_HISTORY_STORAGE_KEY = "mars-net-chat-history-v1";
export const GUEST_BACKUP_STORAGE_KEY = "mars-net-guest-backup-v1";

const CREW_IDS = ["mina", "juno", "noel"];
const MAX_MATCHES = 200;
const MAX_CHAT_MESSAGES = 500;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uniqueStrings = (values, limit = 200) => [...new Set(
  (Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.length <= 100),
)].slice(-limit);

export function createMutationId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function sanitizeProfile(raw = {}) {
  const source = isObject(raw) ? raw : {};
  return {
    name: String(source.name ?? "").trim().slice(0, 12),
    locale: source.locale === "en" ? "en" : "ko",
    avatarPath: typeof source.avatarPath === "string" ? source.avatarPath.slice(0, 220) : "",
    updatedAt: Number.isFinite(source.updatedAt) ? Math.max(0, Math.floor(source.updatedAt)) : 0,
  };
}

export function sanitizeArchiveDates(raw) {
  const values = Array.isArray(raw) ? raw : raw?.dates;
  return [...new Set((Array.isArray(values) ? values : []).filter(
    (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
  ))].sort().slice(-365);
}

export function sanitizeMatches(raw) {
  const values = Array.isArray(raw) ? raw : raw?.matches;
  const byId = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    if (!isObject(item) || typeof item.roundId !== "string" || !item.roundId.trim()) continue;
    const roundId = item.roundId.trim().slice(0, 100);
    byId.set(roundId, {
      roundId,
      mode: item.mode === "friend" ? "friend" : "solo",
      difficulty: item.difficulty === "hard" ? "hard" : "normal",
      role: item.role === "citizen" ? "citizen" : "mafia",
      outcome: ["win", "lose", "draw"].includes(item.outcome) ? item.outcome : "draw",
      evidenceTargetId: CREW_IDS.includes(item.evidenceTargetId) ? item.evidenceTargetId : null,
      accusedId: CREW_IDS.includes(item.accusedId) ? item.accusedId : null,
      claimId: ["seen", "machine", "changed"].includes(item.claimId) ? item.claimId : null,
      responseId: ["double-down", "return-evidence", "check-time"].includes(item.responseId)
        ? item.responseId
        : null,
      selectedId: [...CREW_IDS, "player"].includes(item.selectedId) ? item.selectedId : null,
      votes: Array.isArray(item.votes) ? item.votes.slice(0, 6) : [],
      voteShiftCount: Number.isFinite(item.voteShiftCount) ? Math.max(0, Math.min(3, Math.floor(item.voteShiftCount))) : 0,
      stars: Number.isFinite(item.stars) ? Math.max(0, Math.min(3, Math.floor(item.stars))) : 0,
      engineVersion: String(item.engineVersion ?? "unknown").slice(0, 40),
      authoritative: item.authoritative === true,
      playedAt: typeof item.playedAt === "string" ? item.playedAt.slice(0, 35) : new Date(0).toISOString(),
    });
  }
  return [...byId.values()].sort((a, b) => a.playedAt.localeCompare(b.playedAt)).slice(-MAX_MATCHES);
}

export function sanitizeChats(raw) {
  const source = isObject(raw) ? raw : {};
  return Object.fromEntries(CREW_IDS.map((characterId) => {
    const byId = new Map();
    for (const item of Array.isArray(source[characterId]) ? source[characterId] : []) {
      if (!isObject(item) || typeof item.id !== "string" || !item.id.trim()) continue;
      const sender = item.sender === "character" ? "character" : item.sender === "player" ? "player" : null;
      const body = String(item.body ?? "").trim().slice(0, 1_000);
      if (!sender || !body) continue;
      const id = item.id.trim().slice(0, 100);
      byId.set(id, {
        id,
        sender,
        body,
        createdAt: typeof item.createdAt === "string" ? item.createdAt.slice(0, 35) : new Date(0).toISOString(),
        modelMode: item.modelMode === "live" ? "live" : "mock",
      });
    }
    return [characterId, [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-MAX_CHAT_MESSAGES)];
  }));
}

export function mergeProgression(localRaw, cloudRaw, normalizeProgression = (value) => value ?? {}) {
  const local = normalizeProgression(localRaw);
  const cloud = normalizeProgression(cloudRaw);
  const maxByCrew = (key) => Object.fromEntries(CREW_IDS.map((id) => [
    id,
    Math.max(Number(local?.[key]?.[id]) || 0, Number(cloud?.[key]?.[id]) || 0),
  ]));
  const clues = new Map([...(local?.clues ?? []), ...(cloud?.clues ?? [])].map((item) => [item.id, item]));
  const unlockedJobs = uniqueStrings([...(local?.unlockedJobs ?? []), ...(cloud?.unlockedJobs ?? [])], 10);
  const preferredActiveQuest = cloud?.activeQuest ?? local?.activeQuest ?? null;
  const equippedCandidate = cloud?.equippedJob ?? local?.equippedJob ?? null;
  const friendCallUsage = Object.fromEntries(CREW_IDS.map((id) => {
    const localEntry = local?.friendCallUsage?.[id];
    const cloudEntry = cloud?.friendCallUsage?.[id];
    if (!localEntry) return [id, cloudEntry ?? null];
    if (!cloudEntry) return [id, localEntry];
    if (localEntry.date === cloudEntry.date) {
      return [id, { date: localEntry.date, seconds: Math.max(localEntry.seconds, cloudEntry.seconds) }];
    }
    return [id, localEntry.date > cloudEntry.date ? localEntry : cloudEntry];
  }));
  return normalizeProgression({
    ...local,
    ...cloud,
    affinity: maxByCrew("affinity"),
    crewLevels: maxByCrew("crewLevels"),
    friendCallUsage,
    leveledRoundIds: uniqueStrings([...(local?.leveledRoundIds ?? []), ...(cloud?.leveledRoundIds ?? [])], 100),
    activeQuest: preferredActiveQuest,
    rewardedQuestIds: uniqueStrings([...(local?.rewardedQuestIds ?? []), ...(cloud?.rewardedQuestIds ?? [])], 200),
    clueDates: uniqueStrings([...(local?.clueDates ?? []), ...(cloud?.clueDates ?? [])], 5),
    clues: [...clues.values()].slice(0, 5),
    unlockedJobs,
    equippedJob: unlockedJobs.includes(equippedCandidate) ? equippedCandidate : null,
  });
}

export function mergeAccountSnapshot(localRaw, cloudRaw, normalizeProgression = (value) => value ?? {}) {
  const local = isObject(localRaw) ? localRaw : {};
  const cloud = isObject(cloudRaw) ? cloudRaw : {};
  const localProfile = sanitizeProfile(local.profile);
  const cloudProfile = sanitizeProfile(cloud.profile);
  const profile = cloudProfile.updatedAt >= localProfile.updatedAt ? cloudProfile : localProfile;
  const matches = sanitizeMatches([...(local.matches ?? []), ...(cloud.matches ?? [])]);
  const localChats = sanitizeChats(local.chats);
  const cloudChats = sanitizeChats(cloud.chats);
  return {
    version: ACCOUNT_SCHEMA_VERSION,
    profile,
    progression: mergeProgression(local.progression, cloud.progression, normalizeProgression),
    archiveDates: sanitizeArchiveDates([...(local.archiveDates ?? []), ...(cloud.archiveDates ?? [])]),
    matches,
    chats: sanitizeChats(Object.fromEntries(CREW_IDS.map((id) => [id, [...localChats[id], ...cloudChats[id]]]))),
    revision: Number.isFinite(cloud.revision) ? Math.max(0, Math.floor(cloud.revision)) : 0,
  };
}

export function buildMatchRecord(state, engineVersion = "unknown") {
  return sanitizeMatches([{
    roundId: state?.roundId,
    mode: "solo",
    difficulty: state?.difficultyMode,
    role: "mafia",
    outcome: state?.outcome,
    evidenceTargetId: state?.targetId,
    accusedId: state?.accusedId,
    claimId: state?.claimId,
    responseId: state?.responseId,
    selectedId: state?.selectedId,
    votes: state?.votes?.map(({ voterId, candidateId }) => ({ voterId, candidateId })) ?? [],
    voteShiftCount: state?.voteShiftCount,
    stars: state?.outcome === "win" ? Math.max(1, Math.min(3, Number(state?.voteShiftCount) + 1)) : 0,
    engineVersion,
    authoritative: false,
    playedAt: new Date().toISOString(),
  }])[0] ?? null;
}
