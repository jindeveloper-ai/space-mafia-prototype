import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function waitForAddress(server) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 5000);
    server.stdout.setEncoding("utf8");
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before startup with code ${code}`));
    });
  });
}

test("개발 서버는 HTML을 갱신하고 버전 에셋만 장기 캐시한다", async () => {
  const server = spawn("python3", ["scripts/serve.py", "--port", "0", "--quiet"], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const baseUrl = await waitForAddress(server);
    const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
    const [documentResponse, assetResponse] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/game.js?v=${version}`),
    ]);

    assert.equal(documentResponse.status, 200);
    assert.match(documentResponse.headers.get("cache-control"), /no-store/);
    assert.equal(assetResponse.status, 200);
    assert.match(assetResponse.headers.get("cache-control"), /immutable/);
  } finally {
    server.kill("SIGTERM");
    if (server.exitCode === null) await once(server, "exit");
  }
});
