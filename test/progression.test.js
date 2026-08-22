import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptPersonalQuest,
  awardCrewLevels,
  createProgression,
  dismissCompletedQuest,
  evaluatePersonalQuest,
  FRIEND_CALL_DAILY_SECONDS,
  friendCallSecondsRemaining,
  INITIAL_CREW_LEVELS,
  isAttackAllowed,
  isPrivateDetectiveEquipped,
  localDateKey,
  markDebriefViewed,
  PRIVATE_DETECTIVE_ID,
  recordFriendCallUsage,
  setEquippedJob,
  setDifficultyMode,
  settlePersonalQuest,
} from "../progression.js";
import {
  applyLie,
  applyResponse,
  createGame,
  plantEvidence,
  resolveVote,
} from "../game-engine.js";

const DATE = "2050-04-01";

test("친구별 보이스톡은 하루 5분을 독립적으로 기록하고 다음 날짜에 초기화한다", () => {
  let progress = createProgression();
  progress = recordFriendCallUsage(progress, "mina", 125, DATE);
  progress = recordFriendCallUsage(progress, "mina", 999, DATE);
  assert.equal(friendCallSecondsRemaining(progress, "mina", DATE), 0);
  assert.equal(friendCallSecondsRemaining(progress, "juno", DATE), FRIEND_CALL_DAILY_SECONDS);
  assert.equal(friendCallSecondsRemaining(progress, "mina", "2050-04-02"), FRIEND_CALL_DAILY_SECONDS);

  const protectedProgress = recordFriendCallUsage(progress, "mina", 10, "2050-03-31");
  assert.deepEqual(protectedProgress.friendCallUsage.mina, { date: DATE, seconds: FRIEND_CALL_DAILY_SECONDS });
});

function resultState(overrides = {}) {
  return {
    phase: "result",
    targetId: "mina",
    accusedId: "noel",
    claimId: "changed",
    responseId: "double-down",
    outcome: "win",
    selectedId: "noel",
    facts: {
      mina: { impacts: { seen: 15, machine: 26, changed: 4 } },
      juno: { impacts: { seen: -26, machine: -12, changed: 0 } },
      noel: { impacts: { seen: 6, machine: 3, changed: 24 } },
    },
    leanHistory: { afterEvidence: [{ voterId: "mina", candidateId: "mina" }] },
    votes: [{ voterId: "mina", candidateId: "noel" }],
    ...overrides,
  };
}

function accepted(characterId, date = DATE, suffix = "a") {
  return acceptPersonalQuest(createProgression(), characterId, {
    date,
    id: `${characterId}:${date}:${suffix}`,
  });
}

function successfulState(characterId) {
  if (characterId === "juno") {
    return resultState({ targetId: "mina", accusedId: "noel", claimId: "changed" });
  }
  if (characterId === "noel") {
    return resultState({ responseId: "check-time" });
  }
  return resultState();
}

function finishDay(progress, characterId, date, suffix = "x") {
  const withQuest = acceptPersonalQuest(progress, characterId, { date, id: `${characterId}:${date}:${suffix}` });
  const settled = settlePersonalQuest(withQuest, successfulState(characterId), { date });
  return markDebriefViewed(settled.progress, { date });
}

test("미나 퀘스트는 증거 직후와 최종 투표에서 미나의 표가 바뀌어야 성공한다", () => {
  const quest = accepted("mina").activeQuest;
  assert.equal(evaluatePersonalQuest(quest, resultState()), true);
  assert.equal(evaluatePersonalQuest(quest, resultState({ votes: [{ voterId: "mina", candidateId: "mina" }] })), false);
});

test("주노 퀘스트는 다른 대상을 공격하고 구조화된 강한 연결을 사용해야 성공한다", () => {
  const quest = accepted("juno").activeQuest;
  assert.equal(evaluatePersonalQuest(quest, resultState()), true);
  assert.equal(evaluatePersonalQuest(quest, resultState({ targetId: "noel" })), false);
  assert.equal(evaluatePersonalQuest(quest, resultState({ claimId: "machine" })), false);
});

