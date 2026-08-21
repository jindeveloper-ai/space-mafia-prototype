import unittest

from scripts.serve import finalize_chat_text


class ChatTextTests(unittest.TestCase):
    def test_english_reply_drops_stray_han_character(self):
        self.assertEqual(
            finalize_chat_text("Check the logs before convict到", "en", 120),
            "Check the logs before convict",
        )

    def test_long_english_reply_never_cuts_a_word(self):
        value = "Show the lock damage pattern or a witness linking me to the purifier before you decide this case"
        result = finalize_chat_text(value, "en", 72)
        self.assertLessEqual(len(result), 72)
        self.assertTrue(result.endswith("…"))
        self.assertNotIn("linkin…", result)


if __name__ == "__main__":
    unittest.main()
