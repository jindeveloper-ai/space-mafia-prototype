import { SUPPORTED_LOCALE_CODES, canonicalLocale } from "./locale-core.js?v=0.20.14";
import {
  activateRegisteredLocale,
  registerLanguagePack,
} from "./i18n.js?v=0.20.14";


const CACHE_NAME = "mars-net-language-packs-v1";
const REQUIRED_PACK_KEYS = ["meta", "crew", "incident", "claims", "facts", "subquests", "engine", "ui"];

export class LanguagePackError extends Error {
  code;
  originalError;

  constructor(code, cause = undefined) {
    super(code);
    this.name = "LanguagePackError";
    this.code = code;
    if (cause !== undefined) this.originalError = cause;
  }
}

function validateManifest(raw) {
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.packs)) {
    throw new LanguagePackError("invalid_manifest");
  }
  const codes = new Set();
  const packs = raw.packs.map((entry) => {
    const code = canonicalLocale(entry?.code);
    const valid = code
      && entry.code === code
      && typeof entry.nativeName === "string"
      && /^\d+\.\d+\.\d+$/.test(entry.version)
      && Number.isSafeInteger(entry.fileSize)
      && entry.fileSize > 0
      && /^sha256-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)
      && entry.voice
      && typeof entry.voice.hint === "string"
      && ["stable", "beta", "unsupported"].includes(entry.voice.status);
    if (!valid || codes.has(code)) throw new LanguagePackError("invalid_manifest");
    codes.add(code);
    return Object.freeze({
      code,
      nativeName: entry.nativeName,
      version: entry.version,
      fileSize: entry.fileSize,
      integrity: entry.integrity,
      voice: Object.freeze({ ...entry.voice }),
    });
  });
  return Object.freeze({ schemaVersion: 1, packs: Object.freeze(packs) });
}

function validatePackModule(namespace, expectedLocale, expectedVersion) {
  if (namespace?.PACK_SCHEMA_VERSION !== 1) throw new LanguagePackError("invalid_pack_schema");
  if (namespace?.PACK_VERSION !== expectedVersion) throw new LanguagePackError("invalid_pack_version");
  const pack = namespace.default;
  if (!pack || typeof pack !== "object") throw new LanguagePackError("invalid_pack_schema");
  for (const key of REQUIRED_PACK_KEYS) {
    if (!pack[key] || typeof pack[key] !== "object") throw new LanguagePackError("invalid_pack_schema");
  }
  if (pack.meta.locale && pack.meta.locale !== expectedLocale) {
    throw new LanguagePackError("invalid_pack_schema");
  }
  return pack;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return globalThis.btoa(binary);
}

async function integrityFor(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle) throw new LanguagePackError("integrity_unavailable");
  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  return `sha256-${bytesToBase64(new Uint8Array(digest))}`;
}

async function defaultModuleImporter(source, _sourceUrl, entry) {
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const stagingKey = Symbol.for("mars.net.language-pack-staging.v1");
  const staging = globalThis[stagingKey];
  const previous = staging?.get(entry.code);
  staging?.delete(entry.code);
  const script = document.createElement("script");
  script.type = "module";
  script.src = moduleUrl;
  try {
    await new Promise((resolve, reject) => {
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new LanguagePackError("pack_import_failed")), { once: true });
      document.head.append(script);
    });
    const registered = globalThis[stagingKey]?.get(entry.code);
    if (!registered) throw new LanguagePackError("invalid_pack_schema");
    return {
      PACK_SCHEMA_VERSION: registered.schemaVersion,
      PACK_VERSION: registered.version,
      default: registered.pack,
    };
  } finally {
    script.remove();
    if (previous) globalThis[stagingKey]?.set(entry.code, previous);
    else globalThis[stagingKey]?.delete(entry.code);
    URL.revokeObjectURL(moduleUrl);
  }
}