test("노엘 퀘스트는 반박 뒤 증거 대상으로 화제를 돌리지 않아야 성공한다", () => {
  const quest = accepted("noel").activeQuest;
  assert.equal(evaluatePersonalQuest(quest, resultState({ responseId: "double-down" })), true);
  assert.equal(evaluatePersonalQuest(quest, resultState({ responseId: "return-evidence" })), false);
});

test("개인 퀘스트 판정은 기존 게임 상태·승패·투표를 변경하지 않는다", () => {
  let state = createGame({ caseIndex: 0, locale: "ko" });
  state = plantEvidence(state, "juno");
  state = applyLie(state, "noel", "machine");
  state = applyResponse(state, "double-down");
  const result = resolveVote(state);
  const snapshot = structuredClone(result);
  settlePersonalQuest(accepted("juno"), result, { date: DATE });
  assert.deepEqual(result, snapshot);
});

test("활성 개인 퀘스트는 한 번에 하나만 유지한다", () => {
  const first = accepted("mina");
  const second = acceptPersonalQuest(first, "juno", { date: DATE, id: "juno:blocked" });
  assert.equal(second.activeQuest.characterId, "mina");
  assert.equal(second.activeQuest.id, first.activeQuest.id);
});

test("친밀도는 성공 +3·실패 +1이고 한 판에 한 번만 증가한다", () => {
  const success = settlePersonalQuest(accepted("mina"), resultState(), { date: DATE });
  assert.equal(success.progress.affinity.mina, 3);
  const duplicate = settlePersonalQuest(success.progress, resultState(), { date: DATE });
  assert.equal(duplicate.progress.affinity.mina, 3);
  assert.equal(duplicate.result.awarded, false);

  const failure = settlePersonalQuest(accepted("juno"), resultState({ targetId: "noel" }), { date: DATE });
  assert.equal(failure.progress.affinity.juno, 1);
});

test("같은 날짜에는 조건을 반복해도 직업 단서를 한 번만 지급한다", () => {
  const first = finishDay(createProgression(), "mina", DATE, "1");
  const second = finishDay(first.progress, "juno", DATE, "2");
  assert.equal(first.progress.clues.length, 1);
  assert.equal(second.progress.clues.length, 1);
  assert.equal(second.clue, null);
});

test("서로 다른 5일에는 단서 5개와 사립탐정을 해금한다", () => {
  let progress = createProgression();
  for (let day = 1; day <= 5; day += 1) {
    const date = `2050-04-0${day}`;
    progress = finishDay(progress, ["mina", "juno", "noel"][day % 3], date, String(day)).progress;
  }
  assert.equal(progress.clues.length, 5);
  assert.ok(progress.unlockedJobs.includes(PRIVATE_DETECTIVE_ID));
});

test("하루를 건너뛰어도 서로 다른 날짜 진행도는 유지된다", () => {
  const first = finishDay(createProgression(), "mina", "2050-04-01").progress;
  const third = finishDay(first, "juno", "2050-04-03").progress;
  assert.deepEqual(third.clueDates, ["2050-04-01", "2050-04-03"]);
});

test("시스템 날짜가 뒤로 가도 이미 획득한 단서를 삭제하지 않는다", () => {
  const later = finishDay(createProgression(), "mina", "2050-04-05").progress;
  const earlier = finishDay(later, "noel", "2050-04-02").progress;
  assert.equal(earlier.clues.length, 2);
  assert.ok(earlier.clueDates.includes("2050-04-05"));
});

test("단서 4개에서는 사립탐정이 잠겨 있다", () => {
  let progress = createProgression();
  for (let day = 1; day <= 4; day += 1) progress = finishDay(progress, "mina", `2050-04-0${day}`, String(day)).progress;
  assert.equal(progress.unlockedJobs.includes(PRIVATE_DETECTIVE_ID), false);
});

test("단서 5개에서만 사립탐정 장착을 저장할 수 있다", () => {
  let progress = createProgression();
  assert.equal(isPrivateDetectiveEquipped(setEquippedJob(progress, PRIVATE_DETECTIVE_ID)), false);
  for (let day = 1; day <= 5; day += 1) progress = finishDay(progress, "mina", `2050-04-0${day}`, String(day)).progress;
  progress = setEquippedJob(progress, PRIVATE_DETECTIVE_ID);
  assert.equal(isPrivateDetectiveEquipped(progress), true);
  assert.equal(createProgression(JSON.parse(JSON.stringify(progress))).equippedJob, PRIVATE_DETECTIVE_ID);
});

