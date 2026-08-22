export const MAX_CHAT_LENGTH = 280;

const CLAIM_IDS = ["seen", "machine", "changed"];
const RESPONSE_IDS = ["double-down", "return-evidence", "check-time"];
const CREW_WORLD_BACKGROUNDS = {
  mina: "MARS.NET idol-fandom board regular; follows Earth-relayed and Mars concerts, remembers screenshots well, but can be biased toward favorites.",
  juno: "MARS.NET development/technology board regular; maintains habitat living systems, separates facts from guesses, and tests counterexamples without jargon.",
  noel: "MARS.NET streaming board regular; follows Earth-to-Mars broadcasts and quickly notices changes in tone and reactions.",
};

function bestClaimFor(state, accusedId) {
  return CLAIM_IDS.reduce((best, claimId) =>
    state.facts[accusedId].impacts[claimId] > state.facts[accusedId].impacts[best]
      ? claimId
      : best,
  CLAIM_IDS[0]);
}

function crewMentions(message, crew) {
  const normalized = message.toLocaleLowerCase();
  const mentions = [];
  for (const member of crew) {
    const aliases = [...new Set([member.id, member.name.toLocaleLowerCase()])];
    for (const alias of aliases) {
      let index = normalized.indexOf(alias);
      while (index >= 0) {
        mentions.push({ member, index, length: alias.length });
        index = normalized.indexOf(alias, index + alias.length);
      }
    }
  }
  return mentions.sort((a, b) => a.index - b.index || b.length - a.length);
}

function claimFromMessage(message) {
  const normalized = message.toLocaleLowerCase();
  if (
    /(?:말|이야기|진술|시간|시각).{0,18}(?:바꿔|바뀌|다르|헷갈|오락가락|정정)/u.test(normalized)
    || /(?:바꿔|바뀌|다르|헷갈|오락가락|정정).{0,18}(?:말|이야기|진술|시간|시각)/u.test(normalized)
    || /(?:changed|mixed\s*up|conflicting|different).{0,18}(?:story|statement|time)/u.test(normalized)
    || /(?:story|statement|time).{0,18}(?:changed|mixed\s*up|conflicting|different)/u.test(normalized)
  ) return "changed";
  if (/(정화기|기계|고장|만졌|조작|공구|machine|purifier|tamper|tool)/u.test(normalized)) return "machine";
  if (
    /(?:산소실).{0,22}(?:나오|봤|목격|있었)/u.test(normalized)
    || /(?:봤|목격).{0,22}(?:산소실)/u.test(normalized)
    || /(?:saw|seen|spotted|watched).{0,24}(?:oxygen\s*room)/u.test(normalized)
    || /(?:oxygen\s*room).{0,24}(?:leav|came\s*out|saw|seen|spotted)/u.test(normalized)
  ) return "seen";
  return null;
}

function decisionTarget(message, mentions) {
  const normalized = message.toLocaleLowerCase();
  const decisionPattern = /(?:최종|결론|투표|표\s*던|찍|지목|몰|의심|범인|마피아|final(?:\s+position)?|vote|voting|target|accuse|suspect|pick)/u;
  const candidates = mentions.filter((mention) => {
    const start = Math.max(0, mention.index - 34);
    const end = Math.min(normalized.length, mention.index + mention.length + 34);
    return decisionPattern.test(normalized.slice(start, end));
  });
  return (candidates.at(-1) ?? mentions.at(-1))?.member ?? null;
}

function accusationFromMessage(message, crew) {
  const mentions = crewMentions(message, crew);
  if (!mentions.length) return { member: null, claimId: null };
  const member = decisionTarget(message, mentions);
  const targetMentions = mentions.filter((mention) => mention.member.id === member.id);
  const pairedClaims = targetMentions.flatMap((mention) => {
    const nextOther = mentions.find((candidate) => candidate.index > mention.index && candidate.member.id !== member.id);
    const start = Math.max(0, mention.index - 30);
    const end = nextOther?.index ?? Math.min(message.length, mention.index + mention.length + 120);
    const claimId = claimFromMessage(message.slice(start, end));
    return claimId ? [claimId] : [];
  });
  const claimCounts = pairedClaims.reduce((counts, claimId) => ({
    ...counts,
    [claimId]: (counts[claimId] ?? 0) + 1,
  }), {});
  const claimId = pairedClaims.reduce((best, claimId) =>
    !best || claimCounts[claimId] >= claimCounts[best] ? claimId : best,
  null)
    ?? (new Set(mentions.map((mention) => mention.member.id)).size === 1 ? claimFromMessage(message) : null);
  return { member, claimId };
}

