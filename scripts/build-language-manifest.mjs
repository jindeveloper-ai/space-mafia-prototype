import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";


const projectRoot = new URL("../", import.meta.url);
const localesRoot = new URL("locales/", projectRoot);
const packMetadata = [
  { code: "ko", nativeName: "한국어", voice: { hint: "ko", status: "stable" } },
  { code: "en", nativeName: "English", voice: { hint: "en", status: "stable" } },
  { code: "ja", nativeName: "日本語", voice: { hint: "ja", status: "stable" } },
  { code: "zh-CN", nativeName: "简体中文", voice: { hint: "zh", status: "stable" } },
  { code: "zh-TW", nativeName: "繁體中文", voice: { hint: "zh", status: "stable" } },
  { code: "yue-Hant-HK", nativeName: "粵語（香港）", voice: { hint: "zh", status: "beta" } },
  { code: "es-419", nativeName: "Español (Latinoamérica)", voice: { hint: "es", status: "stable" } },
];

const packs = await Promise.all(packMetadata.map(async (metadata) => {
  const bytes = await readFile(new URL(`${metadata.code}.js`, localesRoot));
  const source = bytes.toString("utf8");
  const version = source.match(/export const PACK_VERSION = "(\d+\.\d+\.\d+)";/)?.[1];
  if (!version) throw new Error(`Missing or invalid PACK_VERSION in ${metadata.code}.js`);
  return {
    ...metadata,
    version,
    fileSize: bytes.byteLength,
    integrity: `sha256-${createHash("sha256").update(bytes).digest("base64")}`,
  };
}));

await writeFile(
  new URL("manifest.json", localesRoot),
  `${JSON.stringify({ schemaVersion: 1, packs }, null, 2)}\n`,
  "utf8",
);