test("사립탐정으로 조사한 인물은 그 판의 직접 공격 대상이 될 수 없다", () => {
  assert.equal(isAttackAllowed("mina", "mina"), false);
  assert.equal(isAttackAllowed("mina", "juno"), true);
  assert.equal(isAttackAllowed(null, "mina"), true);
});

test("사립탐정을 장착하지 않으면 기존 게임 결과가 완전히 동일하다", () => {
  let first = createGame({ caseIndex: 3, subquestId: "redirect", locale: "ko" });
  first = resolveVote(applyResponse(applyLie(plantEvidence(first, "mina"), "juno", "changed"), "check-time"));
  let second = createGame({ caseIndex: 3, subquestId: "redirect", locale: "ko" });
  second = resolveVote(applyResponse(applyLie(plantEvidence(second, "mina"), "juno", "changed"), "check-time"));
  assert.deepEqual(second, first);
});

test("완료 퀘스트를 닫아도 이미 지급한 친밀도는 유지된다", () => {
  const settled = settlePersonalQuest(accepted("mina"), resultState(), { date: DATE }).progress;
  const dismissed = dismissCompletedQuest(settled);
  assert.equal(dismissed.activeQuest, null);
  assert.equal(dismissed.affinity.mina, 3);
});

test("실패 퀘스트의 +1 결과도 저장 후 다시 읽을 수 있다", () => {
  const date = "2050-08-22";
  const accepted = acceptPersonalQuest(createProgression(), "mina", { date, id: "failed-roundtrip" });
  const settled = settlePersonalQuest(accepted, resultState({
    votes: [{ voterId: "mina", candidateId: "mina" }],
  }), { date });
  const restored = createProgression(JSON.parse(JSON.stringify(settled.progress)));
  assert.equal(restored.activeQuest.status, "completed");
  assert.equal(restored.activeQuest.completed, false);
  assert.equal(restored.activeQuest.affinityDelta, 1);
  assert.equal(restored.affinity.mina, 1);
});

test("로컬 날짜 함수는 테스트에서 날짜를 주입할 수 있다", () => {
  assert.equal(localDateKey(new Date(2050, 3, 7, 23, 59)), "2050-04-07");
});

test("잘못되거나 오래된 로컬 저장 데이터는 안전한 초기 상태로 복구한다", () => {
  const recovered = createProgression({
    version: 999,
    affinity: { mina: -5 },
    activeQuest: { id: "bad" },
    clueDates: ["not-a-date"],
    clues: [{ id: "wrong" }],
    unlockedJobs: ["god-mode"],
    equippedJob: PRIVATE_DETECTIVE_ID,
  });
  assert.deepEqual(recovered, createProgression());
});

test("기존 저장 데이터는 초기 AI 레벨로 이관되고 레벨은 판마다 한 번만 오른다", () => {
  const migrated = createProgression({ version: 1, affinity: { mina: 7, juno: 2, noel: 1 } });
  assert.deepEqual(migrated.crewLevels, INITIAL_CREW_LEVELS);
  assert.equal(migrated.affinity.mina, 7);

  const gameState = { phase: "result", roundId: "round-level-1" };
  const first = awardCrewLevels(migrated, gameState);
  assert.deepEqual(first.progress.crewLevels, { mina: 3, juno: 5, noel: 4 });
  assert.ok(first.growth);
  const duplicate = awardCrewLevels(first.progress, gameState);
  assert.deepEqual(duplicate.progress.crewLevels, first.progress.crewLevels);
  assert.equal(duplicate.growth, null);
});

test("AI 레벨은 50에서 멈추고 하드 모드 선택은 저장된다", () => {
  const capped = createProgression({
    version: 2,
    crewLevels: { mina: 50, juno: 50, noel: 50 },
  });
  assert.equal(awardCrewLevels(capped, { phase: "result", roundId: "cap" }).growth, null);
  const hard = setDifficultyMode(capped, "hard");
  assert.equal(createProgression(JSON.parse(JSON.stringify(hard))).difficultyMode, "hard");
  assert.equal(setDifficultyMode(hard, "invalid").difficultyMode, "normal");
});
