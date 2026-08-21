import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCopy } from "../i18n.js";

const projectRoot = new URL("../", import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8");
}

test("브라우저 에셋과 내부 모듈은 패키지 버전으로 캐시를 갱신한다", async () => {
  const [indexHtml, gameSource, engineSource, packageSource] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("game.js"),
    readProjectFile("game-engine.js"),
    readProjectFile("package.json"),
  ]);
  const { version } = JSON.parse(packageSource);

  assert.ok(indexHtml.includes(`./styles.css?v=${version}`));
  assert.ok(indexHtml.includes(`./theme.js?v=${version}`));
  assert.ok(indexHtml.includes(`./sound.js?v=${version}`));
  assert.ok(indexHtml.includes(`./game.js?v=${version}`));
  assert.ok(gameSource.includes(`./game-engine.js?v=${version}`));
  assert.ok(gameSource.includes(`./i18n.js?v=${version}`));
  assert.ok(gameSource.includes(`./chat-adapter.js?v=${version}`));
  assert.ok(gameSource.includes(`./progression.js?v=${version}`));
  assert.ok(engineSource.includes(`./i18n.js?v=${version}`));
  assert.match(gameSource, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
  assert.match(indexHtml, /data-lang="ko"[^>]+href="\.\/\?lang=ko"/);
  assert.match(indexHtml, /data-lang="en"[^>]+href="\.\/\?lang=en"/);
  assert.match(gameSource, /crew\.map\(\(person\) => factCard\(person\)\)/);
  assert.doesNotMatch(gameSource, /crew\.map\(factCard\)/);
  assert.doesNotMatch(`${indexHtml}\n${gameSource}\n${engineSource}`, /v0\.[34]/);
});

