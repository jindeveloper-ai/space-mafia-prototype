from __future__ import annotations

from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from account_api import sanitize_profile  # noqa: E402
from locales import (  # noqa: E402
    FALLBACK_LOCALE,
    SUPPORTED_LOCALES,
    canonical_locale,
    chat_language_instruction,
    normalize_locale,
    voice_language_hint,
)


class LocalePolicyTests(unittest.TestCase):
    def test_supported_codes_match_the_client_contract(self):
        self.assertEqual(
            SUPPORTED_LOCALES,
            ("ko", "en", "ja", "zh-CN", "zh-TW", "yue-Hant-HK", "es-419"),
        )
        self.assertEqual(FALLBACK_LOCALE, "en")

    def test_account_profile_preserves_all_supported_locales(self):
        for locale in SUPPORTED_LOCALES:
            with self.subTest(locale=locale):
                self.assertEqual(sanitize_profile({"locale": locale})["locale"], locale)

    def test_invalid_or_missing_values_fall_back_to_english(self):
        self.assertEqual(normalize_locale("fr-FR"), "en")
        self.assertEqual(sanitize_profile({})["locale"], "en")

    def test_request_validation_rejects_unsupported_values_without_silent_fallback(self):
        self.assertEqual(canonical_locale("YUE-hant-hk"), "yue-Hant-HK")
        self.assertIsNone(canonical_locale("fr-FR"))
        self.assertIsNone(canonical_locale(None))

    def test_voice_hints_and_chat_instructions_cover_all_supported_locales(self):
        expected_hints = {
            "ko": "ko",
            "en": "en",
            "ja": "ja",
            "zh-CN": "zh",
            "zh-TW": "zh",
            "yue-Hant-HK": "zh",
            "es-419": "es",
        }
        for locale, hint in expected_hints.items():
            with self.subTest(locale=locale):
                self.assertEqual(voice_language_hint(locale), hint)
                self.assertTrue(chat_language_instruction(locale))
        self.assertIn("Hong Kong Cantonese", chat_language_instruction("yue-Hant-HK"))
        self.assertIn("do not use Cantonese", chat_language_instruction("zh-TW"))


if __name__ == "__main__":
    unittest.main()
