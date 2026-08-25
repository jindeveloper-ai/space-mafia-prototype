"""Server-authoritative room state for MARS.NET Friend Mode."""

from __future__ import annotations

from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
import random
import re
import secrets
from threading import RLock
import time

try:
    from .locales import canonical_locale
except ImportError:  # Direct execution from the scripts directory.
    from locales import canonical_locale


AI_IDS = ("mina", "juno", "noel")
AVATAR_IDS = ("astronaut-purple", "astronaut-green", "astronaut-gold", "initial")
CLAIM_TYPES = ("seen", "machine", "changed", "unclear")
ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
ROOM_CODE_LENGTH = 6
ROOM_TTL_SECONDS = 30 * 60
RECONNECT_GRACE_SECONDS = 60
MAX_CHAT_LENGTH = 280
MAX_TRANSCRIPT_ITEMS = 80
RAPID_DUPLICATE_SECONDS = 3

PUBLIC_FACT_TEMPLATES = {
    "ko": {
        "alibi": "{subject} 22:10 화성 표준시에 조종실 카메라에 찍혔습니다.",
        "access": "{name}의 주머니에서 산소실 전용 공구가 나왔습니다.",
        "contradiction": "{subject} 사건 시간을 두 번 다르게 말했습니다.",
        "evidence": "{name}의 사물함에서 망가진 출입카드가 나왔습니다.",
    },
    "en": {
        "alibi": "{name} appears on the control-room camera at 22:10 Mars Standard Time.",
        "access": "An oxygen-room tool was found in {name}'s pocket.",
        "contradiction": "{name} gave two different times for the incident.",
        "evidence": "A broken access card was found in {name}'s locker.",
    },
    "ja": {
        "alibi": "{name}は火星標準時22:10に管制室のカメラに映っていました。",
        "access": "{name}のポケットから酸素室専用工具が見つかりました。",
        "contradiction": "{name}は事件時刻を二通りに話しました。",
        "evidence": "{name}のロッカーから壊れた入退室カードが見つかりました。",
    },
    "zh-CN": {
        "alibi": "{name}在火星标准时间22:10出现在控制室监控中。",
        "access": "在{name}的口袋里发现了氧气室专用工具。",
        "contradiction": "{name}对案发时间给出了两种不同说法。",
        "evidence": "在{name}的柜子里发现了损坏的门禁卡。",
    },
    "zh-TW": {
        "alibi": "{name}在火星標準時間22:10出現在管制室監控中。",
        "access": "在{name}的口袋裡發現了氧氣室專用工具。",
        "contradiction": "{name}對案發時間提出兩種不同說法。",
        "evidence": "在{name}的置物櫃裡發現了損壞的通行卡。",
    },
    "yue-Hant-HK": {
        "alibi": "{name}喺火星標準時間22:10俾控制室閉路電視影到。",
        "access": "喺{name}個袋入面搵到氧氣室專用工具。",
        "contradiction": "{name}講咗兩個唔同嘅案發時間。",
        "evidence": "喺{name}個儲物櫃搵到一張整爛咗嘅門禁卡。",
    },
    "es-419": {
        "alibi": "{name} aparece en la cámara de la sala de control a las 22:10, hora estándar de Marte.",
        "access": "Encontraron una herramienta de la sala de oxígeno en el bolsillo de {name}.",
        "contradiction": "{name} dio dos horas distintas para el incidente.",
        "evidence": "Encontraron una tarjeta de acceso dañada en el casillero de {name}.",
    },
}

AI_DISPLAY_NAMES = {
    "ko": {"mina": "미나", "juno": "주노", "noel": "노엘"},
    "en": {"mina": "Mina", "juno": "Juno", "noel": "Noel"},
    "ja": {"mina": "ミナ", "juno": "ジュノ", "noel": "ノエル"},
    "zh-CN": {"mina": "米娜", "juno": "朱诺", "noel": "诺埃尔"},
    "zh-TW": {"mina": "米娜", "juno": "茱諾", "noel": "諾艾爾"},
    "yue-Hant-HK": {"mina": "米娜", "juno": "朱諾", "noel": "諾爾"},
    "es-419": {"mina": "Mina", "juno": "Juno", "noel": "Noel"},
}