export function createLanguagePackLoader(options = {}) {
  const settings = /** @type {Record<string, any>} */ (options);
  const manifestUrl = new URL(
    settings["manifestUrl"] ?? `./locales/manifest.json?v=${settings["appVersion"] ?? "0.20.14"}`,
    settings["baseUrl"] ?? import.meta.url,
  );
  const fetchImpl = settings["fetchImpl"] ?? globalThis.fetch?.bind(globalThis);
  const cacheStorage = settings["cacheStorage"] ?? globalThis.caches;
  const cryptoImpl = settings["cryptoImpl"] ?? globalThis.crypto;
  const moduleImporter = settings["moduleImporter"] ?? defaultModuleImporter;
  const memorySources = new Map();
  const memoryMetadata = new Map();
  let manifestPromise;
  /** @type {string | null} */
  let activeLocale = null;

  async function openCache() {
    if (!cacheStorage?.open) return null;
    try {
      return await cacheStorage.open(CACHE_NAME);
    } catch {
      return null;
    }
  }

  function packUrl(entry) {
    return new URL(`./${entry.code}.js?v=${entry.version}`, manifestUrl).href;
  }

  function metadataUrl(locale) {
    return new URL(`./.installed/${locale}.json`, manifestUrl).href;
  }

  async function getManifest() {
    if (!manifestPromise) {
      manifestPromise = (async () => {
        let raw = null;
        /** @type {unknown} */
        let downloadError = null;
        try {
          if (!fetchImpl) throw new LanguagePackError("network_unavailable");
          const response = await fetchImpl(manifestUrl.href, { cache: "no-cache", credentials: "same-origin" });
          if (!response?.ok) throw new LanguagePackError("manifest_download_failed");
          raw = await response.json();
        } catch (error) {
          downloadError = error;
        }

        const cache = await openCache();
        if (!raw && cache) {
          try {
            const cached = await cache.match(manifestUrl.href);
            if (cached) raw = await cached.json();
          } catch {
            // The download error below is more useful than a cache parsing detail.
          }
        }
        if (!raw) throw new LanguagePackError("manifest_download_failed", downloadError);

        try {
          const manifest = validateManifest(raw);
          if (cache && !downloadError) {
            try {
              await cache.put(manifestUrl.href, new Response(JSON.stringify(raw), {
                headers: { "Content-Type": "application/json" },
              }));
            } catch {
              // The app can continue with the downloaded manifest in memory.
            }
          }
          return manifest;
        } catch (error) {
          if (error instanceof LanguagePackError) throw error;
          throw new LanguagePackError("invalid_manifest", error);
        }
      })();
    }
    return manifestPromise;
  }

  async function entryFor(locale) {
    const normalized = canonicalLocale(locale);
    if (!normalized) throw new LanguagePackError("unsupported_locale");
    const manifest = await getManifest();
    const entry = manifest.packs.find((candidate) => candidate.code === normalized);
    if (!entry) throw new LanguagePackError("pack_unavailable");
    return entry;
  }

  async function verifyBytes(bytes, entry) {
    if (bytes.byteLength !== entry.fileSize) throw new LanguagePackError("invalid_pack_size");
    const integrity = await integrityFor(bytes, cryptoImpl);
    if (integrity !== entry.integrity) throw new LanguagePackError("integrity_mismatch");
    return new TextDecoder().decode(bytes);
  }

  async function importAndValidate(source, entry) {
    try {
      const namespace = await moduleImporter(source, packUrl(entry), entry);
      return validatePackModule(namespace, entry.code, entry.version);
    } catch (error) {
      if (error instanceof LanguagePackError) throw error;
      throw new LanguagePackError("pack_import_failed", error);
    }
  }

  async function cacheVerifiedPack(entry, bytes) {
    const source = await verifyBytes(bytes, entry);
    await importAndValidate(source, entry);
    const url = packUrl(entry);
    const cache = await openCache();
    if (cache) {
      try {
        await cache.put(url, new Response(bytes, { headers: { "Content-Type": "text/javascript; charset=utf-8" } }));
        await cache.put(metadataUrl(entry.code), new Response(JSON.stringify({ ...entry, url }), {
          headers: { "Content-Type": "application/json" },
        }));
      } catch {
        // A verified in-memory pack still works when Cache Storage is unavailable or full.
      }
    }
    memorySources.set(url, source);
    memoryMetadata.set(entry.code, { ...entry, url });
    return source;
  }

  async function downloadLanguagePack(locale) {
    const entry = await entryFor(locale);
    if (!fetchImpl) throw new LanguagePackError("network_unavailable");
    let response;
    try {
      response = await fetchImpl(packUrl(entry), { cache: "no-store", credentials: "same-origin" });
    } catch (error) {
      throw new LanguagePackError("pack_download_failed", error);
    }
    if (!response?.ok) throw new LanguagePackError("pack_download_failed");
    const bytes = await response.arrayBuffer();
    await cacheVerifiedPack(entry, bytes);
    return { ...entry, installed: true, active: entry.code === activeLocale };
  }

  async function installedMetadata(locale) {
    if (memoryMetadata.has(locale)) return memoryMetadata.get(locale);
    const cache = await openCache();
    if (!cache) return null;
    try {
      const response = await cache.match(metadataUrl(locale));
      if (!response) return null;
      const metadata = await response.json();
      if (canonicalLocale(metadata?.code) !== locale || typeof metadata?.url !== "string") return null;
      memoryMetadata.set(locale, metadata);
      return metadata;
    } catch {
      return null;
    }
  }

  async function sourceFromInstalled(metadata) {
    if (memorySources.has(metadata.url)) return memorySources.get(metadata.url);
    const cache = await openCache();
    if (!cache) return null;
    const response = await cache.match(metadata.url);
    if (!response) return null;
    try {
      const source = await verifyBytes(await response.arrayBuffer(), metadata);
      memorySources.set(metadata.url, source);
      return source;
    } catch {
      await cache.delete(metadata.url);
      return null;
    }
  }

  async function activateLocale(locale) {
    const entry = await entryFor(locale);
    const currentUrl = packUrl(entry);
    let metadata = await installedMetadata(entry.code);
    let source = metadata?.url === currentUrl ? await sourceFromInstalled(metadata) : null;
    if (!source) {
      try {
        await downloadLanguagePack(entry.code);
        metadata = await installedMetadata(entry.code);
        source = metadata ? await sourceFromInstalled(metadata) : memorySources.get(currentUrl);
      } catch (error) {
        if (!metadata || metadata.url === currentUrl) throw error;
        source = await sourceFromInstalled(metadata);
        if (!source) throw error;
      }
    }
    if (!source || !metadata) throw new LanguagePackError("pack_unavailable_offline");
    const pack = await importAndValidate(source, metadata);
    registerLanguagePack(entry.code, pack);
    activeLocale = activateRegisteredLocale(entry.code);
    return activeLocale;
  }

  async function removeLanguagePack(locale) {
    const normalized = canonicalLocale(locale);
    if (!normalized) throw new LanguagePackError("unsupported_locale");
    if (normalized === activeLocale) throw new LanguagePackError("active_pack_cannot_be_removed");
    const metadata = await installedMetadata(normalized);
    const cache = await openCache();
    if (cache) {
      if (metadata?.url) await cache.delete(metadata.url);
      await cache.delete(metadataUrl(normalized));
    }
    if (metadata?.url) memorySources.delete(metadata.url);
    memoryMetadata.delete(normalized);
    return true;
  }

  async function getInstalledPacks() {
    const manifest = await getManifest();
    return Promise.all(SUPPORTED_LOCALE_CODES.map(async (code) => {
      const available = manifest.packs.find((entry) => entry.code === code) ?? null;
      const installed = await installedMetadata(code);
      return {
        code,
        nativeName: available?.nativeName ?? code,
        fileSize: available?.fileSize ?? null,
        version: installed?.version ?? null,
        availableVersion: available?.version ?? null,
        installed: Boolean(installed),
        updateAvailable: Boolean(installed && available && installed.version !== available.version),
        active: code === activeLocale,
        voice: available?.voice ?? null,
      };
    }));
  }

  return Object.freeze({
    activateLocale,
    downloadLanguagePack,
    getInstalledPacks,
    removeLanguagePack,
  });
}

let defaultLoader;

function loader() {
  defaultLoader ??= createLanguagePackLoader();
  return defaultLoader;
}

export function downloadLanguagePack(locale) {
  return loader().downloadLanguagePack(locale);
}

export function activateLocale(locale) {
  return loader().activateLocale(locale);
}

export function removeLanguagePack(locale) {
  return loader().removeLanguagePack(locale);
}

export function getInstalledPacks() {
  return loader().getInstalledPacks();
}
