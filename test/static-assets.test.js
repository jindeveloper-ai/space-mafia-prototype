import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.ok(engineSource.includes(`./i18n.js?v=${version}`));
  assert.match(gameSource, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
  assert.match(indexHtml, /data-lang="ko"[^>]+href="\.\/\?lang=ko"/);
  assert.match(indexHtml, /data-lang="en"[^>]+href="\.\/\?lang=en"/);
  assert.match(gameSource, /crew\.map\(\(person\) => factCard\(person\)\)/);
  assert.doesNotMatch(gameSource, /crew\.map\(factCard\)/);
  assert.doesNotMatch(`${indexHtml}\n${gameSource}\n${engineSource}`, /v0\.[34]/);
});

test("자유 입력 채팅은 서버 프록시만 사용하고 브라우저에 비밀값을 넣지 않는다", async () => {
  const [gameSource, adapterSource, indexHtml] = await Promise.all([
    readProjectFile("game.js"),
    readProjectFile("chat-adapter.js"),
    readProjectFile("index.html"),
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
  assert.doesNotMatch(`${gameSource}\n${adapterSource}\n${indexHtml}`, /OPENAI_API_KEY|api\.openai\.com/);
});

test("배경음은 저작권 에셋 없이 대기실·게임 장면과 음량을 제어한다", async () => {
  const [indexHtml, soundSource] = await Promise.all([
    readProjectFile("index.html"),
    readProjectFile("sound.js"),
  ]);

  assert.match(indexHtml, /data-audio-toggle/);
  assert.match(indexHtml, /data-audio-volume/);
  assert.match(soundSource, /scene === "lobby"/);
  assert.match(soundSource, /nextScene === "game"/);
  assert.match(soundSource, /AudioContext/);
  assert.doesNotMatch(soundSource, /https?:\/\//);
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
