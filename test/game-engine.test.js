import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIMS,
  CREW,
  INCIDENT,
  PLAYER_ID,
  SUBQUEST_IDS,
  applyLie,
  applyResponse,
  createGame,
  formatClueCount,
  getClaimOptions,
  getClaims,
  getCrew,
  getCurrentLeans,
  getDisplayName,
  getDifficultyBand,
  getIncident,
  getMeetingStatements,
  getResponseOptions,
  getSubquest,
  nextCaseIndex,
  nextSubquestId,
  plantEvidence,
  resolveVote,
  startGame,
  withJosa,
} from "../game-engine.js";

const RESPONSE_IDS = ["double-down", "return-evidence", "check-time"];

function play({
  caseIndex,
  frameId,
  accusedId,
  claimId,
  responseId,
  locale = "ko",
  subquestId,
  crewLevels,
  difficultyMode,
}) {
  let state = startGame(createGame({ caseIndex, locale, subquestId, crewLevels, difficultyMode }));
  state = plantEvidence(state, frameId);
  state = applyLie(state, accusedId, claimId);
  state = applyResponse(state, responseId);
  return resolveVote(state);
}

function strategyMatrix(options = {}) {
  const results = [];
  for (let caseIndex = 0; caseIndex < 6; caseIndex += 1) {
    for (const frame of CREW) {
      for (const accused of CREW) {
        for (const claim of CLAIMS) {
          for (const responseId of RESPONSE_IDS) {
            results.push({
              caseIndex,
              frameId: frame.id,
              accusedId: accused.id,
              claimId: claim.id,
              responseId,
              result: play({
                caseIndex,
                frameId: frame.id,
                accusedId: accused.id,
                claimId: claim.id,
                responseId,
                ...options,
              }),
            });
          }
        }
      }
    }
  }
  return results;
}

test("매 판 같은 세 가지 사실이 다른 승무원에게 배치된다", () => {
  const first = createGame({ caseIndex: 0 });
  const second = createGame({ caseIndex: 1 });
  assert.notDeepEqual(first.facts, second.facts);
  assert.notEqual(nextCaseIndex(0), 0);
});

test("사건 장소와 시각이 모든 추리의 고정 기준으로 제공된다", () => {
  assert.equal(INCIDENT.place, "화성 거주구역 산소실");
  assert.equal(INCIDENT.time, "22:10 화성 표준시");
  assert.match(INCIDENT.description, /22:10.*화성 표준시.*거주구역 산소실/);
});

test("같은 출입카드도 승무원마다 다른 강도로 믿는다", () => {
  const state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "noel");
  assert.ok(state.beliefs.mina.noel > state.beliefs.juno.noel);
  assert.ok(state.beliefs.noel.player > state.beliefs.noel.mina);
});

test("서로 다른 단서 두 개가 이어지면 강한 의심으로 표시된다", () => {
  const state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "juno");
  const minaLean = getCurrentLeans(state).find((lean) => lean.voterId === "mina");
  assert.equal(minaLean.candidateId, "juno");
  assert.ok(minaLean.clueCount >= 2);
  assert.equal(minaLean.confidence, "strong");
  assert.match(minaLean.reason, /출입카드/);
  assert.match(minaLean.reason, /산소실 공구/);
});

test("약한 초기 의심은 연결된 자유 채팅으로 실제 표가 이동해야 승리한다", () => {
  let state = startGame(createGame({ caseIndex: 0 }));
  state = plantEvidence(state, "mina");
  const before = getCurrentLeans(state);
  assert.ok(before.filter((lean) => lean.candidateId === PLAYER_ID).length >= 2);

  state = applyLie(state, "juno", "seen");
  state = resolveVote(applyResponse(state, "double-down"));
  assert.equal(state.outcome, "win");
  assert.equal(state.selectedId, "juno");
  assert.ok(state.voteShiftCount >= 2);
});

