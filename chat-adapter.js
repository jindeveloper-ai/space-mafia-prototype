export const MAX_CHAT_LENGTH = 280;

const CLAIM_IDS = ["seen", "machine", "changed"];
const RESPONSE_IDS = ["double-down", "return-evidence", "check-time"];

function bestClaimFor(state, accusedId) {
  return CLAIM_IDS.reduce((best, claimId) =>
    state.facts[accusedId].impacts[claimId] > state.facts[accusedId].impacts[best]
      ? claimId
      : best,
  CLAIM_IDS[0]);
}

function namedCrewMember(message, crew) {
  const normalized = message.toLocaleLowerCase();
  return crew.find((member) =>
    normalized.includes(member.id) || normalized.includes(member.name.toLocaleLowerCase()),
  );
}

function claimFromMessage(message) {
  const normalized = message.toLocaleLowerCase();
  if (/(말\s*바|바꿔|시간|시각|진술|changed|story|time)/u.test(normalized)) return "changed";
  if (/(정화기|기계|고장|만졌|조작|machine|purifier|tamper)/u.test(normalized)) return "machine";
  if (/(산소실|나왔|봤|목격|oxygen|saw|seen)/u.test(normalized)) return "seen";
  return null;
}

export function fallbackAccusation(message, state, crew) {
  const member = namedCrewMember(message, crew)
    ?? crew.reduce((best, candidate) => {
      const candidateImpact = state.facts[candidate.id].impacts[bestClaimFor(state, candidate.id)];
      const bestImpact = state.facts[best.id].impacts[bestClaimFor(state, best.id)];
      return candidateImpact > bestImpact ? candidate : best;
    }, crew[0]);
  return {
    accusedId: member.id,
    claimId: claimFromMessage(message) ?? bestClaimFor(state, member.id),
  };
}

export function fallbackResponse(message) {
  const normalized = message.toLocaleLowerCase();
  if (/(22:10|기록|시간|시각|로그|record|time|log)/u.test(normalized)) return { responseId: "check-time" };
  if (/(카드|사물함|증거|card|locker|evidence)/u.test(normalized)) return { responseId: "return-evidence" };
  return { responseId: "double-down" };
}

export function normalizeInterpretation(stage, interpretation, message, state, crew) {
  if (stage === "accusation") {
    const fallback = fallbackAccusation(message, state, crew);
    const explicitMember = namedCrewMember(message, crew);
    const explicitClaim = claimFromMessage(message);
    return {
      accusedId: explicitMember?.id ?? (crew.some((member) => member.id === interpretation?.accusedId)
        ? interpretation.accusedId
        : fallback.accusedId),
      claimId: explicitClaim ?? (CLAIM_IDS.includes(interpretation?.claimId)
        ? interpretation.claimId
        : fallback.claimId),
    };
  }
  return {
    responseId: RESPONSE_IDS.includes(interpretation?.responseId)
      ? interpretation.responseId
      : fallbackResponse(message).responseId,
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
    friendId,
    round: {
      caseIndex: state.caseIndex,
      subquestId: state.subquestId,
      turn: transcript.filter((item) => item.speakerId === "player").length,
    },
    transcript: transcript.slice(-12).map(({ speakerId, text }) => ({ speakerId, text })),
  };
}
