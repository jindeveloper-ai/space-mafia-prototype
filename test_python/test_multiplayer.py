"""Focused tests for the server-authoritative two-human game."""

import asyncio
import json
import os
from pathlib import Path
import random
import sys
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from multiplayer import RoomError, RoomManager, apply_interpretation, resolve_result  # noqa: E402
import multiplayer_ai  # noqa: E402
from multiplayer_ai import generate_ai_reply, interpret_message  # noqa: E402


class Clock:
    def __init__(self):
        self.value = 1_000.0

    def __call__(self):
        return self.value


class MultiplayerEngineTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.manager = RoomManager(clock=self.clock, random_source=random.Random(7))
        self.action_number = 0

    def action(self, room):
        self.action_number += 1
        return {"action_id": f"a-{self.action_number}", "expected_seq": room.event_seq}

    def create_pair(self, locale="ko"):
        room, first = self.manager.create_room(name="Host", avatar_id="astronaut-purple", locale=locale)
        joined_room, second = self.manager.join_room(room.code, name="Guest", avatar_id="astronaut-green")
        self.assertIs(room, joined_room)
        self.manager.set_connected(room, first, True)
        self.manager.set_connected(room, second, True)
        return room, first, second

    def start_round(self, locale="ko"):
        room, first, second = self.create_pair(locale)
        self.manager.set_ready(room, first, ready=True, **self.action(room))
        self.manager.set_ready(room, second, ready=True, **self.action(room))
        self.assertEqual(room.phase, "role")
        return room, first, second

    def open_chat(self, locale="ko"):
        room, first, second = self.start_round(locale)
        self.manager.acknowledge_role(room, first, **self.action(room))
        self.manager.acknowledge_role(room, second, **self.action(room))
        mafia = room.mafia
        target = next(candidate_id for candidate_id in room.participant_ids if candidate_id != mafia.id)
        self.manager.plant_evidence(room, mafia, target_id=target, **self.action(room))
        self.manager.acknowledge_facts(room, first, **self.action(room))
        self.manager.acknowledge_facts(room, second, **self.action(room))
        self.assertEqual(room.phase, "chat")
        return room, first, second

    def test_room_creation_join_ready_and_random_first_roles(self):
        room, first, second = self.start_round()
        self.assertEqual(len(room.code), 6)
        self.assertNotEqual(first.token, second.token)
        self.assertEqual({first.role, second.role}, {"mafia", "citizen"})
        self.assertEqual(len(room.ai_ids), 2)
        self.assertNotIn(room.sitting_out_ai_id, room.ai_ids)

    def test_rematch_swaps_human_roles_then_rotates_characters(self):
        room, first, second = self.start_round()
        original_mafia = room.mafia.id
        room.phase = "result"
        room.result = {"outcome": "draw", "selectedId": None, "votes": []}
        self.manager.request_rematch(room, first, **self.action(room))
        self.manager.request_rematch(room, second, **self.action(room))
        self.assertEqual(room.round_number, 2)
        self.assertNotEqual(room.mafia.id, original_mafia)
        self.assertEqual(room.ai_ids, ("juno", "noel"))

    def test_private_role_evidence_and_vote_views_do_not_leak(self):
        room, first, second = self.start_round()
        first_view = self.manager.snapshot(room, first)
        second_view = self.manager.snapshot(room, second)
        self.assertNotEqual(first_view["self"]["role"], second_view["self"]["role"])
        self.assertTrue(all("role" not in player for player in first_view["players"]))
        self.manager.acknowledge_role(room, first, **self.action(room))
        self.manager.acknowledge_role(room, second, **self.action(room))
        mafia = room.mafia
        citizen = room.citizen
        self.assertEqual(self.manager.snapshot(room, mafia)["privateAction"]["type"], "plant_evidence")
        self.assertNotIn("privateAction", self.manager.snapshot(room, citizen))

    def test_only_citizen_votes_and_three_vote_outcomes(self):
        room, _, _ = self.open_chat()
        with self.assertRaisesRegex(RoomError, "forbidden_action"):
            self.manager.cast_vote(room, room.mafia, target_id=room.citizen.id, **self.action(room))

        mafia_id = room.mafia.id
        citizen_id = room.citizen.id
        first_ai, second_ai = room.ai_ids
        loss = resolve_result(room, mafia_id, {first_ai: mafia_id, second_ai: mafia_id})
        self.assertEqual(loss["outcome"], "mafia_loss")
        self.assertEqual(len(loss["votes"]), 3)

        room.phase = "chat"
        room.result = None
        win = resolve_result(room, first_ai, {first_ai: mafia_id, second_ai: first_ai})
        self.assertEqual(win["outcome"], "mafia_win")

        room.phase = "chat"
        room.result = None
        draw = resolve_result(room, mafia_id, {first_ai: second_ai, second_ai: first_ai})
        self.assertEqual(draw["outcome"], "draw")
        self.assertNotEqual(citizen_id, mafia_id)

    def test_chat_interpretation_updates_claims_but_never_votes(self):
        room, first, _ = self.open_chat()
        target = next(candidate_id for candidate_id in room.participant_ids if candidate_id != first.id)
        validated = apply_interpretation(
            room,
            first.id,
            {
                "targetId": target,
                "claimType": "machine",
                "isAccusation": True,
                "confidence": 0.9,
                "voteId": target,
                "outcome": "mafia_win",
            },
            "m1",
        )
        self.assertTrue(validated["isAccusation"])
        self.assertEqual(room.votes, {})
        self.assertIsNone(room.result)

    def test_target_changes_and_contradictions_are_detected(self):
        room, first, _ = self.open_chat()
        candidates = [candidate_id for candidate_id in room.participant_ids if candidate_id != first.id]
        apply_interpretation(room, first.id, {"targetId": candidates[0], "claimType": "seen", "isAccusation": True}, "m1")
        changed = apply_interpretation(room, first.id, {"targetId": candidates[1], "claimType": "machine", "isAccusation": True}, "m2")
        self.assertTrue(changed["targetChanged"])
        contradicted = apply_interpretation(room, first.id, {"targetId": candidates[1], "claimType": "changed", "isAccusation": True}, "m3")
        self.assertTrue(contradicted["contradictedEarlierClaim"])

    def test_duplicate_action_double_vote_and_rapid_duplicate_are_rejected(self):
        room, first, _ = self.open_chat()
        action = self.action(room)
        self.manager.add_human_message(room, first, message="Noel changed the time", **action)
        with self.assertRaisesRegex(RoomError, "duplicate_action"):
            self.manager.add_human_message(room, first, message="another", **action)
        with self.assertRaisesRegex(RoomError, "rapid_duplicate"):
            self.manager.add_human_message(room, first, message="Noel changed the time", **self.action(room))

    def test_reconnect_token_expiry_and_cross_room_isolation(self):
        room, first, second = self.create_pair()
        self.manager.set_connected(room, second, False)
        restored_room, restored_player = self.manager.authenticate(room.code, second.token)
        self.assertIs(restored_room, room)
        self.assertIs(restored_player, second)
        self.manager.set_connected(room, second, True)

        other_room, other_player = self.manager.create_room(name="Other", avatar_id="initial")
        with self.assertRaisesRegex(RoomError, "invalid_participant"):
            self.manager.authenticate(other_room.code, first.token)
        self.assertNotEqual(room.events, other_room.events)
        self.assertNotEqual(first.token, other_player.token)

        self.clock.value += 1_801
        self.manager.cleanup()
        with self.assertRaisesRegex(RoomError, "room_expired"):
            self.manager.get_room(room.code)

    def test_fallback_interpretation_and_two_character_replies_cost_zero(self):
        room, first, _ = self.open_chat(locale="en")
        previous_key = os.environ.pop("OPENAI_API_KEY", None)
        async def collect_replies(interpretation):
            return await asyncio.gather(*[
                generate_ai_reply(room, ai_id, first.id, "Juno changed the time twice", interpretation)
                for ai_id in room.ai_ids
            ])
        try:
            interpretation, interpretation_calls = asyncio.run(interpret_message(room, first.id, "Juno changed the time twice"))
            replies = asyncio.run(collect_replies(interpretation))
        finally:
            if previous_key is not None:
                os.environ["OPENAI_API_KEY"] = previous_key
        self.assertEqual(interpretation["claimType"], "changed")
        self.assertEqual(interpretation_calls, 0)
        self.assertEqual(len(replies), 2)
        self.assertTrue(all(message and count == 0 for message, count in replies))

    def test_live_message_uses_exactly_three_model_requests(self):
        room, first, _ = self.open_chat(locale="en")
        request_names = []

        def fake_structured(_instructions, _payload, schema_name, _schema, _max_tokens):
            request_names.append(schema_name)
            if schema_name == "friend_mode_interpretation":
                return {"targetId": room.ai_ids[0], "claimType": "changed", "isAccusation": True, "confidence": 0.8}
            return {"message": "that claim needs one more check.", "intent": "question", "suspectId": room.ai_ids[0]}

        async def exercise():
            interpretation, interpretation_calls = await interpret_message(room, first.id, "The time statement changed.")
            replies = await asyncio.gather(*[
                generate_ai_reply(room, ai_id, first.id, "The time statement changed.", interpretation)
                for ai_id in room.ai_ids
            ])
            return interpretation_calls, replies

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only"}), patch.object(multiplayer_ai, "call_structured", side_effect=fake_structured):
            interpretation_calls, replies = asyncio.run(exercise())

        self.assertEqual(interpretation_calls + sum(count for _, count in replies), 3)
        self.assertEqual(request_names[0], "friend_mode_interpretation")
        self.assertCountEqual(request_names[1:], [f"friend_mode_reply_{ai_id}" for ai_id in room.ai_ids])

    def test_consecutive_human_messages_keep_server_event_order(self):
        room, first, second = self.open_chat()
        first_item = self.manager.add_human_message(room, first, message="노엘의 시간이 바뀌었어", **self.action(room))
        second_item = self.manager.add_human_message(room, second, message="나는 주노 쪽을 의심해", **self.action(room))
        human_items = [item for item in room.transcript if item["kind"] == "human"]
        self.assertEqual([item["id"] for item in human_items], [first_item["id"], second_item["id"]])
        human_events = [event for event in room.events if event["type"] == "human_message"]
        self.assertEqual([event["messageId"] for event in human_events[-2:]], [first_item["id"], second_item["id"]])
        self.assertLess(human_events[-2]["seq"], human_events[-1]["seq"])

    def test_snapshot_is_json_safe_and_contains_no_tokens_or_api_key(self):
        room, first, second = self.open_chat()
        serialized = json.dumps(self.manager.snapshot(room, first), ensure_ascii=False)
        self.assertNotIn(first.token, serialized)
        self.assertNotIn(second.token, serialized)
        self.assertNotIn("OPENAI_API_KEY", serialized)
        self.assertNotIn("model_request_counts", serialized)


if __name__ == "__main__":
    unittest.main()
