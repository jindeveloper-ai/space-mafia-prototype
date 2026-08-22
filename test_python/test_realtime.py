import os
import unittest
from unittest.mock import patch

from scripts.realtime import RealtimeError, _session_config, safety_identifier


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
        self.assertNotIn("turn_detection", session["audio"]["input"])

    def test_incompatible_legacy_transcription_model_falls_back_to_live_model(self):
        with patch.dict(os.environ, {"OPENAI_TRANSCRIBE_MODEL": "gpt-transcribe"}, clear=False):
            session = _session_config("transcription", "ko", None)
        self.assertEqual(session["audio"]["input"]["transcription"]["model"], "gpt-live-transcribe")

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
        self.assertEqual(mina["model"], "gpt-realtime-2.1-mini")
        self.assertNotIn("api_key", mina)

    def test_invalid_speaker_is_rejected_before_upstream(self):
        with self.assertRaises(RealtimeError) as context:
            _session_config("speech", "ko", "player")
        self.assertEqual(context.exception.status, 400)

    def test_safety_identifier_is_stable_hash_without_raw_ip(self):
        with patch.dict(os.environ, {"OPENAI_SAFETY_SALT": "test-salt"}, clear=False):
            first = safety_identifier("203.0.113.7")
            second = safety_identifier("203.0.113.7")
        self.assertEqual(first, second)
        self.assertEqual(len(first), 64)
        self.assertNotIn("203.0.113.7", first)


if __name__ == "__main__":
    unittest.main()