def with_korean_topic(name: str) -> str:
    """Attach 은/는 to a display name without exposing a placeholder to players."""
    if not name:
        return name
    final = ord(name[-1])
    has_batchim = 0xAC00 <= final <= 0xD7A3 and (final - 0xAC00) % 28 != 0
    return f"{name}{'은' if has_batchim else '는'}"


def public_fact_text(locale: str, fact_type: str, name: str) -> str:
    return PUBLIC_FACT_TEMPLATES[locale][fact_type].format(
        name=name,
        subject=with_korean_topic(name) if locale == "ko" else name,
    )


class RoomError(ValueError):
    """A safe error code for invalid room operations."""


@dataclass
class Player:
    id: str
    token: str
    name: str
    avatar_id: str
    ready: bool = False
    connected: bool = False
    disconnected_at: float | None = None
    role: str | None = None
    role_acknowledged: bool = False
    facts_acknowledged: bool = False
    rematch_ready: bool = False
    last_message: str = ""
    last_message_at: float = 0
    seen_action_ids: set[str] = field(default_factory=set)


@dataclass
class Room:
    code: str
    locale: str
    created_at: float
    last_active_at: float
    expires_at: float
    players: list[Player] = field(default_factory=list)
    phase: str = "lobby"
    round_number: int = 0
    previous_mafia_id: str | None = None
    ai_ids: tuple[str, str] = ("mina", "juno")
    sitting_out_ai_id: str = "noel"
    event_seq: int = 0
    evidence_target_id: str | None = None
    public_facts: list[dict] = field(default_factory=list)
    claims: list[dict] = field(default_factory=list)
    transcript: list[dict] = field(default_factory=list)
    typing_ai_ids: list[str] = field(default_factory=list)
    votes: dict[str, str] = field(default_factory=dict)
    vote_reasons: dict[str, str] = field(default_factory=dict)
    result: dict | None = None
    events: list[dict] = field(default_factory=list)
    ended_reason: str | None = None
    model_request_counts: dict[str, int] = field(default_factory=dict)

    def player_for_token(self, token: str) -> Player:
        player = next((item for item in self.players if secrets.compare_digest(item.token, token)), None)
        if player is None:
            raise RoomError("invalid_participant")
        return player

    def player_by_id(self, player_id: str) -> Player | None:
        return next((item for item in self.players if item.id == player_id), None)

    @property
    def participant_ids(self) -> tuple[str, ...]:
        return tuple(player.id for player in self.players) + self.ai_ids

    @property
    def mafia(self) -> Player | None:
        return next((player for player in self.players if player.role == "mafia"), None)

    @property
    def citizen(self) -> Player | None:
        return next((player for player in self.players if player.role == "citizen"), None)


def clean_name(value: object) -> str:
    if not isinstance(value, str):
        raise RoomError("invalid_name")
    cleaned = " ".join(value.strip().split())[:12]
    if not cleaned or any(ord(character) < 32 for character in cleaned):
        raise RoomError("invalid_name")
    return cleaned


def clean_message(value: object) -> str:
    if not isinstance(value, str):
        raise RoomError("invalid_message")
    cleaned = " ".join(value.strip().split())
    if not cleaned or len(cleaned) > MAX_CHAT_LENGTH or any(ord(character) < 32 for character in cleaned):
        raise RoomError("invalid_message")
    return cleaned


def validate_avatar(value: object) -> str:
    if value not in AVATAR_IDS:
        raise RoomError("invalid_avatar")
    return str(value)


