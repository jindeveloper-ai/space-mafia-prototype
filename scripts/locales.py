"""Canonical locale policy shared by MARS.NET Python services."""

from __future__ import annotations

from typing import Final


FALLBACK_LOCALE: Final = "en"
SUPPORTED_LOCALES: Final = (
    "ko",
    "en",
    "ja",
    "zh-CN",
    "zh-TW",
    "yue-Hant-HK",
    "es-419",
)

VOICE_LANGUAGE_HINTS: Final = {
    "ko": "ko",
    "en": "en",
    "ja": "ja",
    "zh-CN": "zh",
    "zh-TW": "zh",
    "yue-Hant-HK": "zh",
    "es-419": "es",
}

CHAT_LANGUAGE_INSTRUCTIONS: Final = {
    "ko": "Write natural Korean internet-community chat in informal banmal.",
    "en": "Write natural informal English community chat.",
    "ja": "Write natural casual Japanese community chat, avoiding stiff literal translation.",
    "zh-CN": "Write natural Mainland Mandarin community chat in Simplified Chinese.",
    "zh-TW": "Write natural Taiwan Mandarin community chat in Traditional Chinese; do not use Cantonese wording.",
    "yue-Hant-HK": (
        "Write natural colloquial Hong Kong Cantonese community chat in Traditional Chinese, "
        "using Cantonese grammar and particles rather than standard written Mandarin."
    ),
    "es-419": (
        "Write natural neutral Latin American Spanish community chat; use informal tú and avoid Spain-specific vosotros."
    ),
}

VOICE_LANGUAGE_INSTRUCTIONS: Final = {
    "ko": "Speak only natural Korean.",
    "en": "Speak only natural English.",
    "ja": "Speak only natural Japanese.",
    "zh-CN": "Speak only natural Mainland Mandarin Chinese using Simplified Chinese wording.",
    "zh-TW": "Speak only natural Taiwan Mandarin Chinese using Traditional Chinese wording; do not use Cantonese.",
    "yue-Hant-HK": (
        "Speak only natural Hong Kong Cantonese (粵語／廣東話), with Hong Kong pronunciation and colloquial "
        "Traditional Chinese wording; do not switch to Mandarin."
    ),
    "es-419": "Speak only natural neutral Latin American Spanish; use tú and avoid Spain-specific vosotros.",
}


def canonical_locale(value: object) -> str | None:
    """Return a canonical code only when the request explicitly names a supported locale."""
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return next((locale for locale in SUPPORTED_LOCALES if locale.lower() == normalized), None)


def normalize_locale(value: object, fallback: str = FALLBACK_LOCALE) -> str:
    """Return a canonical supported code without accepting browser-only aliases."""
    return canonical_locale(value) or fallback


def chat_language_instruction(locale: object) -> str:
    """Return the shared model instruction for text chat in a supported locale."""
    canonical = canonical_locale(locale)
    if canonical is None:
        raise ValueError("unsupported_locale")
    return CHAT_LANGUAGE_INSTRUCTIONS[canonical]


def voice_language_hint(locale: object) -> str:
    """Return the Realtime ISO-639-1 language hint for a supported locale."""
    canonical = canonical_locale(locale)
    if canonical is None:
        raise ValueError("unsupported_locale")
    return VOICE_LANGUAGE_HINTS[canonical]


def voice_language_instruction(locale: object) -> str:
    """Return the shared spoken-language instruction for a supported locale."""
    canonical = canonical_locale(locale)
    if canonical is None:
        raise ValueError("unsupported_locale")
    return VOICE_LANGUAGE_INSTRUCTIONS[canonical]
