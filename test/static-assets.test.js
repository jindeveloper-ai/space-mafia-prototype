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
  assert.ok(indexHtml.includes(`./game.js?v=${version}`));
  assert.ok(gameSource.includes(`./game-engine.js?v=${version}`));
  assert.ok(gameSource.includes(`./i18n.js?v=${version}`));
  assert.ok(engineSource.includes(`./i18n.js?v=${version}`));
  assert.match(gameSource, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
  assert.match(indexHtml, /data-lang="ko"[^>]+href="\.\/\?lang=ko"/);
  assert.match(indexHtml, /data-lang="en"[^>]+href="\.\/\?lang=en"/);
  assert.doesNotMatch(`${indexHtml}\n${gameSource}\n${engineSource}`, /v0\.[34]/);
});