function responseFromMessage(message) {
  const normalized = message.toLocaleLowerCase();
  if (/(22\s*:\s*10|원본|기록|시간|시각|로그|타임라인|record|time|log|timeline|original)/u.test(normalized)) return "check-time";
  if (/(카드|사물함|증거|출입|card|locker|evidence|access)/u.test(normalized)) return "return-evidence";
  if (/(직접\s*(봤|봄)|확실|그대로|밀어|믿어|directly|certain|stick|saw it)/u.test(normalized)) return "double-down";
  return null;
}

export function fallbackAccusation(message, state, crew) {
  const explicit = accusationFromMessage(message, crew);
  const member = explicit.member
    ?? crew.reduce((best, candidate) => {
      const candidateImpact = state.facts[candidate.id].impacts[bestClaimFor(state, candidate.id)];
      const bestImpact = state.facts[best.id].impacts[bestClaimFor(state, best.id)];
      return candidateImpact > bestImpact ? candidate : best;
    }, crew[0]);
  return {
    accusedId: member.id,
    claimId: explicit.claimId ?? claimFromMessage(message) ?? bestClaimFor(state, member.id),
  };
}

export function fallbackResponse(message) {
  return { responseId: responseFromMessage(message) ?? "double-down" };
}

export function normalizeInterpretation(stage, interpretation, message, state, crew) {
  if (stage === "accusation") {
    const fallback = fallbackAccusation(message, state, crew);
    const explicit = accusationFromMessage(message, crew);
    const remoteMemberId = crew.some((member) => member.id === interpretation?.accusedId)
      ? interpretation.accusedId
      : null;
    const accusedId = explicit.member?.id ?? remoteMemberId ?? fallback.accusedId;
    return {
      accusedId,
      // A model-selected canonical claim must never turn an unrelated camera/card
      // sentence into an eyewitness statement. Local semantic evidence wins; an
      // ambiguous sentence falls back to the target's current fact relationship.
      claimId: explicit.claimId ?? fallback.claimId,
    };
  }
  if (stage === "hard-response" || stage === "hard-final") {
    const explicit = accusationFromMessage(message, crew);
    const remoteTargetId = crew.some((member) => member.id === interpretation?.targetId)
      ? interpretation.targetId
      : null;
    const targetId = explicit.member?.id ?? remoteTargetId ?? state.accusedId;
    const explicitResponseId = responseFromMessage(message);
    return {
      targetId,
      claimId: explicit.claimId ?? state.claimId,
      responseId: explicitResponseId ?? (RESPONSE_IDS.includes(interpretation?.responseId)
        ? interpretation.responseId
        : fallbackResponse(message).responseId),
    };
  }
  const explicitResponseId = responseFromMessage(message);
  return {
    responseId: explicitResponseId ?? (RESPONSE_IDS.includes(interpretation?.responseId)
      ? interpretation.responseId
      : fallbackResponse(message).responseId),
  };
}

export function buildChatPayload({
  locale,
  stage,
  message,
  state,
  crew,
  incident,
  transcript,
  friendId = null,
  inputMode = "text",
  utteranceId = null,
}) {
  return {
    locale,
    stage,
    message: String(message).trim().slice(0, MAX_CHAT_LENGTH),
    crew: crew.map((member) => ({
      id: member.id,
      name: member.name,
      style: member.style,
      personality: member.personality,
      background: member.background ?? CREW_WORLD_BACKGROUNDS[member.id],
      fact: {
        id: state.facts[member.id].id,
        text: state.facts[member.id].text,
      },
    })),
    incident: {
      place: incident.place,
      time: incident.time,
      confirmed: incident.confirmed,
      evidence: incident.evidence,
    },
    targetId: state.targetId,
    accusedId: state.accusedId,
    claimId: state.claimId,
    challengeText: state.challengeText,
    difficultyMode: state.difficultyMode,
    hardTurns: state.hardTurns.map(({ targetId, claimId, responseId }) => ({ targetId, claimId, responseId })),
    friendId,
    inputMode: inputMode === "voice" ? "voice" : "text",
    utteranceId: inputMode === "voice" ? String(utteranceId ?? "").slice(0, 100) : null,
    round: {
      caseIndex: state.caseIndex,
      subquestId: state.subquestId,
      turn: transcript.filter((item) => item.speakerId === "player").length,
    },
    transcript: transcript
      .filter(({ text }) => typeof text === "string" && text.length > 0)
      .slice(-12)
      .map(({ speakerId, text }) => ({ speakerId, text })),
  };
}
