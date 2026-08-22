import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchRecord,
  mergeAccountSnapshot,
  mergeProgression,
  sanitizeChats,
  sanitizeMatches,
} from "../account-core.js";
import { createProgression } from "../progression.js";

test("account merge uses maxima for earned values and unions idempotent rewards", () => {
  const merged = mergeProgression(
    createProgression({
      version: 2,
      affinity: { mina: 9, juno: 1, noel: 0 },
      crewLevels: { mina: 4, juno: 4, noel: 3 },
      leveledRoundIds: ["local-round"],
      rewardedQuestIds: ["local-quest"],
    }),
    createProgression({
      version: 2,
      affinity: { mina: 3, juno: 7, noel: 2 },
      crewLevels: { mina: 2, juno: 8, noel: 5 },
      leveledRoundIds: ["cloud-round"],
      rewardedQuestIds: ["cloud-quest"],
    }),
    createProgression,
  );
  assert.deepEqual(merged.affinity, { mina: 9, juno: 7, noel: 2 });
  assert.deepEqual(merged.crewLevels, { mina: 4, juno: 8, noel: 5 });
  assert.deepEqual(new Set(merged.leveledRoundIds), new Set(["local-round", "cloud-round"]));
  assert.deepEqual(new Set(merged.rewardedQuestIds), new Set(["local-quest", "cloud-quest"]));
});

test("cloud active quest wins while an equipped job must be unlocked", () => {
  const merged = mergeAccountSnapshot({
    progression: { version: 2, activeQuest: null, equippedJob: "private-detective" },
  }, {
    progression: { version: 2, activeQuest: null, unlockedJobs: [] },
  }, createProgression);
  assert.equal(merged.progression.equippedJob, null);
});

test("chat and match sanitizers deduplicate stable client identifiers", () => {
  const chats = sanitizeChats({ mina: [
    { id: "m1", sender: "player", body: "first", createdAt: "2026-08-22T01:00:00Z" },
    { id: "m1", sender: "player", body: "latest", createdAt: "2026-08-22T01:00:01Z" },
  ] });
  assert.equal(chats.mina.length, 1);
  assert.equal(chats.mina[0].body, "latest");

  const matches = sanitizeMatches([
    { roundId: "r1", outcome: "win", playedAt: "2026-08-22T01:00:00Z" },
    { roundId: "r1", outcome: "lose", playedAt: "2026-08-22T01:01:00Z" },
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].outcome, "lose");
});

test("match record contains only structured engine output", () => {
  const record = buildMatchRecord({
    roundId: "round-1",
    phase: "result",
    difficultyMode: "hard",
    outcome: "win",
    targetId: "mina",
    accusedId: "noel",
    claimId: "changed",
    responseId: "check-time",
    selectedId: "noel",
    voteShiftCount: 2,
    votes: [{ voterId: "mina", candidateId: "noel", reason: "not persisted" }],
  }, "0.18.4");
  assert.equal(record.stars, 3);
  assert.deepEqual(record.votes, [{ voterId: "mina", candidateId: "noel" }]);
  assert.equal("reason" in record.votes[0], false);
});
