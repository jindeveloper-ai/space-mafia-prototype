const COPY = {
  ko: {
    meta: {
      title: "MARS.NET · 친구 게임방", back: "솔로 홈으로", language: "언어 선택",
      themeControl: (name) => `화면 모드: ${name}. 눌러서 변경`,
      audio: { start: "배경음 재생", mute: "배경음 음소거", unmute: "배경음 켜기", volume: "배경음 음량" },
    },
    entry: {
      eyebrow: "2명 실시간 게임",
      title: "친구와 마피아 한 판?",
      lead: "링크를 보내고, 화성 정착민 친구 두 명과 같이 플레이하세요.",
      create: "게임방 만들기",
      join: "코드로 입장",
      code: "게임방 코드",
      codePlaceholder: "6자리 코드",
      name: "표시 이름",
      namePlaceholder: "1~12자 이름",
      avatar: "내장 프로필",
      submitCreate: "게임방 만들기",
      submitJoin: "입장하기",
      privacy: "업로드한 프로필 사진은 공유하지 않습니다.",
    },
    connection: { connected: "접속 중", reconnecting: "재연결 중…", disconnected: "연결 끊김", expired: "게임방이 만료되었습니다.", end: "게임방 종료" },
    lobby: {
      eyebrow: "MARS.NET 비공개 게임방",
      title: "친구를 기다리는 중",
      code: "방 코드",
      copy: "초대 링크 복사",
      copied: "복사했습니다",
      ready: "준비 완료",
      cancelReady: "준비 해제",
      waiting: "다른 플레이어를 기다리는 중…",
      player: "실제 플레이어",
      character: "MARS.NET 정착민",
      rotation: "정착민 두 명은 매 판 교대합니다.",
    },
    role: {
      eyebrow: "나만 보는 비밀 역할",
      mafia: "당신은 마피아입니다.",
      citizen: "당신은 시민입니다.",
      mafiaLead: "가짜 증거와 채팅으로 다른 참가자가 2표를 받게 하세요.",
      citizenLead: "채팅과 공개 사실을 보고 마피아를 찾으세요. 마지막 투표는 1표입니다.",
      confirm: "역할 확인",
      wait: "상대의 역할 확인을 기다리는 중…",
    },
    plant: { title: "가짜 증거를 심으세요.", lead: "망가진 출입카드를 넣을 사물함을 고르세요.", wait: "마피아가 사건을 준비하고 있습니다…", action: (name) => `${name}에게 증거 심기` },
    facts: { eyebrow: "공개 사실", title: "22:10 화성 표준시 · 산소실", lead: "정화기 안전장치가 고장났습니다. 누가 거짓말하는지 채팅으로 확인하세요.", confirm: "사실 확인하고 채팅 열기", wait: "상대가 사실을 확인하는 중…" },
    chat: {
      title: "실시간 추리 채팅",
      lead: "두 플레이어의 말은 실제 의심 판단에 반영됩니다.",
      placeholder: "누가 수상한지 자유롭게 말하세요",
      send: "전송",
      typing: (name) => `${name}님이 입력 중…`,
      voteTitle: "시민 최종 투표",
      voteLead: "당신의 표 1개와 정착민 두 명의 표를 합산합니다.",
      vote: (name) => `${name}에게 투표`,
      mafiaWait: "시민이 최종 투표를 고르는 중입니다.",
      emoji: "이모티콘",
    },
    result: {
      mafiaWin: "마피아 승리",
      mafiaLoss: "시민 승리",
      draw: "투표 무효",
      selected: (name) => `${name}님이 2표 이상을 받았습니다.`,
      drawLead: "1–1–1로 표가 갈려 아무도 탈락하지 않았습니다.",
      roles: "역할 공개",
      votes: "최종 투표",
      reasonManual: "시민이 직접 선택한 1표",
      reasonEvidence: "공개 사실과 검증된 채팅을 함께 판단",
      reactions: {
        mafia_win: {
          mina: "와 방금 표 갈린 거 캡처해 둠ㅋㅋ 이건 인정.",
          juno: "증거보다 대화 흐름이 결과를 바꿨네. 다음 판은 반례부터 보자.",
          noel: "마지막에 방 분위기 넘어간 거 봤지ㅋㅋ 타이밍 좋았음.",
        },
        mafia_loss: {
          mina: "아까 말이랑 기록 안 맞는 순간 바로 보였음ㅋㅋ 다음 판엔 맞춰 와.",
          juno: "주장 하나가 공개 사실과 충돌했음. 다음에는 가설을 끝까지 검증해 보자.",
          noel: "중간에 반응 바뀐 거 티 났음ㅋㅋ 다음 판엔 말끝까지 맞춰봐.",
        },
        draw: {
          mina: "표 셋 다 갈린 거 실화냐ㅋㅋ 이 판은 저장각.",
          juno: "근거가 서로 다른 방향을 가리켜 결론이 안 났음. 재경기 가치 있음.",
          noel: "마지막까지 방 분위기 못 정했네ㅋㅋ 한 판 더 보면 답 나올 듯.",
        },
      },
      rematch: "역할을 바꿔 다시 하기",
      rematchWaiting: "상대의 재경기 준비를 기다리는 중…",
    },
    errors: { generic: "요청을 처리하지 못했습니다.", stale_event: "방 상태가 바뀌어 다시 불러왔습니다.", rapid_duplicate: "같은 메시지를 바로 반복할 수 없습니다.", room_expired: "게임방이 만료되었습니다.", room_full: "이 게임방은 이미 가득 찼습니다." },
  },
  en: {
    meta: {
      title: "MARS.NET · Friend room", back: "Back to Solo home", language: "Language",
      themeControl: (name) => `Screen mode: ${name}. Press to change`,
      audio: { start: "Play background music", mute: "Mute background music", unmute: "Turn on background music", volume: "Background music volume" },
    },
    entry: {
      eyebrow: "Two-player live game", title: "A Mafia game with a friend?", lead: "Share a link and play with two Mars-settler friends.",
      create: "Create room", join: "Join with code", code: "Room code", codePlaceholder: "6-character code", name: "Display name", namePlaceholder: "1–12 characters", avatar: "Built-in avatar", submitCreate: "Create room", submitJoin: "Join room", privacy: "Uploaded profile photos are never shared.",
    },
    connection: { connected: "Connected", reconnecting: "Reconnecting…", disconnected: "Disconnected", expired: "This room has expired.", end: "End room" },
    lobby: { eyebrow: "MARS.NET private room", title: "Waiting for your friend", code: "Room code", copy: "Copy invite link", copied: "Copied", ready: "Ready", cancelReady: "Not ready", waiting: "Waiting for the second player…", player: "Human player", character: "MARS.NET settler", rotation: "Two settler friends rotate each round." },
    role: { eyebrow: "Private role · only you can see this", mafia: "You are the Mafia.", citizen: "You are a citizen.", mafiaLead: "Use planted evidence and chat to make someone else receive two votes.", citizenLead: "Read the chat and facts, then find the Mafia. Your final choice counts as one vote.", confirm: "Confirm role", wait: "Waiting for the other player…" },
    plant: { title: "Plant the false evidence.", lead: "Choose a locker for the broken access card.", wait: "The Mafia is preparing the incident…", action: (name) => `Plant evidence on ${name}` },
    facts: { eyebrow: "Public facts", title: "22:10 Mars Standard Time · Oxygen room", lead: "The purifier safety unit failed. Use chat to work out who is lying.", confirm: "Confirm facts and open chat", wait: "Waiting for the other player…" },
    chat: { title: "Live deduction chat", lead: "Both human players' words affect the actual suspicion state.", placeholder: "Say who looks suspicious and why", send: "Send", typing: (name) => `${name} is typing…`, voteTitle: "Citizen's final vote", voteLead: "Your vote joins the two settler votes.", vote: (name) => `Vote for ${name}`, mafiaWait: "The citizen is choosing a final vote.", emoji: "Emoji" },
    result: {
      mafiaWin: "Mafia wins", mafiaLoss: "Citizens win", draw: "Vote void", selected: (name) => `${name} received at least two votes.`, drawLead: "The vote split 1–1–1, so nobody was removed.", roles: "Role reveal", votes: "Final votes",
      reasonManual: "The human citizen's direct vote",
      reasonEvidence: "Public facts and validated chat considered together",
      reactions: {
        mafia_win: { mina: "okay, saving that vote swing lol. i'll give you this one.", juno: "the conversation outweighed the planted evidence. next round, test the counter-case first.", noel: "you saw the room flip at the end, right? good timing lol." },
        mafia_loss: { mina: "your story stopped matching the receipts lol. line it up next round.", juno: "one claim conflicted with the public facts. validate the full hypothesis next time.", noel: "your reaction shifted midway lol. keep the story straight next round." },
        draw: { mina: "three different votes is wild lol. saving this round.", juno: "the evidence pointed three ways, so no conclusion held. worth a rematch.", noel: "the room never settled lol. one more round might expose it." },
      },
      rematch: "Swap roles and play again", rematchWaiting: "Waiting for the other player…",
    },
    errors: { generic: "The request could not be completed.", stale_event: "The room changed, so the latest state was restored.", rapid_duplicate: "You cannot rapidly repeat the exact same message.", room_expired: "This room has expired.", room_full: "This room is already full." },
  },
};

export function getFriendCopy(locale) {
  return COPY[locale === "en" ? "en" : "ko"];
}

export function getFriendTranslationKeys(locale) {
  const keys = [];
  const walk = (value, prefix = "") => {
    Object.entries(value).forEach(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      keys.push(path);
      if (child && typeof child === "object" && !Array.isArray(child)) walk(child, path);
    });
  };
  walk(COPY[locale === "en" ? "en" : "ko"]);
  return keys.sort();
}