test("자유 입력 채팅은 서버 프록시만 사용하고 브라우저에 비밀값을 넣지 않는다", async () => {
  const [gameSource, adapterSource, indexHtml, styles] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("chat-adapter.js"),
    readProjectFile("index.html"),
    readProjectFile("styles.css"),
  ]);

  assert.match(gameSource, /fetch\("\/api\/chat"/);
  assert.match(gameSource, /class="chat-composer"/);
  assert.match(gameSource, /<textarea/);
  assert.match(gameSource, /class="game-room-view is-chat is-setup"/);
  assert.match(gameSource, /class="composer-send"/);
  assert.match(gameSource, /relationStrong/);
  assert.match(gameSource, /async function revealReplies/);
  assert.match(gameSource, /typingDuration/);
  assert.match(gameSource, /data-chat-stage="friend"/);
  assert.doesNotMatch(gameSource, /class="crew-card/);
  assert.match(adapterSource, /MAX_CHAT_LENGTH = 280/);
  assert.match(styles, /\.game-room-view \.chat-dock \.chat-suggestions \{[\s\S]+grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.game-room-view \.chat-dock \.chat-suggestion \{[\s\S]+width: 100%[\s\S]+min-height: 48px/);
  assert.match(styles, /\.game-room-view \.chat-dock \.chat-suggestion span \{[\s\S]+white-space: normal/);
  assert.doesNotMatch(`${gameSource}\n${adapterSource}\n${indexHtml}`, /OPENAI_API_KEY|api\.openai\.com/);
});

test("Pixabay 배경음은 로컬 에셋으로 대기실·게임 장면, 음소거와 음량을 제어한다", async () => {
  const [indexHtml, soundSource, lobbyTrack, gameTrack] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("sound.js"),
    readFile(new URL("assets/audio/lobby-detectives-among-us.mp3", projectRoot)),
    readFile(new URL("assets/audio/game-sneaky-film-noir.mp3", projectRoot)),
  ]);

  assert.match(indexHtml, /data-audio-toggle/);
  assert.match(indexHtml, /data-audio-volume/);
  assert.match(soundSource, /new Audio\("\.\/assets\/audio\/lobby-detectives-among-us\.mp3"\)/);
  assert.match(soundSource, /new Audio\("\.\/assets\/audio\/game-sneaky-film-noir\.mp3"\)/);
  assert.match(soundSource, /nextScene === "game"/);
  assert.match(soundSource, /hasStarted/);
  assert.match(soundSource, /STORAGE_KEY = "mars-net-sound-v3"/);
  assert.match(soundSource, /SOUND_STATE_VERSION = 3/);
  assert.match(soundSource, /stored\.volume[^\n]+: 0\.3/);
  assert.match(indexHtml, /data-audio-volume[^>]+value="30"/);
  assert.match(soundSource, /hasStarted \|\| muted[\s\S]+void playCurrent\(\)/);
  assert.match(soundSource, /if \(!muted\) void playCurrent\(\)/);
  assert.match(soundSource, /start\(\)[\s\S]+return playCurrent\(\)/);
  assert.match(soundSource, /muted = true;[\s\S]*pauseAll\(\)/);
  assert.match(soundSource, /track\.muted = muted/);
  assert.match(soundSource, /dataset\.audioState/);
  assert.doesNotMatch(soundSource, /https?:\/\//);
  assert.ok(lobbyTrack.byteLength > 100_000);
  assert.ok(gameTrack.byteLength > 100_000);
});

test("개인 채팅 이모티콘은 외부 이미지 없이 입력창에 삽입된다", async () => {
  const [gameSource, attribution] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("ATTRIBUTIONS.md"),
  ]);

  assert.match(gameSource, /FRIEND_EMOJI_OPTIONS/);
  assert.match(gameSource, /data-action="insert-friend-emoji"/);
  assert.match(gameSource, /setRangeText\(emoji/);
  assert.match(attribution, /Unicode emoji characters/);
  assert.doesNotMatch(gameSource, /emoji[^\n]+https?:\/\//i);
});

test("하드 모드는 빠른 초안을 숨기고 일반 모드는 기존 초안을 유지한다", async () => {
  const [gameSource, styles] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("styles.css"),
  ]);
  assert.match(gameSource, /function chatSuggestions\(stage\) \{\s*if \(state\.difficultyMode === "hard"\) return "";/);
  assert.match(gameSource, /\$\{chatSuggestions\(stage\)\}/);
  assert.match(gameSource, /"hard-defense-1": renderChat/);
  assert.match(gameSource, /"hard-defense-2": renderChat/);
  assert.match(gameSource, /"hard-final": renderChat/);
  assert.match(gameSource, /class="chat-context__facts"/);
  for (const phase of ["hard-defense-1", "hard-defense-2", "hard-final"]) {
    assert.match(styles, new RegExp(`data-phase="${phase}"`));
  }
});

test("캐릭터 프로필은 익명 게시글·흑역사와 세션 댓글을 연다", async () => {
  const [gameSource, styles, indexHtml] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("styles.css"),
    readProjectFile("index.html"),
  ]);
  const ko = getCopy("ko");
  const en = getCopy("en");

  assert.match(gameSource, /data-character-profile=/);
  assert.match(gameSource, /function characterProfileButton/);
  assert.match(gameSource, /function renderCharacterArchive/);
  assert.match(gameSource, /openArchiveView = "profile"/);
  assert.match(gameSource, /data-action="view-character-posts"/);
  assert.match(gameSource, /data-action="back-character-profile"/);
  assert.match(gameSource, /function closeCharacterArchive/);
  assert.match(gameSource, /document\.getElementById\(returnFocusId\)\?\.focus/);
  assert.match(gameSource, /class="home-history-row /);
  assert.match(gameSource, /class="home-history-row__chat"/);
  assert.match(gameSource, /class="friend-row" role="listitem"/);
  assert.match(gameSource, /class="friend-row__chat"/);
  assert.doesNotMatch(gameSource, /<button class="home-history-row /);
  assert.doesNotMatch(gameSource, /<button class="friend-row"/);
  assert.match(gameSource, /class="archive-comment-form"/);
  assert.match(gameSource, /archiveSessionComments/);
  assert.match(gameSource, /denialReplies/);
  assert.match(styles, /\.character-archive/);
  assert.match(styles, /\.character-profile__summary/);
  assert.match(styles, /\.archive-comment\.is-author/);
  assert.match(indexHtml, /id="file-protocol-notice"/);
  assert.match(indexHtml, /window\.location\.protocol === "file:"/);
  assert.match(indexHtml, /scripts\/serve/);
  assert.match(indexHtml, /document\.createElement\("script"\)/);
  for (const characterId of ["mina", "juno", "noel"]) {
    assert.equal(ko.ui.characterArchive.posts[characterId].length, 2);
    assert.equal(en.ui.characterArchive.posts[characterId].length, 2);
    assert.ok(ko.ui.characterArchive.posts[characterId].some((post) => post.isHistory));
    assert.ok(ko.ui.characterArchive.posts[characterId].every((post) => post.comments.some((comment) => comment.isAuthor)));
    assert.equal(ko.ui.characterArchive.denialReplies[characterId].length, 2);
  }
});

test("공개 배포는 Python API 프록시와 비밀 환경변수를 유지한다", async () => {
  const renderConfig = await readProjectFile("render.yaml");
  assert.match(renderConfig, /type: web/);
  assert.match(renderConfig, /runtime: python/);
  assert.match(renderConfig, /scripts\/serve\.py --bind 0\.0\.0\.0 --port \$PORT/);
  assert.match(renderConfig, /key: OPENAI_API_KEY\s+sync: false/);
  assert.doesNotMatch(renderConfig, /sk-[A-Za-z0-9_-]+/);
});

test("첫 화면·프로필·홈과 캐릭터 프로필 이미지는 브라우저 로컬 흐름으로 연결된다", async () => {
  const [gameSource, styles, ...images] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("styles.css"),
    ...["mafia-astronaut-v2.png", "mina.png", "juno.png", "noel.png"]
      .map((name) => readFile(new URL(`assets/images/${name}`, projectRoot))),
  ]);

  assert.match(gameSource, /phase: "welcome"/);
  assert.match(gameSource, /class="welcome-screen"/);
  assert.match(gameSource, /class="profile-form"/);
  assert.match(gameSource, /name="name"[^>]+minlength="1"[^>]+maxlength="12"/);
  assert.match(gameSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(gameSource, /file\.size > 2_000_000/);
  assert.match(gameSource, /canvas\.width = 256/);
  assert.match(gameSource, /window\.localStorage\.setItem\(PROFILE_STORAGE_KEY/);
  assert.match(gameSource, /phase: "home"/);
  assert.match(gameSource, /class="home-screen"/);
  assert.match(gameSource, /homePlayTitle/);
  assert.match(gameSource, /homeChatTitle/);
  assert.match(gameSource, /data-action="get-started"[\s\S]+phase: playerProfile\.name \? "intro" : "profile"/);
  assert.match(gameSource, /class="home-action is-primary"[^>]+data-action="open-tutorial"/);
  assert.match(gameSource, /class="intro-actions"[\s\S]+data-action="start"/);
  assert.match(gameSource, /savePlayerProfile[\s\S]+phase: "intro"/);
  assert.match(styles, /\.welcome-screen/);
  assert.match(styles, /\.home-actions/);
  assert.ok(images.every((image) => image.byteLength > 20_000));
});

function assertMatchingLocaleShape(first, second, path = "copy") {
  if (Array.isArray(first) || Array.isArray(second)) {
    assert.ok(Array.isArray(first) && Array.isArray(second), `${path} 배열 타입이 양 언어에서 같아야 합니다.`);
    assert.equal(first.length, second.length, `${path} 배열 길이가 양 언어에서 같아야 합니다.`);
    return;
  }
  if (first && typeof first === "object") {
    assert.ok(second && typeof second === "object", `${path} 객체 타입이 양 언어에서 같아야 합니다.`);
    assert.deepEqual(Object.keys(first).sort(), Object.keys(second).sort(), `${path} 번역 키가 대칭이어야 합니다.`);
    for (const key of Object.keys(first)) assertMatchingLocaleShape(first[key], second[key], `${path}.${key}`);
    return;
  }
  assert.equal(typeof first, typeof second, `${path} 번역 값 타입이 양 언어에서 같아야 합니다.`);
}

test("2050 MARS.NET 세계관과 캐릭터 배경은 한영 번역 키가 대칭이고 공개 UI에 실존 기업명이 없다", async () => {
  const [indexHtml, gameSource, i18nSource] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("game.js"),
    readProjectFile("i18n.js"),
  ]);
  const ko = getCopy("ko");
  const en = getCopy("en");

  assertMatchingLocaleShape(ko, en);
  assert.equal(ko.meta.brand, "MARS.NET");
  assert.equal(en.meta.brand, "MARS.NET");
  assert.match(ko.ui.welcomePill, /2050.*MARS\.NET/);
  assert.match(en.ui.welcomePill, /2050.*MARS\.NET/);
  assert.match(ko.incident.place, /화성.*산소실/);
  assert.match(ko.incident.time, /22:10.*화성 표준시/);
  assert.match(en.incident.place, /Habitat Oxygen Room/i);
  assert.match(en.incident.time, /22:10.*Mars Standard Time/i);
  assert.match(ko.crew.mina.background, /아이돌/);
  assert.match(ko.crew.juno.background, /생활 시스템/);
  assert.match(ko.crew.noel.background, /방송|스트리머/);
  assert.match(en.crew.mina.background, /idol/i);
  assert.match(en.crew.juno.background, /life-support|habitat/i);
  assert.match(en.crew.noel.background, /stream/i);
  assert.equal(ko.ui.debriefRoundLine("미나", "노엘", "노엘"), "미나에게 증거를 심고 노엘을 몰았고, 노엘이 최종 선택됐습니다.");
  assert.doesNotMatch(`${indexHtml}\n${gameSource}\n${i18nSource}`, /SpaceX|Elon Musk|일론\s*머스크/i);
});

