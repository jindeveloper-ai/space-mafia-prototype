import os
import unittest
from unittest.mock import patch

from scripts.realtime import RealtimeError, _session_config, safety_identifier, sanitize_friend_call_context


class RealtimeConfigTests(unittest.TestCase):
    def test_transcription_session_uses_live_model_browser_vad_and_hints(self):
        with patch.dict(os.environ, {"OPENAI_TRANSCRIBE_MODEL": "gpt-transcribe"}, clear=False):
            session = _session_config("transcription", "ko", None)
        transcription = session["audio"]["input"]["transcription"]
        self.assertEqual(session["type"], "transcription")
        self.assertEqual(transcription["model"], "gpt-live-transcribe")
        self.assertEqual(transcription["languages"], ["ko"])
        self.assertIn("산소실", transcription["keywords"])
        self.assertEqual(transcription["delay"], "low")
        self.assertIsNone(session["audio"]["input"]["turn_detection"])

    def test_incompatible_legacy_transcription_model_falls_back_to_live_model(self):
        with patch.dict(os.environ, {"OPENAI_TRANSCRIBE_MODEL": "gpt-transcribe"}, clear=False):
            session = _session_config("transcription", "ko", None)
        self.assertEqual(session["audio"]["input"]["transcription"]["model"], "gpt-live-transcribe")

    def test_all_locale_transcription_hints_and_keywords_are_forwarded(self):
        expected = {
            "ko": ("ko", "산소실"),
            "en": ("en", "oxygen room"),
            "ja": ("ja", "酸素室"),
            "zh-CN": ("zh", "氧气室"),
            "zh-TW": ("zh", "氧氣室"),
            "yue-Hant-HK": ("zh", "粵語"),
            "es-419": ("es", "sala de oxígeno"),
        }
        for locale, (hint, keyword) in expected.items():
            with self.subTest(locale=locale):
                transcription = _session_config("transcription", locale, None)["audio"]["input"]["transcription"]
                self.assertEqual(transcription["languages"], [hint])
                self.assertIn(keyword, transcription["keywords"])

    def test_cantonese_voice_uses_zh_hint_with_explicit_hong_kong_instruction(self):
        transcription = _session_config("transcription", "yue-Hant-HK", None)["audio"]["input"]["transcription"]
        friend_call = _session_config("friend-call", "yue-Hant-HK", "mina", {"relationshipDays": 3})
        speech = _session_config("speech", "yue-Hant-HK", "juno")
        self.assertEqual(transcription["languages"], ["zh"])
        self.assertIn("Hong Kong Cantonese", transcription["prompt"])
        self.assertIn("時序", transcription["keywords"])
        self.assertEqual(friend_call["audio"]["input"]["transcription"]["languages"], ["zh"])
        self.assertIn("Hong Kong Cantonese", friend_call["audio"]["input"]["transcription"]["prompt"])
        self.assertIn("do not switch to Mandarin", friend_call["instructions"])
        self.assertIn("natural particles", friend_call["instructions"])
        self.assertIn("唔清楚", friend_call["instructions"])
        self.assertEqual(friend_call["model"], "gpt-realtime-2.1")
        self.assertEqual(speech["model"], "gpt-realtime-2.1")
        self.assertIn("Hong Kong Cantonese", speech["instructions"])

    def test_unsupported_locale_is_rejected_before_upstream(self):
        with self.assertRaises(RealtimeError) as context:
            _session_config("transcription", "fr-FR", None)
        self.assertEqual(context.exception.status, 400)

    def test_each_character_has_a_fixed_distinct_output_voice(self):
        mina = _session_config("speech", "ko", "mina")
        juno = _session_config("speech", "ko", "juno")
        noel = _session_config("speech", "en", "noel")
        voices = {
            mina["audio"]["output"]["voice"],
            juno["audio"]["output"]["voice"],
            noel["audio"]["output"]["voice"],
        }
        self.assertEqual(len(voices), 3)
        self.assertEqual(mina["audio"]["output"]["voice"], "marin")
        self.assertEqual(juno["audio"]["output"]["voice"], "cedar")
        self.assertEqual(noel["audio"]["output"]["voice"], "verse")
        self.assertEqual(mina["model"], "gpt-realtime-2.1-mini")
        self.assertNotIn("api_key", mina)

    def test_invalid_speaker_is_rejected_before_upstream(self):
        with self.assertRaises(RealtimeError) as context:
            _session_config("speech", "ko", "player")
        self.assertEqual(context.exception.status, 400)

    def test_friend_call_is_one_semantic_vad_session_with_earth_mars_context(self):
        session = _session_config("friend-call", "ko", "mina", {
            "playerName": "수진",
            "recentChat": [
                {"sender": "player", "body": "어제 경기 기억나?"},
                {"sender": "character", "body": "그 표는 좀 억울했음ㅋㅋ"},
            ],
            "lastMatch": {"outcome": "win", "accusedId": "juno", "stars": 2},
            "relationshipDays": 4,
        })
        self.assertEqual(session["type"], "realtime")
        self.assertEqual(session["audio"]["input"]["turn_detection"]["type"], "semantic_vad")
        self.assertEqual(session["audio"]["input"]["transcription"]["model"], "gpt-live-transcribe")
        self.assertEqual(session["audio"]["input"]["transcription"]["languages"], ["ko"])
        self.assertEqual(session["output_modalities"], ["audio"])
        self.assertIn("still lives on Earth", session["instructions"])
        self.assertIn("second-generation", session["instructions"])
        self.assertIn("natural Korean banmal", session["instructions"])
        self.assertIn("RELATIONSHIP_DAYS=4", session["instructions"])
        self.assertIn("familiar phone friends", session["instructions"])
        self.assertIn("caller is on Earth", session["instructions"])
        self.assertIn("Never call them a Mars resident", session["instructions"])
        self.assertIn("어제 경기 기억나?", session["instructions"])
        self.assertNotIn("api_key", session)

    def test_friend_call_tone_warms_by_distinct_call_days_without_inventing_memories(self):
        first = _session_config("friend-call", "ko", "juno", {"relationshipDays": 0})
        close = _session_config("friend-call", "ko", "noel", {"relationshipDays": 9})
        self.assertIn("first voice call", first["instructions"])
        self.assertIn("slightly hesitant", first["instructions"])
        self.assertIn("close long-running friends", close["instructions"])
        self.assertIn("Never invent a prior call", close["instructions"])

    def test_friend_call_context_is_bounded_and_structured(self):
        context = sanitize_friend_call_context({
            "playerName": "x" * 100,
            "recentChat": [{"sender": "player", "body": str(index) * 300} for index in range(12)],
            "lastMatch": {"outcome": "admin", "accusedId": "intruder", "stars": 99, "secret": "drop"},
            "relationshipDays": 999,
        }, "juno")
        self.assertEqual(len(context["playerName"]), 12)
        self.assertEqual(len(context["recentChat"]), 8)
        self.assertLessEqual(max(len(item["body"]) for item in context["recentChat"]), 180)
        self.assertEqual(context["lastMatch"], {
            "outcome": None,
            "evidenceTargetId": None,
            "accusedId": None,
            "claimId": None,
            "stars": 3,
        })
        self.assertEqual(context["relationshipDays"], 30)
        self.assertNotIn("secret", context["lastMatch"])

    def test_safety_identifier_is_stable_hash_without_raw_ip(self):
        with patch.dict(os.environ, {"OPENAI_SAFETY_SALT": "test-salt"}, clear=False):
            first = safety_identifier("203.0.113.7")
            second = safety_identifier("203.0.113.7")
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)
        self.assertNotIn("203.0.113.7", first)


if __name__ == "__main__":
    unittest.main()
