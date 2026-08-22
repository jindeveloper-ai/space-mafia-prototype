from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from account_api import (  # noqa: E402
    AccountError,
    CREW_IDS,
    SupabaseBackend,
    merge_progression,
    merge_snapshots,
    sanitize_chat_messages,
    sanitize_match,
    sanitize_progression,
)


class AccountDataTests(unittest.TestCase):
    def test_progression_merge_never_reduces_earned_values(self):
        merged = merge_progression(
            {
                "version": 2,
                "affinity": {"mina": 9, "juno": 1, "noel": 0},
                "crewLevels": {"mina": 8, "juno": 4, "noel": 3},
                "leveledRoundIds": ["local"],
                "rewardedQuestIds": ["quest-local"],
            },
            {
                "version": 2,
                "affinity": {"mina": 3, "juno": 7, "noel": 2},
                "crewLevels": {"mina": 2, "juno": 10, "noel": 5},
                "leveledRoundIds": ["cloud"],
                "rewardedQuestIds": ["quest-cloud"],
            },
        )
        self.assertEqual(merged["affinity"], {"mina": 9, "juno": 7, "noel": 2})
        self.assertEqual(merged["crewLevels"], {"mina": 8, "juno": 10, "noel": 5})
        self.assertEqual(set(merged["leveledRoundIds"]), {"local", "cloud"})
        self.assertEqual(set(merged["rewardedQuestIds"]), {"quest-local", "quest-cloud"})

    def test_snapshot_merge_is_idempotent(self):
        local = {
            "profile": {"name": "수진", "locale": "ko", "updatedAt": 100},
            "archiveDates": ["2026-08-20"],
            "matches": [{"roundId": "r1", "outcome": "win"}],
            "chats": {"mina": [{"id": "m1", "sender": "player", "body": "안녕"}]},
        }
        once = merge_snapshots(local, {})
        twice = merge_snapshots(local, once)
        self.assertEqual(once["profile"], twice["profile"])
        self.assertEqual(once["archiveDates"], twice["archiveDates"])
        self.assertEqual(len(twice["matches"]), 1)
        self.assertEqual(len(twice["chats"]["mina"]), 1)

    def test_untrusted_payload_is_bounded_and_structured(self):
        progress = sanitize_progression({
            "affinity": {"mina": 99_999},
            "crewLevels": {"juno": -5},
            "unlockedJobs": ["admin", "private-detective"],
            "equippedJob": "admin",
        })
        self.assertEqual(progress["affinity"]["mina"], 999)
        self.assertEqual(progress["crewLevels"]["juno"], 1)
        self.assertEqual(progress["unlockedJobs"], ["private-detective"])
        self.assertIsNone(progress["equippedJob"])
        self.assertIsNone(sanitize_match({"roundId": ""}))
        self.assertEqual(sanitize_chat_messages("unknown", []), [])
        self.assertEqual(
            set(sanitize_chat_messages("mina", [{"id": "1", "sender": "character", "body": "ok"}])[0]),
            {"id", "sender", "body", "createdAt", "modelMode"},
        )

    def test_all_character_ids_are_stable(self):
        self.assertEqual(CREW_IDS, ("mina", "juno", "noel"))


class AccountConfigTests(unittest.TestCase):
    def test_public_config_is_disabled_without_environment(self):
        with patch.dict(os.environ, {}, clear=True):
            backend = SupabaseBackend()
        self.assertEqual(backend.public_config()["enabled"], False)
        self.assertEqual(backend.public_config()["providers"], {"google": False, "email": False})
        self.assertNotIn("service", " ".join(backend.public_config().keys()).lower())

    def test_public_config_never_returns_service_role_key(self):
        values = {
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "public-value",
            "SUPABASE_SERVICE_ROLE_KEY": "must-not-leak",
            "SUPABASE_GOOGLE_ENABLED": "true",
            "SUPABASE_EMAIL_ENABLED": "true",
        }
        with patch.dict(os.environ, values, clear=True):
            backend = SupabaseBackend()
        self.assertNotIn("must-not-leak", str(backend.public_config()))

    def test_public_config_exposes_google_and_email_only_when_configured(self):
        values = {
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_PUBLISHABLE_KEY": "public-value",
            "SUPABASE_GOOGLE_ENABLED": "true",
            "SUPABASE_EMAIL_ENABLED": "true",
        }
        with patch("account_api.PyJWKClient", return_value=object()), patch.dict(os.environ, values, clear=True):
            backend = SupabaseBackend()
        self.assertEqual(backend.public_config()["providers"], {"google": True, "email": True})

    def test_upstream_url_rejects_unsafe_schemes_and_absolute_paths(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "file:///tmp/data", "SUPABASE_PUBLISHABLE_KEY": "public"}, clear=True):
            backend = SupabaseBackend()
        self.assertEqual(backend.public_config()["enabled"], False)

        with patch.dict(os.environ, {"SUPABASE_URL": "https://project.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "public"}, clear=True):
            backend = SupabaseBackend()
        with self.assertRaisesRegex(AccountError, "invalid_upstream_path"):
            backend._request_sync("GET", "file:///etc/passwd")


if __name__ == "__main__":
    unittest.main()
