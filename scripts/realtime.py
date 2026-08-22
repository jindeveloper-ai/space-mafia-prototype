"""Create short-lived OpenAI Realtime credentials for MARS.NET voice calls."""

from __future__ import annotations

import hashlib
from http.client import HTTPConnection, HTTPSConnection
import json
import os
from urllib.parse import urlsplit


CREW_IDS = ("mina", "juno", "noel")
VOICE_BY_CHARACTER = {
    "mina": "shimmer",
    "juno": "cedar",
    "noel": "marin",
}
VOICE_STYLE = {
    "mina": "Speak slightly fast and bright, with lively but not childish energy.",
    "juno": "Speak calmly and a little slowly, separating facts from guesses.",
    "noel": "Speak naturally with a lightly playful, observant tone.",
}
TRANSCRIPTION_KEYWORDS = (
    "MARS.NET",
    "미나",
    "주노",
    "노엘",
    "산소실",
    "조종실",
    "정화기",
    "출입카드",
    "22:10",
)


class RealtimeError(RuntimeError):
    """Safe upstream failure with an HTTP status suitable for the app response."""

    def __init__(self, code: str, status: int = 502) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def realtime_api_base_url() -> str:
    base = os.environ.get("OPENAI_REALTIME_API_BASE", "https://api.openai.com/v1").rstrip("/")
    parsed = urlsplit(base)
    is_https = parsed.scheme == "https"
    is_local_test = parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost")
    if not parsed.netloc or not (is_https or is_local_test):
        raise RealtimeError("invalid_api_base", 500)
    return base


def safety_identifier(client_ip: str) -> str:
    salt = os.environ.get("OPENAI_SAFETY_SALT", "mars-net-voice-v1")
    return hashlib.sha256(f"{salt}:{client_ip}".encode()).hexdigest()


def _session_config(purpose: str, locale: str, speaker_id: str | None) -> dict:
    realtime_model = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime-2.1-mini")
    transcription_model = os.environ.get("OPENAI_TRANSCRIBE_MODEL", "gpt-live-transcribe")
    if purpose == "transcription":
        language = "ko" if locale == "ko" else "en"
        return {
            "type": "transcription",
            "audio": {
                "input": {
                    "transcription": {
                        "model": transcription_model,
                        "prompt": "A four-player social deduction game in the Mars settlement MARS.NET.",
                        "keywords": list(TRANSCRIPTION_KEYWORDS),
                        "languages": [language],
                        "delay": "low",
                    },
                    # gpt-live-transcribe rejects server/semantic VAD. The
                    # browser commits turns after local silence detection.
                    "turn_detection": None,
                }
            },
        }
    if purpose != "speech" or speaker_id not in CREW_IDS:
        raise RealtimeError("invalid_request", 400)
    return {
        "type": "realtime",
        "model": realtime_model,
        "output_modalities": ["audio"],
        "audio": {"output": {"voice": VOICE_BY_CHARACTER[speaker_id]}},
        "instructions": (
            "You render one supplied MARS.NET character line as speech. "
            "Read only the supplied line, without adding facts, commentary, or meta language. "
            f"{VOICE_STYLE[speaker_id]}"
        ),
    }


def create_client_secret(purpose: str, locale: str, speaker_id: str | None, client_ip: str) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RealtimeError("voice_unavailable", 503)
    session = _session_config(purpose, locale, speaker_id)
    payload = {
        "expires_after": {"anchor": "created_at", "seconds": 300},
        "session": session,
    }
    parsed_url = urlsplit(realtime_api_base_url())
    connection_class = HTTPSConnection if parsed_url.scheme == "https" else HTTPConnection
    connection = connection_class(parsed_url.hostname, parsed_url.port, timeout=20)
    path = f"{parsed_url.path.rstrip('/')}/realtime/client_secrets"
    try:
        connection.request(
            "POST",
            path,
            body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "OpenAI-Safety-Identifier": safety_identifier(client_ip),
            },
        )
        response = connection.getresponse()
        body = response.read()
        if response.status == 429:
            raise RealtimeError("voice_rate_limited", 429)
        if response.status >= 400:
            raise RealtimeError("voice_upstream_failed", 502)
        value = json.loads(body.decode("utf-8"))
    except (OSError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RealtimeError("voice_upstream_failed", 502) from error
    finally:
        connection.close()
    secret = value.get("value")
    if not isinstance(secret, str) or not secret.startswith("ek_"):
        raise RealtimeError("voice_upstream_failed", 502)
    return {
        "value": secret,
        "expiresAt": value.get("expires_at"),
        "purpose": purpose,
        "speakerId": speaker_id,
        "model": session.get("model", os.environ.get("OPENAI_TRANSCRIBE_MODEL", "gpt-live-transcribe")),
    }