test("직전 판 회상은 실제 결과 요약만 서버에 보내고 한 번의 그룹 대화를 요청한다", async () => {
  const [gameSource, serverSource] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("scripts/serve.py"),
  ]);

  assert.match(gameSource, /function buildDebriefSummary\(\)/);
  assert.match(gameSource, /if \(stage === "debrief"\) payload\.debrief = buildDebriefSummary\(\)/);
  assert.match(gameSource, /requestCharacterChat\("debrief", ui\.debriefRequest\)/);
  assert.match(serverSource, /if payload\["stage"\] == "debrief":\s*return \{"mode": "live", "replies": debrief_reply\(payload\)\}/);
  assert.match(serverSource, /"They remember only the supplied result:/);
  assert.match(serverSource, /Never invent evidence or mention AI, prompts, policies, or hidden rules/);
  assert.match(gameSource, /personalQuest: lastPersonalQuestResult/);
});

test("개인 퀘스트·서로 다른 날 조사일지·탐정 능력은 로컬 상태로 연결된다", async () => {
  const [gameSource, progressionSource, styles] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("progression.js"),
    readProjectFile("styles.css"),
  ]);

  assert.match(gameSource, /data-action="accept-personal-quest"/);
  assert.match(gameSource, /settlePersonalQuest\(levelAward\.progress, state/);
  assert.match(gameSource, /markDebriefViewed\(progression/);
  assert.match(gameSource, /data-action="inspect-suspicion"/);
  assert.match(progressionSource, /clueDates/);
  assert.match(progressionSource, /!current\.clueDates\.includes\(date\)/);
  assert.match(progressionSource, /current\.clues\.length < 5/);
  assert.match(progressionSource, /PROGRESSION_STORAGE_KEY = "mars-net-progression-v1"/);
  assert.match(progressionSource, /INITIAL_CREW_LEVELS/);
  assert.match(progressionSource, /awardCrewLevels/);
  assert.match(gameSource, /data-action="set-difficulty"/);
  assert.match(gameSource, /renderLevelGrowth/);
  assert.doesNotMatch(progressionSource, /transcript|message|api/i);
  assert.match(styles, /@keyframes room-message-enter/);
  assert.match(styles, /@keyframes result-land/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("화면 테마는 시스템·라이트·다크를 지원하고 AI 템플릿 장식을 사용하지 않는다", async () => {
  const [indexHtml, themeSource, styles] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("theme.js"),
    readProjectFile("styles.css"),
  ]);

  assert.match(indexHtml, /data-theme-action/);
  assert.match(themeSource, /\["system", "light", "dark"\]/);
  assert.match(themeSource, /oxygen-room-theme/);
  assert.match(styles, /:root\[data-theme="light"\]/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.doesNotMatch(styles, /(?:linear|radial)-gradient|backdrop-filter|border-left:/);
  assert.doesNotMatch(`${indexHtml}\n${styles}`, /✨|sparkle/i);
});

test("라이트·다크 핵심 색상 역할쌍은 작은 글자 기준 대비를 충족한다", async () => {
  const styles = await readProjectFile("styles.css");
  const selectors = [":root", ':root[data-theme="dark"]'];
  const pairs = [
    ["surface", "on-surface"],
    ["primary", "on-primary"],
    ["primary-container", "on-primary-container"],
    ["tertiary-container", "on-tertiary-container"],
    ["error-container", "on-error-container"],
    ["traitor-container", "on-traitor-container"],
  ];

  const luminance = (hex) => {
    const channels = hex.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255);
    const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  for (const selector of selectors) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
    const tokens = Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]),
    );
    for (const [container, content] of pairs) {
      assert.ok(tokens[container] && tokens[content], `${selector} ${container}/${content} 역할이 필요합니다.`);
      assert.ok(contrast(tokens[container], tokens[content]) >= 4.5, `${selector} ${container}/${content} 대비가 부족합니다.`);
    }
  }
});
