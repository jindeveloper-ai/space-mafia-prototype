import { getCopy, normalizeLocale, withJosa } from "./i18n.js?v=0.14.3";

export { withJosa };

export const PLAYER_ID = "player";
export const INITIAL_CREW_LEVELS = Object.freeze({ mina: 2, juno: 4, noel: 3 });
export const DIFFICULTY_MODES = Object.freeze(["normal", "hard"]);

const CREW_BASE = [
  { id: "mina", icon: "📋", personality: "record" },
  { id: "juno", icon: "🔎", personality: "skeptic" },
  { id: "noel", icon: "💬", personality: "behavior" },
];

const CLAIM_IDS = ["seen", "machine", "changed"];
const RESPONSE_IDS = ["double-down", "return-evidence", "check-time"];
export const SUBQUEST_IDS = ["redirect", "check-time", "weak-link", "safe-win"];

export function getCrew(locale = "ko") {
  const copy = getCopy(locale);
  return CREW_BASE.map((member) => ({ ...member, ...copy.crew[member.id] }));
}

export function getIncident(locale = "ko") {
  return { ...getCopy(locale).incident };
}

export function getClaims(locale = "ko") {
  const copy = getCopy(locale);
  return CLAIM_IDS.map((id) => ({ id, ...copy.claims[id] }));
}

export function getSubquest(id, locale = "ko") {
  return getCopy(locale).subquests[id] ?? null;
}

export const CREW = getCrew();
export const INCIDENT = getIncident();
export const CLAIMS = getClaims();

const FACT_TYPES = {
  alibi: {
    id: "alibi",
    icon: "📹",
    impacts: { seen: -26, machine: -12, changed: 0 },
    baseWeights: { record: -18, skeptic: -16, behavior: -12 },
  },
  access: {
    id: "access",
    icon: "🧰",
    impacts: { seen: 15, machine: 26, changed: 4 },
    baseWeights: { record: 12, skeptic: 7, behavior: 9 },
  },
  contradiction: {
    id: "contradiction",
    icon: "🕒",
    impacts: { seen: 6, machine: 3, changed: 24 },
    baseWeights: { record: 8, skeptic: 6, behavior: 15 },
  },
};

const CASE_ASSIGNMENTS = [
  ["alibi", "access", "contradiction"],
  ["alibi", "contradiction", "access"],
  ["access", "alibi", "contradiction"],
  ["access", "contradiction", "alibi"],
  ["contradiction", "alibi", "access"],
  ["contradiction", "access", "alibi"],
];

const EVIDENCE_WEIGHTS = { record: 8, skeptic: 5, behavior: 7 };
const CONNECTED_CLUE_BONUS = 18;
const HARD_MODE_LEVEL_BONUS = 20;
const HARD_CONSISTENCY_FACTOR = 0.6;
const HARD_TARGET_CHANGE_PENALTY = 8;
const HARD_FACT_CONFLICT_PENALTY = 10;
const CLAIM_MULTIPLIERS = {
  record: { seen: 1.15, machine: 1.1, changed: 0.7 },
  skeptic: { seen: 0.75, machine: 0.7, changed: 0.8 },
  behavior: { seen: 0.8, machine: 0.75, changed: 1.25 },
};

export function getCrewMember(id, locale = "ko") {
  return getCrew(locale).find((member) => member.id === id) ?? null;
}

export function normalizeCrewLevels(raw = {}) {
  return Object.fromEntries(Object.entries(INITIAL_CREW_LEVELS).map(([id, initialLevel]) => [
    id,
    Number.isFinite(raw?.[id]) ? Math.min(50, Math.max(1, Math.floor(raw[id]))) : initialLevel,
  ]));
}

export function getDifficultyBand(level, difficultyMode = "normal") {
  const effectiveLevel = Math.min(50, Math.max(1, Number(level) || 1) + (difficultyMode === "hard" ? HARD_MODE_LEVEL_BONUS : 0));
  return Math.ceil(effectiveLevel / 10);
}