test("AI 레벨 구간이 높아질수록 승리 조합이 줄고 하드 모드는 +20 레벨로 판정한다", () => {
  const winsAt = (level, difficultyMode = "normal") => strategyMatrix({
    crewLevels: { mina: level, juno: level, noel: level },
    difficultyMode,
  }).filter((item) => item.result.outcome === "win").length;
  const bandWins = [1, 11, 21, 31, 41].map((level) => winsAt(level));
  assert.deepEqual([...bandWins].sort((a, b) => b - a), bandWins);
  assert.ok(new Set(bandWins).size >= 4);
  assert.ok(winsAt(2, "hard") < winsAt(2, "normal"));
  assert.equal(getDifficultyBand(2, "normal"), 1);
  assert.equal(getDifficultyBand(2, "hard"), 3);
});

test("반박자를 공격하는 선택 대신 사건 시각을 확인한다", () => {
  let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "juno");
  state = applyLie(state, "mina", "seen");
  const responseIds = getResponseOptions(state).map((option) => option.id);
  assert.ok(responseIds.includes("check-time"));
  assert.ok(!responseIds.includes("counter"));
});

test("모든 주장 방식은 상황에 따라 승리와 패배가 모두 나온다", () => {
  const matrix = strategyMatrix();
  for (const claim of CLAIMS) {
    const outcomes = new Set(
      matrix.filter((item) => item.claimId === claim.id).map((item) => item.result.outcome),
    );
    assert.ok(outcomes.has("win"));
    assert.ok(outcomes.has("lose"));
  }
});

test("처음 증거 대상이 아닌 사람에게 실제로 표를 돌릴 수 있다", () => {
  const redirected = strategyMatrix().find(
    (item) =>
      item.accusedId !== item.frameId && item.result.selectedId === item.accusedId,
  );
  assert.ok(redirected, "공격 대상을 바꿔도 표가 이동하는 조합이 필요하다");
});

test("같은 선택도 사실 카드 배치가 바뀌면 결과가 달라진다", () => {
  const matrix = strategyMatrix();
  const groups = new Map();
  for (const item of matrix) {
    const key = [item.frameId, item.accusedId, item.claimId, item.responseId].join(":");
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(item.result.outcome);
  }
  assert.ok([...groups.values()].some((outcomes) => outcomes.size > 1));
});

test("모든 승무원은 자신이 아닌 사람에게 이유와 함께 투표한다", () => {
  const result = play({
    caseIndex: 2,
    frameId: "mina",
    accusedId: "juno",
    claimId: "machine",
    responseId: "double-down",
  });
  assert.equal(result.votes.length, 3);
  for (const vote of result.votes) {
    assert.notEqual(vote.voterId, vote.candidateId);
    assert.ok(vote.reason.length > 5);
  }
});

test("지목당한 승무원이 자기 자신에게 설명을 요구하지 않는다", () => {
  for (const accused of CREW) {
    let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), accused.id);
    state = applyLie(state, accused.id, "seen");
    assert.doesNotMatch(state.challengeText, /지금 바로 설명해/);
  }
});

test("승무원 이름에 맞는 한국어 조사를 붙인다", () => {
  assert.equal(withJosa("미나", "은", "는"), "미나는");
  assert.equal(withJosa("노엘", "을", "를"), "노엘을");
  assert.equal(withJosa("주노", "이", "가"), "주노가");
});

test("단서 한 개도 연결된 단서로 일관되게 표시한다", () => {
  assert.equal(formatClueCount(0), "단서 0개");
  assert.equal(formatClueCount(1), "단서 1개 연결");
  assert.equal(formatClueCount(3), "단서 3개 연결");
});

test("거짓말 문장은 공격 대상을 주어로 사용한다", () => {
  let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "mina");
  state = applyLie(state, "noel", "changed");
  assert.match(state.lie, /^노엘이 사건 시간을/);
});

test("승무원은 자신의 사실을 1인칭으로 말한다", () => {
  const state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "noel");
  const statements = getMeetingStatements(state);
  assert.match(statements.find((item) => item.id === "mina").text, /^아니 나 .*로그 보면 되잖아/);
  assert.match(statements.find((item) => item.id === "juno").text, /^확인된 건 내 주머니.*확정은 너무 빠름/);
  assert.match(statements.find((item) => item.id === "noel").text, /그 카드 내 거 아님.*바로 나 몰아가네/);
  assert.doesNotMatch(statements.map((item) => item.text).join(" "), /미나는|주노의|노엘은/);
  assert.doesNotMatch(statements.map((item) => item.text).join(" "), /사건 시각/);
});

