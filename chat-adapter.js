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
  if (/(말\s*바|바꿔|시간|시각|진술|changed|story|time)/u.test(normalized)) return "changed";
  if (/(정화기|기계|고장|만졌|조작|공구|machine|purifier|tamper|tool)/u.test(normalized)) return "machine";
  if (/(산소실|나왔|봤|목격|oxygen|saw|seen)/u.test(normalized)) return "seen";
  return null;
}

function accusationFromMessage(message, crew) {
  const mentions = crewMentions(message, crew);
  if (!mentions.length) return { member: null, claimId: null };
  const paired = mentions.flatMap((mention, index) => {
    const end = mentions[index + 1]?.index ?? message.length;
    const claimId = claimFromMessage(message.slice(mention.index, end));
    return claimId ? [{ member: mention.member, claimId, index: mention.index }] : [];
  });
  if (paired.length) return paired.at(-1);
  return { member: mentions.at(-1).member, claimId: null };
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
    const remoteClaimMatchesTarget = remoteMemberId === accusedId && CLAIM_IDS.includes(interpretation?.claimId);
    return {
      accusedId,
      claimId: explicit.claimId ?? (remoteClaimMatchesTarget ? interpretation.claimId : fallback.claimId),
    };
  }
  if (stage === "hard-response" || stage === "hard-final") {
    const explicit = accusationFromMessage(message, crew);
    const remoteTargetId = crew.some((member) => member.id === interpretation?.targetId)
      ? interpretation.targetId
      : null;
    const targetId = explicit.member?.id ?? remoteTargetId ?? state.accusedId;
    const remoteClaimId = CLAIM_IDS.includes(interpretation?.claimId) ? interpretation.claimId : null;
    const explicitResponseId = responseFromMessage(message);
    return {
      targetId,
      claimId: explicit.claimId ?? remoteClaimId ?? state.claimId,
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

export function buildChatPayload({ locale, stage, message, state, crew, incident, transcript, friendId = null }) {
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
    round: {
      caseIndex: state.caseIndex,
      subquestId: state.subquestId,
      turn: transcript.filter((item) => item.speakerId === "player").length,
    },
    transcript: transcript.slice(-12).map(({ speakerId, text }) => ({ speakerId, text })),
  };
}
