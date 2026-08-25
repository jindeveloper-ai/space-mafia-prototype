from __future__ import annotations

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MIGRATION = PROJECT_ROOT / "supabase" / "migrations" / "202608250001_expand_profile_locales.sql"


class LocaleMigrationTests(unittest.TestCase):
    def test_migration_keeps_existing_codes_and_adds_all_new_codes(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        for locale in ("ko", "en", "ja", "zh-CN", "zh-TW", "yue-Hant-HK", "es-419"):
            with self.subTest(locale=locale):
                self.assertIn(f"'{locale}'", sql)

    def test_migration_only_replaces_single_column_locale_checks(self):
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("constraint_row.conkey = array[column_row.attnum]", sql)
        self.assertIn("validate constraint profiles_locale_check", sql)


if __name__ == "__main__":
    unittest.main()