def local_interpretation(message: str, candidates: list[dict], speaker_id: str) -> dict:
    """Deterministic semantic fallback; model interpretation remains the normal path."""
    lowered = message.casefold()
    target_id = None
    target_position = -1
    for candidate in candidates:
        names = [candidate["id"], candidate["name"].casefold()]
        positions = [lowered.rfind(name) for name in names if name]
        position = max(positions, default=-1)
        if position > target_position and candidate["id"] != speaker_id:
            target_id = candidate["id"]
            target_position = position

    semantic_groups = {
        "seen": ("saw", "seen", "leaving", "oxygen room", "봤", "나오", "산소실", "목격"),
        "machine": ("tool", "purifier", "tamper", "machine", "공구", "정화기", "만지", "조작"),
        "changed": ("changed", "different time", "story", "contradict", "말 바꾸", "시간", "시각", "다르게"),
    }
    scores = {
        claim_type: sum(1 for phrase in phrases if phrase in lowered)
        for claim_type, phrases in semantic_groups.items()
    }
    claim_type = max(scores, key=scores.get) if max(scores.values(), default=0) else "unclear"
    is_accusation = target_id is not None and claim_type != "unclear"
    return {
        "targetId": target_id,
        "claimType": claim_type,
        "isAccusation": is_accusation,
        "confidence": 0.55 if is_accusation else 0.2,
    }


def apply_interpretation(room: Room, speaker_id: str, interpretation: dict, message_id: str) -> dict:
    participant_ids = set(room.participant_ids)
    target_id = interpretation.get("targetId")
    claim_type = interpretation.get("claimType")
    if target_id not in participant_ids or target_id == speaker_id:
        target_id = None
    if claim_type not in CLAIM_TYPES:
        claim_type = "unclear"
    is_accusation = bool(interpretation.get("isAccusation")) and target_id is not None and claim_type != "unclear"
    previous = next((claim for claim in reversed(room.claims) if claim["speakerId"] == speaker_id), None)
    target_changed = bool(previous and is_accusation and previous.get("targetId") != target_id)
    contradicted = bool(
        previous
        and is_accusation
        and previous.get("targetId") == target_id
        and previous.get("claimType") not in (claim_type, "unclear")
    )
    validated = {
        "messageId": message_id,
        "speakerId": speaker_id,
        "targetId": target_id,
        "claimType": claim_type,
        "isAccusation": is_accusation,
        "targetChanged": target_changed,
        "contradictedEarlierClaim": contradicted,
    }
    room.claims.append(validated)
    return validated


def _candidate_fact(room: Room, candidate_id: str) -> str | None:
    item = next((fact for fact in room.public_facts if fact["participantId"] == candidate_id), None)
    return item.get("type") if item else None


def suspicion_scores(room: Room, voter_id: str) -> dict[str, int]:
    scores = {candidate_id: 0 for candidate_id in room.participant_ids if candidate_id != voter_id}
    if room.evidence_target_id in scores:
        scores[room.evidence_target_id] += 16
    for candidate_id in scores:
        fact_type = _candidate_fact(room, candidate_id)
        scores[candidate_id] += {"alibi": -18, "access": 9, "contradiction": 7}.get(fact_type, 0)
    for claim in room.claims:
        target_id = claim.get("targetId")
        if claim.get("isAccusation") and target_id in scores:
            weight = 8
            if claim.get("targetChanged"):
                weight -= 4
                if claim["speakerId"] in scores:
                    scores[claim["speakerId"]] += 5
            if claim.get("contradictedEarlierClaim"):
                weight -= 3
                if claim["speakerId"] in scores:
                    scores[claim["speakerId"]] += 4
            scores[target_id] += max(1, weight)
    personality_bias = {
        "mina": {"alibi": -4, "contradiction": 2},
        "juno": {"access": -2, "contradiction": -1},
        "noel": {"contradiction": 4},
    }.get(voter_id, {})
    for candidate_id in scores:
        scores[candidate_id] += personality_bias.get(_candidate_fact(room, candidate_id), 0)
    return scores


def determine_ai_votes(room: Room) -> tuple[dict[str, str], dict[str, str]]:
    votes = {}
    reasons = {}
    for voter_id in room.ai_ids:
        scores = suspicion_scores(room, voter_id)
        top_score = max(scores.values())
        tied = sorted(candidate_id for candidate_id, score in scores.items() if score == top_score)
        candidate_id = tied[room.round_number % len(tied)]
        votes[voter_id] = candidate_id
        reasons[voter_id] = "validated_public_evidence"
    return votes, reasons


