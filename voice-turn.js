export const VOICE_TURN_SECONDS = Object.freeze({
  accusation: 40,
  response: 40,
  "hard-response": 40,
  "hard-final": 40,
});

export function createVoiceTurn({ stage, phase, now = Date.now(), durationSeconds = VOICE_TURN_SECONDS[stage] }) {
  if (!stage || !phase || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new TypeError("Invalid voice turn");
  }
  return {
    id: `${phase}:${now}`,
    stage,
    phase,
    startedAt: now,
    endsAt: now + (durationSeconds * 1_000),
    durationSeconds,
    playerTurns: 0,
    candidate: null,
    expired: false,
    finalizing: false,
  };
}

export function voiceTurnSecondsLeft(turn, now = Date.now()) {
  if (!turn) return 0;
  return Math.max(0, Math.ceil((turn.endsAt - now) / 1_000));
}

export function recordVoiceTurnCandidate(turn, candidate) {
  if (!turn || turn.expired || turn.finalizing || !candidate?.interpretation) return turn;
  return {
    ...turn,
    playerTurns: turn.playerTurns + 1,
    candidate: {
      interpretation: candidate.interpretation,
      message: String(candidate.message ?? "").trim(),
      utteranceId: candidate.utteranceId ?? null,
    },
  };
}

export function expireVoiceTurn(turn) {
  return turn ? { ...turn, expired: true } : turn;
}

export function beginVoiceTurnFinalization(turn) {
  return turn ? { ...turn, expired: true, finalizing: true } : turn;
}
