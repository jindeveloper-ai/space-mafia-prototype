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
    SIGNED_AVATAR_URL_SECONDS,
    SupabaseBackend,
    avatar_object_path,
    merge_progression,
    merge_snapshots,
    sanitize_chat_messages,
    sanitize_match,
    sanitize_progression,
    signed_storage_url,
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

    def test_friend_call_usage_is_bounded_and_merged_without_rollback(self):
        sanitized = sanitize_progression({
            "version": 3,
            "friendCallUsage": {
                "mina": {"date": "2050-04-01", "seconds": 999},
                "juno": {"date": "invalid", "seconds": 50},
            },
            "friendCallDates": {
                "mina": ["2050-04-02", "2050-04-01", "2050-04-02", "invalid"],
            },
        })
        self.assertEqual(sanitized["friendCallUsage"]["mina"], {"date": "2050-04-01", "seconds": 300})
        self.assertIsNone(sanitized["friendCallUsage"]["juno"])
        self.assertEqual(sanitized["friendCallDates"]["mina"], ["2050-04-01", "2050-04-02"])

        merged = merge_progression(
            {
                "version": 3,
                "friendCallUsage": {"mina": {"date": "2050-04-01", "seconds": 200}},
                "friendCallDates": {"mina": ["2050-04-01"]},
            },
            {
                "version": 3,
                "friendCallUsage": {"mina": {"date": "2050-04-02", "seconds": 10}},
                "friendCallDates": {"mina": ["2050-04-02"]},
            },
        )
        self.assertEqual(merged["friendCallUsage"]["mina"], {"date": "2050-04-02", "seconds": 10})
        self.assertEqual(merged["friendCallDates"]["mina"], ["2050-04-01", "2050-04-02"])


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


class AccountStorageSecurityTests(unittest.TestCase):
    def test_avatar_object_paths_are_owner_scoped_and_unpredictable(self):
        user_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        first = avatar_object_path(user_id, "image/webp")
        second = avatar_object_path(user_id, "image/webp")
        self.assertRegex(first, rf"^{user_id}/[A-Za-z0-9_-]{{32}}\.webp$")
        self.assertNotEqual(first, second)

    def test_signed_avatar_url_is_short_lived_and_origin_pinned(self):
        signed_path = "/object/sign/avatars/user/random.webp?token=temporary"
        self.assertEqual(SIGNED_AVATAR_URL_SECONDS, 60)
        self.assertEqual(
            signed_storage_url("https://project.supabase.co", signed_path),
            f"https://project.supabase.co/storage/v1{signed_path}",
        )
        for unsafe in (
            "https://evil.example/object/sign/avatars/user/file.webp?token=x",
            "/object/sign/other/user/file.webp?token=x",
            "/object/sign/avatars/user/file.webp",
        ):
            with self.subTest(unsafe=unsafe), self.assertRaisesRegex(ValueError, "invalid_signed_storage_url"):
                signed_storage_url("https://project.supabase.co", unsafe)


if __name__ == "__main__":
    unittest.main()