export function getDisplayName(id, locale = "ko") {
  const copy = getCopy(locale);
  return id === PLAYER_ID ? copy.engine.player : getCrewMember(id, locale)?.name ?? copy.engine.unknown;
}

export function formatClueCount(count, locale = "ko") {
  return getCopy(locale).engine.clueCount(count);
}

function createFacts(caseIndex, locale) {
  const assignment = CASE_ASSIGNMENTS[caseIndex];
  const factCopy = getCopy(locale).facts;
  return Object.fromEntries(
    getCrew(locale).map((member, index) => {
      const factType = FACT_TYPES[assignment[index]];
      const localized = factCopy[factType.id];
      return [
        member.id,
        {
          id: factType.id,
          icon: factType.icon,
          title: localized.title,
          text: localized.text(member.name),
          spokenText: localized.spokenText(member.name),
          firstPersonText: localized.firstPersonText(member.personality),
          badge: localized.badge,
          guidance: localized.guidance,
          impacts: { ...factType.impacts },
          baseWeights: { ...factType.baseWeights },
          baseReason: localized.baseReason(member.name),
        },
      ];
    }),
  );
}

function createBeliefs(crewLevels, difficultyMode) {
  return Object.fromEntries(
    CREW.map((voter) => [
      voter.id,
      Object.fromEntries(
        [PLAYER_ID, ...CREW.map((member) => member.id)].map((candidateId) => [
          candidateId,
          candidateId === voter.id
            ? -999
            : candidateId === PLAYER_ID
              ? 25 + ((getDifficultyBand(crewLevels[voter.id], difficultyMode) - 1) * 2)
              : 10,
        ]),
      ),
    ]),
  );
}

function createReasonLog() {
  return Object.fromEntries(
    CREW.map((voter) => [
      voter.id,
      Object.fromEntries(
        [PLAYER_ID, ...CREW.map((member) => member.id)].map((candidateId) => [
          candidateId,
          [],
        ]),
      ),
    ]),
  );
}

export function createGame(options = {}) {
  const locale = normalizeLocale(options.locale);
  const requestedIndex = options.caseIndex;
  const caseIndex = Number.isInteger(requestedIndex)
    ? ((requestedIndex % CASE_ASSIGNMENTS.length) + CASE_ASSIGNMENTS.length) % CASE_ASSIGNMENTS.length
    : Math.floor(Math.random() * CASE_ASSIGNMENTS.length);
  const subquestId = SUBQUEST_IDS.includes(options.subquestId)
    ? options.subquestId
    : SUBQUEST_IDS[Math.floor(Math.random() * SUBQUEST_IDS.length)];
  const crewLevels = normalizeCrewLevels(options.crewLevels);
  const difficultyMode = DIFFICULTY_MODES.includes(options.difficultyMode) ? options.difficultyMode : "normal";
  const roundId = typeof options.roundId === "string" && options.roundId.trim()
    ? options.roundId.trim().slice(0, 100)
    : null;

  const state = {
    phase: "intro",
    locale,
    caseIndex,
    subquestId,
    subquestCompleted: null,
    roundId,
    crewLevels,
    difficultyMode,
    facts: createFacts(caseIndex, locale),
    targetId: null,
    accusedId: null,
    claimId: null,
    lie: null,
    lieImpact: 0,
    challengerId: null,
    challengeText: null,
    responseId: null,
    responseText: null,
    hardTurns: [],
    hardAppliedEffects: [],
    beliefs: createBeliefs(crewLevels, difficultyMode),
    reasonLog: createReasonLog(),
    leanHistory: {
      afterEvidence: [],
      afterLie: [],
      afterResponse: [],
    },
    votes: [],
    selectedId: null,
    outcome: null,
    voteShiftCount: 0,
    resultTier: null,
  };

  for (const candidate of CREW) {
    const fact = state.facts[candidate.id];
    for (const voter of CREW) {
      adjustBelief(
        state,
        voter.id,
        candidate.id,
        fact.baseWeights[voter.personality],
        fact.baseReason,
        `fact:${fact.id}`,
      );
    }
  }

  return state;
}