def resolve_result(room: Room, human_vote: str, ai_votes: dict[str, str] | None = None) -> dict:
    citizen = room.citizen
    mafia = room.mafia
    if citizen is None or mafia is None:
        raise RoomError("round_not_started")
    if human_vote not in room.participant_ids or human_vote == citizen.id:
        raise RoomError("invalid_vote")
    automatic_votes, automatic_reasons = determine_ai_votes(room)
    final_ai_votes = automatic_votes if ai_votes is None else ai_votes
    if set(final_ai_votes) != set(room.ai_ids):
        raise RoomError("invalid_ai_votes")
    allowed_candidates = set(room.participant_ids)
    if any(candidate_id not in allowed_candidates or candidate_id == voter_id for voter_id, candidate_id in final_ai_votes.items()):
        raise RoomError("invalid_ai_votes")
    votes = {citizen.id: human_vote, **final_ai_votes}
    counts = Counter(votes.values())
    selected_id, selected_count = counts.most_common(1)[0]
    if selected_count < 2:
        outcome = "draw"
        selected_id = None
    elif selected_id == mafia.id:
        outcome = "mafia_loss"
    else:
        outcome = "mafia_win"
    room.votes = votes
    room.vote_reasons = {citizen.id: "manual_vote", **automatic_reasons}
    room.result = {
        "outcome": outcome,
        "selectedId": selected_id,
        "votes": [{"voterId": voter_id, "candidateId": candidate_id} for voter_id, candidate_id in votes.items()],
    }
    room.phase = "result"
    return room.result