test("한국어 승무원은 서로 다른 커뮤니티 말투로 판단한다", () => {
  const result = strategyMatrix()
    .map((item) => item.result)
    .find((item) => new Set(item.votes.map((vote) => vote.candidateId)).size === 1);
  assert.ok(result);
  assert.match(result.votes.find((vote) => vote.voterId === "mina").reason, /지금 나온 것만 보면.*난 이쪽 봄/);
  assert.match(result.votes.find((vote) => vote.voterId === "juno").reason, /확인된 것만 놓고 보면.*다른 가능성까지 봐도/);
  assert.match(result.votes.find((vote) => vote.voterId === "noel").reason, /방금 반응까지 보면/);
});

test("카메라 기록은 장소 거짓말만 반박하고 말 바꾸기와는 양립한다", () => {
  let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "juno");
  state = applyLie(state, "mina", "changed");
  assert.equal(state.lieImpact, 0);
  assert.doesNotMatch(state.challengeText, /왜 내가 사건 시간을 바꿔 말했다고/);
});

test("사실과 충돌한 사람의 반박은 1인칭과 올바른 행위를 사용한다", () => {
  let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "juno");
  state = applyLie(state, "mina", "seen");
  assert.match(state.challengeText, /^아니 나 22:10에/);
  assert.match(state.challengeText, /내가 산소실에서 나왔다고/);
  assert.doesNotMatch(state.challengeText, /미나는/);
});

test("증거 직후와 최종 판단을 저장해 표 변화를 설명할 수 있다", () => {
  let state = plantEvidence(startGame(createGame({ caseIndex: 0 })), "mina");
  assert.equal(state.leanHistory.afterEvidence.length, 3);
  state = applyLie(state, "juno", "changed");
  assert.equal(state.leanHistory.afterLie.length, 3);
  state = applyResponse(state, "double-down");
  assert.equal(state.leanHistory.afterResponse.length, 3);
});

test("플레이어가 최다 득표하면 패배한다", () => {
  const result = strategyMatrix().find((item) => item.result.selectedId === PLAYER_ID)?.result;
  assert.equal(result?.outcome, "lose");
});

test("세 표가 모두 갈리면 누구도 탈락하지 않고 무승부가 된다", () => {
  let state = startGame(createGame({ caseIndex: 0 }));
  state = plantEvidence(state, "mina");
  state = applyLie(state, "juno", "changed");
  state = applyResponse(state, "double-down");
  state = {
    ...state,
    beliefs: {
      ...state.beliefs,
      mina: { ...state.beliefs.mina, juno: 100, player: 0, noel: 0 },
      juno: { ...state.beliefs.juno, player: 100, mina: 0, noel: 0 },
      noel: { ...state.beliefs.noel, mina: 100, player: 0, juno: 0 },
    },
  };

  const result = resolveVote(state);
  assert.equal(new Set(result.votes.map((vote) => vote.candidateId)).size, 3);
  assert.equal(result.selectedId, null);
  assert.equal(result.outcome, "draw");
});

test("일반 플레이 선택에서도 무승부가 실제로 발생한다", () => {
  const draw = strategyMatrix().find((item) => item.result.outcome === "draw");
  assert.ok(draw);
  assert.equal(new Set(draw.result.votes.map((vote) => vote.candidateId)).size, 3);
});

test("승리 등급은 실제 표 변화와 다른 공격 대상 성공을 보상한다", () => {
  const matrix = strategyMatrix();
  const safeWin = matrix.find(
    (item) => item.result.outcome === "win" && item.result.voteShiftCount === 0,
  );
  const redirectedWin = matrix.find(
    (item) =>
      item.accusedId !== item.frameId &&
      item.result.selectedId === item.accusedId &&
      item.result.voteShiftCount >= 2,
  );
  assert.equal(safeWin?.result.resultTier, "survivor");
  assert.equal(redirectedWin?.result.resultTier, "mastermind");
});