export function nextCaseIndex(currentCaseIndex) {
  const offset = 1 + Math.floor(Math.random() * (CASE_ASSIGNMENTS.length - 1));
  return (currentCaseIndex + offset) % CASE_ASSIGNMENTS.length;
}

export function nextSubquestId(currentSubquestId) {
  const currentIndex = SUBQUEST_IDS.indexOf(currentSubquestId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const offset = 1 + Math.floor(Math.random() * (SUBQUEST_IDS.length - 1));
  return SUBQUEST_IDS[(safeIndex + offset) % SUBQUEST_IDS.length];
}

export function startGame(state) {
  return { ...state, phase: "evidence" };
}

function cloneDecisionState(state) {
  return {
    ...state,
    beliefs: Object.fromEntries(
      Object.entries(state.beliefs).map(([voterId, scores]) => [voterId, { ...scores }]),
    ),
    reasonLog: Object.fromEntries(
      Object.entries(state.reasonLog).map(([voterId, candidates]) => [
        voterId,
        Object.fromEntries(
          Object.entries(candidates).map(([candidateId, reasons]) => [
            candidateId,
            [...reasons],
          ]),
        ),
      ]),
    ),
    leanHistory: {
      afterEvidence: [...state.leanHistory.afterEvidence],
      afterLie: [...state.leanHistory.afterLie],
      afterResponse: [...state.leanHistory.afterResponse],
    },
    hardTurns: state.hardTurns.map((turn) => ({ ...turn })),
    hardAppliedEffects: [...state.hardAppliedEffects],
  };
}

function adjustBelief(state, voterId, candidateId, delta, reason, clueId = reason) {
  if (voterId === candidateId || !Number.isFinite(delta) || delta === 0) return;
  state.beliefs[voterId][candidateId] += delta;
  if (delta > 0) {
    state.reasonLog[voterId][candidateId].push({ delta, reason, clueId });
  }
}

export function plantEvidence(state, targetId) {
  const copy = getCopy(state.locale);
  const target = getCrewMember(targetId, state.locale);
  if (!target) throw new Error(copy.engine.errors.evidenceTarget);

  const next = cloneDecisionState(state);
  next.phase = "meeting";
  next.targetId = targetId;

  for (const voter of CREW) {
    if (voter.id === targetId) {
      adjustBelief(
        next,
        voter.id,
        PLAYER_ID,
        12,
        copy.engine.reasons.framedSelf,
        "knowledge:framed",
      );
      continue;
    }
    adjustBelief(
      next,
      voter.id,
      targetId,
      EVIDENCE_WEIGHTS[voter.personality],
      copy.engine.reasons.evidenceCard(target.name),
      "evidence:card",
    );
  }

  next.leanHistory.afterEvidence = getCurrentLeans(next);

  return next;
}

export function getMeetingStatements(state) {
  const copy = getCopy(state.locale);
  return getCrew(state.locale).map((member) => {
    const fact = state.facts[member.id];
    if (member.id === state.targetId) {
      return {
        ...member,
        text: copy.engine.meetingFramed(member.personality),
      };
    }
    return { ...member, text: fact.firstPersonText };
  });
}

export function getClaimOptions(accusedId, locale = "ko") {
  const copy = getCopy(locale);
  const accused = getCrewMember(accusedId, locale);
  if (!accused) return [];
  return getClaims(locale).map((claim) => ({
    ...claim,
    label: copy.engine.claimLabel(accused.name, claim.action),
  }));
}

function claimMultiplier(voter, claimId) {
  return CLAIM_MULTIPLIERS[voter.personality][claimId];
}

function voterDifficultyBand(state, voterId) {
  return getDifficultyBand(state.crewLevels?.[voterId], state.difficultyMode);
}

function scaleClaimImpactForDifficulty(state, voterId, impact) {
  const bandOffset = voterDifficultyBand(state, voterId) - 1;
  const factor = impact >= 0 ? 1 - (bandOffset * 0.07) : 1 + (bandOffset * 0.1);
  return Math.round(impact * factor);
}

function chooseChallenger(accusedId, impact) {
  if (impact < 0) return accusedId;
  if (accusedId !== "juno") return "juno";
  return "noel";
}

function buildChallenge(state, accused, claim, fact, impact, challengerId) {
  const engine = getCopy(state.locale).engine;
  const isSelfDefense = challengerId === accused.id;
  const challenger = getCrewMember(challengerId, state.locale);
  const personality = challenger?.personality ?? "behavior";
  const statedFact = isSelfDefense ? fact.firstPersonText : fact.spokenText;
  if (impact < 0) {
    return engine.challengeContradiction(statedFact, accused.name, claim.challengeAction, isSelfDefense, personality);
  }
  if (isSelfDefense) {
    return engine.challengeSelf(statedFact, personality);
  }
  return engine.challengeWeak(statedFact, accused.name, personality);
}

export function applyLie(state, accusedId, claimId) {
  const copy = getCopy(state.locale);
  const accused = getCrewMember(accusedId, state.locale);
  const claim = getClaims(state.locale).find((item) => item.id === claimId);
  if (!state.targetId) throw new Error(copy.engine.errors.evidenceFirst);
  if (!accused) throw new Error(copy.engine.errors.accused);
  if (!claim) throw new Error(copy.engine.errors.claim);

  const fact = state.facts[accusedId];
  const impact = fact.impacts[claimId];
  const next = cloneDecisionState(state);
  next.phase = "challenge";
  next.accusedId = accusedId;
  next.claimId = claimId;
  next.lie = copy.engine.claimLabel(accused.name, claim.action);
  next.lieImpact = impact;

  for (const voter of CREW) {
    if (voter.id === accusedId) {
      adjustBelief(
        next,
        voter.id,
        PLAYER_ID,
        impact < 0 ? 25 : 15,
        copy.engine.reasons.accusedKnows,
        "knowledge:false-claim",
      );
      continue;
    }

    const personalityImpact = Math.round(impact * claimMultiplier(voter, claimId));
    const scaledImpact = scaleClaimImpactForDifficulty(next, voter.id, personalityImpact);
    if (scaledImpact >= 0) {
      adjustBelief(
        next,
        voter.id,
        accusedId,
        scaledImpact,
      copy.engine.reasons.claimSupports(fact.spokenText),
        `claim:${claimId}`,
      );
    } else {
      adjustBelief(
        next,
        voter.id,
        PLAYER_ID,
        Math.abs(scaledImpact),
      copy.engine.reasons.claimContradicts(fact.spokenText),
        "claim:contradicted",
      );
      next.beliefs[voter.id][accusedId] += Math.round(scaledImpact / 3);
    }

    if (accusedId === state.targetId && impact >= 0) {
      if (voter.personality === "record") {
        adjustBelief(next, voter.id, accusedId, 6, copy.engine.reasons.evidenceMatches, "evidence:card");
      }
      if (voter.personality === "skeptic") {
        adjustBelief(next, voter.id, PLAYER_ID, 5, copy.engine.reasons.tooPerfect, "pattern:too-perfect");
      }
      if (voter.personality === "behavior" && claimId === "changed") {
        adjustBelief(next, voter.id, accusedId, 5, copy.engine.reasons.changedMatters, "claim:changed");
      }
    }
  }

  next.challengerId = chooseChallenger(accusedId, impact);
  next.challengeText = buildChallenge(
    next,
    accused,
    claim,
    fact,
    impact,
    next.challengerId,
  );
  next.leanHistory.afterLie = getCurrentLeans(next);
  return next;
}

function applyHardPlayerSuspicion(next, delta, reason, clueId) {
  for (const voter of CREW) {
    adjustBelief(next, voter.id, PLAYER_ID, delta, reason, clueId);
  }
}

function applyHardFactConflict(next, targetId, claimId) {
  const effectId = `conflict:${targetId}:${claimId}`;
  if (next.hardAppliedEffects.includes(effectId) || next.facts[targetId].impacts[claimId] >= 0) return;
  applyHardPlayerSuspicion(
    next,
    HARD_FACT_CONFLICT_PENALTY,
    getCopy(next.locale).engine.reasons.hardFactConflict,
    `hard:${effectId}`,
  );
  next.hardAppliedEffects.push(effectId);
}

export function applyHardLie(state, accusedId, claimId) {
  if (state.difficultyMode !== "hard") return applyLie(state, accusedId, claimId);
  const next = applyLie(state, accusedId, claimId);
  next.phase = "hard-defense-1";
  next.hardTurns = [{ targetId: accusedId, claimId, responseId: null }];
  applyHardFactConflict(next, accusedId, claimId);
  return next;
}

export function getResponseOptions(state) {
  const copy = getCopy(state.locale);
  const target = getCrewMember(state.targetId, state.locale);
  const incident = getIncident(state.locale);
  return copy.engine.responseOptions(
    target.name,
    incident.time,
    state.accusedId === state.targetId,
  );
}

export function applyResponse(state, responseId) {
  const copy = getCopy(state.locale);
  const reasons = copy.engine.reasons;
  if (state.phase !== "challenge") throw new Error(copy.engine.errors.challengeFirst);
  const option = getResponseOptions(state).find((item) => item.id === responseId);
  if (!option) throw new Error(copy.engine.errors.response);

  const next = cloneDecisionState(state);
  next.phase = "response";
  next.responseId = responseId;
  next.responseText = option.label.replaceAll("“", "").replaceAll("”", "");

  if (responseId === "double-down") {
    for (const voter of CREW) {
      const bandOffset = voterDifficultyBand(state, voter.id) - 1;
      if (state.lieImpact >= 12 && voter.id !== state.accusedId) {
        adjustBelief(next, voter.id, state.accusedId, Math.max(4, 9 - bandOffset), reasons.maintainedClaim, `claim:${state.claimId}`);
      } else if (state.lieImpact < 0) {
        adjustBelief(next, voter.id, PLAYER_ID, 15 + (bandOffset * 2), reasons.ignoredFact, "behavior:ignored-fact");
      } else {
        adjustBelief(next, voter.id, PLAYER_ID, 5 + bandOffset, reasons.overconfidence, "behavior:overconfidence");
      }
    }
    if (state.accusedId !== "juno") {
      adjustBelief(next, "juno", PLAYER_ID, 5, reasons.confidenceSuspicion, "behavior:overconfidence");
    }
  }

  if (responseId === "return-evidence") {
    for (const voter of CREW) {
      const bandOffset = voterDifficultyBand(state, voter.id) - 1;
      if (voter.id === state.targetId) {
        adjustBelief(next, voter.id, PLAYER_ID, 9, reasons.reusedFrame, "knowledge:framed");
        continue;
      }
      const baseWeight = voter.personality === "record" ? 10 : voter.personality === "skeptic" ? 4 : 7;
      const weight = Math.max(2, baseWeight - bandOffset);
      adjustBelief(next, voter.id, state.targetId, weight, reasons.returnedCard, "response:return-evidence");
      if (state.accusedId !== state.targetId) {
        const changePenalty = voter.personality === "behavior" ? 10 : 5;
        adjustBelief(next, voter.id, PLAYER_ID, changePenalty, reasons.changedTarget, "behavior:changed-target");
      } else if (voter.personality === "skeptic") {
        adjustBelief(next, voter.id, PLAYER_ID, 5, reasons.repeatedEvidence, "pattern:too-perfect");
      }
    }
  }

  if (responseId === "check-time") {
    const accusedFact = state.facts[state.accusedId];
    for (const voter of CREW) {
      const bandOffset = voterDifficultyBand(state, voter.id) - 1;
      if (accusedFact.id === "contradiction") {
        adjustBelief(next, voter.id, state.accusedId, Math.max(5, 10 - bandOffset), reasons.timeContradiction, "fact:contradiction");
      } else if (accusedFact.id === "alibi") {
        adjustBelief(next, voter.id, PLAYER_ID, 12 + (bandOffset * 2), reasons.alibiClears, "timeline:clears-accused");
      } else {
        adjustBelief(next, voter.id, PLAYER_ID, 4 + bandOffset, reasons.noTimeConflict, "timeline:no-conflict");
      }
    }
  }

  next.leanHistory.afterResponse = getCurrentLeans(next);
  return next;
}

function applyHardConsistency(next, targetId, claimId) {
  const effectId = `consistent:${targetId}:${claimId}`;
  if (
    targetId !== next.accusedId
    || claimId !== next.claimId
    || next.hardAppliedEffects.includes(effectId)
    || next.lieImpact <= 0
  ) return;

  const reasons = getCopy(next.locale).engine.reasons;
  for (const voter of CREW) {
    if (voter.id === targetId) continue;
    const personalityImpact = Math.round(next.lieImpact * claimMultiplier(voter, claimId));
    const scaledImpact = scaleClaimImpactForDifficulty(next, voter.id, personalityImpact);
    const consistencyImpact = Math.max(1, Math.round(scaledImpact * HARD_CONSISTENCY_FACTOR));
    adjustBelief(next, voter.id, targetId, consistencyImpact, reasons.hardConsistent, `claim:${claimId}`);
  }
  next.hardAppliedEffects.push(effectId);
}

export function applyHardDefense(state, interpretation) {
  const copy = getCopy(state.locale);
  const expectedPhases = ["hard-defense-1", "hard-defense-2", "hard-final"];
  if (state.difficultyMode !== "hard" || !expectedPhases.includes(state.phase)) {
    throw new Error(copy.engine.errors.hardDefenseFirst);
  }

  const targetId = getCrewMember(interpretation?.targetId, state.locale)?.id;
  const claimId = interpretation?.claimId;
  const responseId = interpretation?.responseId;
  if (!targetId) throw new Error(copy.engine.errors.accused);
  if (!CLAIM_IDS.includes(claimId)) throw new Error(copy.engine.errors.claim);
  if (!RESPONSE_IDS.includes(responseId)) throw new Error(copy.engine.errors.response);

  const isFirstDefense = state.phase === "hard-defense-1";
  const next = isFirstDefense
    ? applyResponse({ ...state, phase: "challenge" }, responseId)
    : cloneDecisionState(state);
  next.responseId = responseId;
  next.responseText = getResponseOptions(next)
    .find((option) => option.id === responseId)
    .label.replaceAll("“", "").replaceAll("”", "");
  next.hardTurns.push({ targetId, claimId, responseId });

  const previousTurn = state.hardTurns.at(-1);
  if (targetId !== previousTurn.targetId) {
    const effectId = `target-change:${previousTurn.targetId}:${targetId}`;
    if (!next.hardAppliedEffects.includes(effectId)) {
      applyHardPlayerSuspicion(
        next,
        HARD_TARGET_CHANGE_PENALTY,
        copy.engine.reasons.hardTargetChanged,
        `hard:${effectId}`,
      );
      next.hardAppliedEffects.push(effectId);
    }
  } else {
    applyHardConsistency(next, targetId, claimId);
  }
  applyHardFactConflict(next, targetId, claimId);

  next.phase = state.phase === "hard-defense-1"
    ? "hard-defense-2"
    : state.phase === "hard-defense-2"
      ? "hard-final"
      : "response";
  if (next.phase === "response") next.leanHistory.afterResponse = getCurrentLeans(next);
  return next;
}

function candidateEvidence(state, voterId, candidateId) {
  const strongestByClue = new Map();
  for (const item of state.reasonLog[voterId][candidateId]) {
    const previous = strongestByClue.get(item.clueId);
    if (!previous || item.delta > previous.delta) strongestByClue.set(item.clueId, item);
  }
  return [...strongestByClue.values()].sort((a, b) => b.delta - a.delta);
}

function rankedCandidates(state, voterId) {
  const hasConnectedClaim = (candidateId) => {
    const evidence = candidateEvidence(state, voterId, candidateId);
    return evidence.some((item) => (item.clueId.startsWith("claim:") && item.clueId !== "claim:contradicted") || item.clueId === "response:return-evidence")
      && evidence.some((item) => item.clueId.startsWith("fact:") || item.clueId.startsWith("evidence:"));
  };
  return [PLAYER_ID, ...CREW.map((member) => member.id)]
    .filter((candidateId) => candidateId !== voterId)
    .sort((a, b) => {
      const aClues = candidateEvidence(state, voterId, a).length;
      const bClues = candidateEvidence(state, voterId, b).length;
      const aScore = state.beliefs[voterId][a] + (aClues >= 2 && hasConnectedClaim(a) ? CONNECTED_CLUE_BONUS : 0);
      const bScore = state.beliefs[voterId][b] + (bClues >= 2 && hasConnectedClaim(b) ? CONNECTED_CLUE_BONUS : 0);
      return bScore - aScore;
    });
}

function voteReason(state, voterId, candidateId) {
  const reasonsCopy = getCopy(state.locale).engine.reasons;
  const reasons = candidateEvidence(state, voterId, candidateId);
  const reason = !reasons.length
    ? reasonsCopy.weakAlibi
    : reasons.length === 1
      ? reasons[0].reason
      : reasonsCopy.join(reasons[0].reason, reasons[1].reason);
  const personality = getCrewMember(voterId, state.locale)?.personality;
  if (personality === "record") return reasonsCopy.record(reason);
  if (personality === "skeptic") return reasonsCopy.skeptic(reason);
  return reasonsCopy.behavior(reason);
}

export function getCurrentLeans(state) {
  return CREW.map((voter) => {
    const candidateId = rankedCandidates(state, voter.id)[0];
    const evidence = candidateEvidence(state, voter.id, candidateId);
    return {
      voterId: voter.id,
      candidateId,
      reason: voteReason(state, voter.id, candidateId),
      clueCount: evidence.length,
      confidence: evidence.length >= 2 ? "strong" : "weak",
    };
  });
}

export function resolveVote(state) {
  if (state.phase !== "response") {
    throw new Error(getCopy(state.locale).engine.errors.responseFirst);
  }

  const votes = getCurrentLeans(state).map((lean) => ({
    ...lean,
  }));
  const counts = votes.reduce((result, vote) => {
    result[vote.candidateId] = (result[vote.candidateId] ?? 0) + 1;
    return result;
  }, {});
  const maxVotes = Math.max(...Object.values(counts));
  const selectedId = maxVotes >= 2
    ? Object.keys(counts).find((candidateId) => counts[candidateId] === maxVotes)
    : null;
  const outcome = selectedId === null
    ? "draw"
    : selectedId === PLAYER_ID
      ? "lose"
      : "win";
  const beforeByVoter = new Map(
    state.leanHistory.afterEvidence.map((lean) => [lean.voterId, lean.candidateId]),
  );
  const voteShiftCount = votes.filter(
    (vote) => beforeByVoter.get(vote.voterId) !== vote.candidateId,
  ).length;
  const redirectedTarget = selectedId === state.accusedId && state.accusedId !== state.targetId;
  const resultTier = outcome !== "win"
    ? null
    : redirectedTarget && voteShiftCount >= 2
      ? "mastermind"
      : voteShiftCount > 0
        ? "manipulator"
        : "survivor";

  const result = {
    ...state,
    phase: "result",
    votes,
    selectedId,
    outcome,
    voteShiftCount,
    resultTier,
  };
  const subquestCompleted = state.subquestId === "redirect"
    ? outcome === "win" && selectedId === state.accusedId && state.accusedId !== state.targetId
    : state.subquestId === "check-time"
      ? outcome === "win" && state.responseId === "check-time"
      : state.subquestId === "weak-link"
        ? outcome === "win" && state.lieImpact >= 0 && state.lieImpact < 12
        : outcome === "win" && resultTier === "survivor";

  return { ...result, subquestCompleted };
}