class RoomManager:
    def __init__(self, *, clock=time.time, random_source: random.Random | None = None):
        self._clock = clock
        self._random = random_source or random.SystemRandom()
        self._rooms: dict[str, Room] = {}
        self._lock = RLock()

    def _now(self) -> float:
        return float(self._clock())

    def cleanup(self) -> int:
        now = self._now()
        with self._lock:
            expired = [code for code, room in self._rooms.items() if room.expires_at <= now]
            for code in expired:
                del self._rooms[code]
            return len(expired)

    def _new_code(self) -> str:
        for _ in range(50):
            code = "".join(self._random.choice(ROOM_CODE_ALPHABET) for _ in range(ROOM_CODE_LENGTH))
            if code not in self._rooms:
                return code
        raise RoomError("room_capacity")

    def _new_token(self) -> str:
        return secrets.token_urlsafe(32)

    def create_room(self, *, name: object, avatar_id: object, locale: object = "ko") -> tuple[Room, Player]:
        player_name = clean_name(name)
        avatar = validate_avatar(avatar_id)
        normalized_locale = canonical_locale(locale)
        if normalized_locale is None:
            raise RoomError("invalid_locale")
        now = self._now()
        with self._lock:
            self.cleanup()
            room = Room(
                code=self._new_code(),
                locale=normalized_locale,
                created_at=now,
                last_active_at=now,
                expires_at=now + ROOM_TTL_SECONDS,
            )
            player = Player(id="p1", token=self._new_token(), name=player_name, avatar_id=avatar)
            room.players.append(player)
            self._rooms[room.code] = room
            self._event(room, "room_created", {"playerId": player.id})
            return room, player

    def join_room(self, code: object, *, name: object, avatar_id: object) -> tuple[Room, Player]:
        room = self.get_room(code)
        player_name = clean_name(name)
        avatar = validate_avatar(avatar_id)
        with self._lock:
            if room.phase != "lobby" or len(room.players) >= 2:
                raise RoomError("room_full")
            if any(player.name.casefold() == player_name.casefold() for player in room.players):
                raise RoomError("duplicate_name")
            player = Player(id="p2", token=self._new_token(), name=player_name, avatar_id=avatar)
            room.players.append(player)
            self._touch(room)
            self._event(room, "player_joined", {"playerId": player.id})
            return room, player

    def get_room(self, code: object) -> Room:
        normalized = str(code or "").strip().upper()
        if not re.fullmatch(rf"[{ROOM_CODE_ALPHABET}]{{{ROOM_CODE_LENGTH}}}", normalized):
            raise RoomError("room_not_found")
        with self._lock:
            room = self._rooms.get(normalized)
            if room is None or room.expires_at <= self._now():
                self._rooms.pop(normalized, None)
                raise RoomError("room_expired")
            return room

    def authenticate(self, code: object, token: object) -> tuple[Room, Player]:
        if not isinstance(token, str) or len(token) > 128:
            raise RoomError("invalid_participant")
        room = self.get_room(code)
        player = room.player_for_token(token)
        return room, player

    def _touch(self, room: Room) -> None:
        now = self._now()
        room.last_active_at = now
        room.expires_at = now + ROOM_TTL_SECONDS

    def _event(self, room: Room, event_type: str, payload: dict | None = None) -> dict:
        room.event_seq += 1
        event = {"seq": room.event_seq, "type": event_type, **(payload or {})}
        room.events.append(event)
        room.events = room.events[-160:]
        self._touch(room)
        return event

    def _validate_action(self, room: Room, player: Player, action_id: object, expected_seq: object) -> None:
        if not isinstance(action_id, str) or not action_id or len(action_id) > 80:
            raise RoomError("invalid_action")
        if action_id in player.seen_action_ids:
            raise RoomError("duplicate_action")
        if not isinstance(expected_seq, int) or expected_seq != room.event_seq:
            raise RoomError("stale_event")
        player.seen_action_ids.add(action_id)
        if len(player.seen_action_ids) > 200:
            player.seen_action_ids = set(sorted(player.seen_action_ids)[-120:])

    def set_connected(self, room: Room, player: Player, connected: bool) -> None:
        with self._lock:
            if player.connected == connected:
                return
            player.connected = connected
            player.disconnected_at = None if connected else self._now()
            self._event(room, "connection_changed", {"playerId": player.id, "connected": connected})

    def set_ready(self, room: Room, player: Player, *, ready: bool, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "lobby" or len(room.players) != 2:
                raise RoomError("invalid_phase")
            player.ready = bool(ready)
            self._event(room, "ready_changed", {"playerId": player.id, "ready": player.ready})
            if all(item.ready and item.connected for item in room.players):
                self._start_round(room)

    def _start_round(self, room: Room) -> None:
        room.round_number += 1
        if room.round_number == 2 and room.previous_mafia_id:
            mafia_id = next(player.id for player in room.players if player.id != room.previous_mafia_id)
        else:
            mafia_id = self._random.choice([player.id for player in room.players])
        for player in room.players:
            player.role = "mafia" if player.id == mafia_id else "citizen"
            player.ready = False
            player.role_acknowledged = False
            player.facts_acknowledged = False
            player.rematch_ready = False
        room.previous_mafia_id = mafia_id
        combinations = (("mina", "juno"), ("juno", "noel"), ("noel", "mina"))
        room.ai_ids = combinations[(room.round_number - 1) % len(combinations)]
        room.sitting_out_ai_id = next(ai_id for ai_id in AI_IDS if ai_id not in room.ai_ids)
        room.phase = "role"
        room.evidence_target_id = None
        room.public_facts = []
        room.claims = []
        room.transcript = []
        room.typing_ai_ids = []
        room.votes = {}
        room.vote_reasons = {}
        room.result = None
        room.model_request_counts = {}
        self._event(room, "round_started", {"roundNumber": room.round_number})

    def acknowledge_role(self, room: Room, player: Player, *, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "role":
                raise RoomError("invalid_phase")
            player.role_acknowledged = True
            self._event(room, "role_acknowledged", {"playerId": player.id})
            if all(item.role_acknowledged for item in room.players):
                room.phase = "plant"
                self._event(room, "phase_changed", {"phase": room.phase})

    def plant_evidence(self, room: Room, player: Player, *, target_id: object, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "plant" or player.role != "mafia":
                raise RoomError("forbidden_action")
            if target_id not in room.participant_ids or target_id == player.id:
                raise RoomError("invalid_target")
            room.evidence_target_id = str(target_id)
            fact_types = ("alibi", "access", "contradiction")
            names = self._display_names(room)
            room.public_facts = [
                {
                    "participantId": participant_id,
                    "type": fact_types[index % len(fact_types)],
                    "text": public_fact_text(
                        room.locale,
                        fact_types[index % len(fact_types)],
                        names[participant_id],
                    ),
                }
                for index, participant_id in enumerate(room.participant_ids)
            ]
            room.public_facts.append({
                "participantId": room.evidence_target_id,
                "type": "evidence",
                "text": public_fact_text(room.locale, "evidence", names[room.evidence_target_id]),
            })
            room.phase = "facts"
            self._event(room, "evidence_revealed", {"targetId": room.evidence_target_id})

    def acknowledge_facts(self, room: Room, player: Player, *, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "facts":
                raise RoomError("invalid_phase")
            player.facts_acknowledged = True
            self._event(room, "facts_acknowledged", {"playerId": player.id})
            if all(item.facts_acknowledged for item in room.players):
                room.phase = "chat"
                self._event(room, "phase_changed", {"phase": room.phase})

    def add_human_message(self, room: Room, player: Player, *, message: object, action_id: object, expected_seq: object) -> dict:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "chat":
                raise RoomError("invalid_phase")
            text = clean_message(message)
            now = self._now()
            if text.casefold() == player.last_message.casefold() and now - player.last_message_at < RAPID_DUPLICATE_SECONDS:
                raise RoomError("rapid_duplicate")
            player.last_message = text
            player.last_message_at = now
            message_id = f"m{room.event_seq + 1}"
            transcript_item = {
                "id": message_id,
                "speakerId": player.id,
                "kind": "human",
                "text": text,
            }
            room.transcript.append(transcript_item)
            room.transcript = room.transcript[-MAX_TRANSCRIPT_ITEMS:]
            self._event(room, "human_message", {"messageId": message_id, "speakerId": player.id})
            return transcript_item

    def apply_message_interpretation(self, room: Room, *, speaker_id: str, message_id: str, interpretation: dict) -> dict:
        with self._lock:
            validated = apply_interpretation(room, speaker_id, interpretation, message_id)
            self._event(room, "claim_interpreted", {"messageId": message_id})
            return validated

    def set_typing(self, room: Room, ai_ids: list[str]) -> None:
        with self._lock:
            room.typing_ai_ids = [ai_id for ai_id in ai_ids if ai_id in room.ai_ids]
            self._event(room, "typing_changed", {"aiIds": list(room.typing_ai_ids)})

    def add_ai_reply(self, room: Room, *, ai_id: str, message: str, reply_to: str) -> dict:
        with self._lock:
            if ai_id not in room.ai_ids:
                raise RoomError("invalid_ai")
            item = {
                "id": f"m{room.event_seq + 1}",
                "speakerId": ai_id,
                "kind": "character",
                "text": clean_message(message)[:160],
                "replyTo": reply_to,
            }
            room.transcript.append(item)
            room.transcript = room.transcript[-MAX_TRANSCRIPT_ITEMS:]
            room.typing_ai_ids = [item_id for item_id in room.typing_ai_ids if item_id != ai_id]
            self._event(room, "character_message", {"messageId": item["id"], "speakerId": ai_id, "replyTo": reply_to})
            return item

    def record_request_count(self, room: Room, message_id: str, count: int) -> None:
        with self._lock:
            room.model_request_counts[message_id] = max(0, int(count))

    def cast_vote(self, room: Room, player: Player, *, target_id: object, action_id: object, expected_seq: object) -> dict:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "chat" or player.role != "citizen" or room.typing_ai_ids:
                raise RoomError("forbidden_action")
            if room.votes:
                raise RoomError("already_voted")
            result = resolve_result(room, str(target_id))
            self._event(room, "result_finalized", {"outcome": result["outcome"]})
            return result

    def request_rematch(self, room: Room, player: Player, *, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            if room.phase != "result":
                raise RoomError("invalid_phase")
            player.rematch_ready = True
            self._event(room, "rematch_requested", {"playerId": player.id})
            if all(item.rematch_ready for item in room.players):
                self._start_round(room)

    def end_after_disconnect(self, room: Room, player: Player, *, action_id: object, expected_seq: object) -> None:
        with self._lock:
            self._validate_action(room, player, action_id, expected_seq)
            other = next((item for item in room.players if item.id != player.id), None)
            if other is None or other.connected or other.disconnected_at is None:
                raise RoomError("player_not_disconnected")
            if self._now() - other.disconnected_at < RECONNECT_GRACE_SECONDS:
                raise RoomError("reconnect_grace_active")
            room.phase = "ended"
            room.ended_reason = "player_disconnected"
            self._event(room, "room_ended", {"reason": room.ended_reason})

    def _display_names(self, room: Room) -> dict[str, str]:
        names = {player.id: player.name for player in room.players}
        names.update(AI_DISPLAY_NAMES[room.locale])
        return names

    def snapshot(self, room: Room, viewer: Player) -> dict:
        names = self._display_names(room)
        now = self._now()
        players = []
        for player in room.players:
            grace_remaining = None
            if not player.connected and player.disconnected_at is not None:
                grace_remaining = max(0, int(RECONNECT_GRACE_SECONDS - (now - player.disconnected_at)))
            players.append({
                "id": player.id,
                "name": player.name,
                "avatarId": player.avatar_id,
                "connected": player.connected,
                "ready": player.ready,
                "rematchReady": player.rematch_ready,
                "graceRemaining": grace_remaining,
            })
        snapshot = {
            "code": room.code,
            "locale": room.locale,
            "phase": room.phase,
            "roundNumber": room.round_number,
            "eventSeq": room.event_seq,
            "self": {
                "id": viewer.id,
                "role": viewer.role,
                "roleAcknowledged": viewer.role_acknowledged,
                "factsAcknowledged": viewer.facts_acknowledged,
                "canPlant": room.phase == "plant" and viewer.role == "mafia" and room.evidence_target_id is None,
                "canVote": room.phase == "chat" and viewer.role == "citizen" and not room.votes and not room.typing_ai_ids,
            },
            "players": players,
            "characters": [{"id": ai_id, "name": names[ai_id], "avatarId": ai_id} for ai_id in room.ai_ids],
            "sittingOutCharacterId": room.sitting_out_ai_id,
            "publicFacts": list(room.public_facts),
            "transcript": list(room.transcript),
            "typingCharacterIds": list(room.typing_ai_ids),
            "claims": list(room.claims),
            "result": None,
            "endedReason": room.ended_reason,
        }
        if room.phase == "plant" and viewer.role == "mafia":
            snapshot["privateAction"] = {
                "type": "plant_evidence",
                "candidateIds": [candidate_id for candidate_id in room.participant_ids if candidate_id != viewer.id],
            }
        if room.phase == "chat" and viewer.role == "citizen":
            snapshot["privateAction"] = {
                "type": "vote",
                "candidateIds": [candidate_id for candidate_id in room.participant_ids if candidate_id != viewer.id],
            }
        if room.result is not None:
            snapshot["result"] = {
                **room.result,
                "roles": [
                    {"participantId": player.id, "role": player.role}
                    for player in room.players
                ] + [{"participantId": ai_id, "role": "citizen"} for ai_id in room.ai_ids],
                "voteReasons": dict(room.vote_reasons),
            }
        return snapshot


__all__ = [
    "AI_IDS",
    "AVATAR_IDS",
    "MAX_CHAT_LENGTH",
    "RECONNECT_GRACE_SECONDS",
    "ROOM_TTL_SECONDS",
    "Room",
    "RoomError",
    "RoomManager",
    "apply_interpretation",
    "determine_ai_votes",
    "local_interpretation",
    "resolve_result",
    "suspicion_scores",
]