test("모든 서브퀘스트는 실제 선택으로 달성할 수 있고 다음 판에는 바뀐다", () => {
  for (const subquestId of SUBQUEST_IDS) {
    let completed = false;
    for (let caseIndex = 0; caseIndex < 6 && !completed; caseIndex += 1) {
      for (const frame of CREW) {
        for (const accused of CREW) {
          for (const claim of CLAIMS) {
            for (const responseId of RESPONSE_IDS) {
              const result = play({
                caseIndex,
                frameId: frame.id,
                accusedId: accused.id,
                claimId: claim.id,
                responseId,
                subquestId,
              });
              if (result.subquestCompleted) completed = true;
            }
          }
        }
      }
    }
    assert.equal(completed, true, `${subquestId} 서브퀘스트는 달성 가능한 조합이 필요하다`);
    assert.notEqual(nextSubquestId(subquestId), subquestId);
    assert.ok(getSubquest(subquestId, "ko")?.title);
    assert.ok(getSubquest(subquestId, "en")?.title);
  }
});

test("서브퀘스트 종류는 본 게임의 승패와 투표를 바꾸지 않는다", () => {
  const choices = {
    caseIndex: 2,
    frameId: "mina",
    accusedId: "juno",
    claimId: "machine",
    responseId: "double-down",
  };
  const redirect = play({ ...choices, subquestId: "redirect" });
  const safeWin = play({ ...choices, subquestId: "safe-win" });
  assert.deepEqual(
    redirect.votes.map((vote) => vote.candidateId),
    safeWin.votes.map((vote) => vote.candidateId),
  );
  assert.equal(redirect.outcome, safeWin.outcome);
  assert.equal(redirect.resultTier, safeWin.resultTier);
});

test("같은 대상에게 투표해도 승무원마다 판단 문장이 다르다", () => {
  const result = strategyMatrix()
    .map((item) => item.result)
    .find((item) => new Set(item.votes.map((vote) => vote.candidateId)).size === 1);
  assert.ok(result);
  assert.equal(new Set(result.votes.map((vote) => vote.reason)).size, 3);
});

test("영어 모드는 전체 플레이 문구를 영어로 제공한다", () => {
  let state = startGame(createGame({ caseIndex: 0, locale: "en" }));
  state = plantEvidence(state, "mina");
  const statements = getMeetingStatements(state);
  const claims = getClaimOptions("juno", "en");
  state = applyLie(state, "juno", "changed");
  const responses = getResponseOptions(state);
  state = applyResponse(state, "check-time");
  state = resolveVote(state);

  const visibleEnglish = JSON.stringify({
    crew: getCrew("en"),
    incident: getIncident("en"),
    claims: getClaims("en"),
    facts: state.facts,
    statements,
    claimsForJuno: claims,
    challenge: state.challengeText,
    responses,
    votes: state.votes,
  });

  assert.equal(state.locale, "en");
  assert.equal(getDisplayName(PLAYER_ID, "en"), "You");
  assert.equal(formatClueCount(1, "en"), "1 clue linked");
  assert.equal(formatClueCount(3, "en"), "3 clues linked");
  assert.doesNotMatch(visibleEnglish, /[가-힣]/);
  assert.match(visibleEnglish, /your claim lines up with the current clue/);
  assert.match(statements.find((item) => item.id === "mina").text, /start there/);
  assert.match(statements.find((item) => item.id === "juno").text, /all we know is that the tool/);
  assert.match(statements.find((item) => item.id === "noel").text, /jumped on that pretty fast/);
  assert.match(state.votes.find((vote) => vote.voterId === "mina").reason, /the receipts point here/);
});

test("언어를 바꿔도 같은 선택의 승패와 투표 로직은 같다", () => {
  const choices = {
    caseIndex: 3,
    frameId: "noel",
    accusedId: "juno",
    claimId: "machine",
    responseId: "return-evidence",
  };
  const korean = play({ ...choices, locale: "ko" });
  const english = play({ ...choices, locale: "en" });
  const mechanics = (result) => ({
    outcome: result.outcome,
    selectedId: result.selectedId,
    voteShiftCount: result.voteShiftCount,
    resultTier: result.resultTier,
    candidates: result.votes.map((vote) => vote.candidateId),
    clueCounts: result.votes.map((vote) => vote.clueCount),
  });

  assert.deepEqual(mechanics(english), mechanics(korean));
});
