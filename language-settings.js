import {
  downloadLanguagePack,
  getInstalledPacks,
  removeLanguagePack,
} from "./language-pack-loader.js?v=0.20.14";
import { SUPPORTED_LOCALES } from "./locale-core.js?v=0.20.14";

/** @typedef {"download" | "update" | "delete"} PackOperation */
/** @typedef {{code: string, nativeName: string, voiceBeta: boolean}} LocaleDetails */
/**
 * @typedef {{
 *   code: string,
 *   nativeName: string,
 *   fileSize: number | null,
 *   version: string | null,
 *   availableVersion: string | null,
 *   installed: boolean,
 *   updateAvailable: boolean,
 *   active: boolean,
 *   voice: {status?: string} | null,
 *   voiceBeta?: boolean,
 * }} LanguagePackState
 */

/** @type {ReadonlyArray<LocaleDetails>} */
const localePolicies = SUPPORTED_LOCALES;
/** @type {Map<string, LocaleDetails>} */
const LOCALE_DETAILS = new Map(localePolicies.map((entry) => [entry.code, entry]));
const SHORT_LOCALE_LABELS = Object.freeze({
  ko: "KO",
  en: "EN",
  ja: "JA",
  "zh-CN": "简",
  "zh-TW": "繁",
  "yue-Hant-HK": "粵",
  "es-419": "ES",
});

/**
 * @param {LanguagePackState} pack
 * @param {PackOperation | null} operation
 * @param {boolean} failed
 */
export function languagePackStatus(pack, operation = null, failed = false) {
  if (operation === "download" || operation === "update") return "downloading";
  if (operation === "delete") return "deleting";
  if (failed) return "failed";
  if (pack.active) return "current";
  if (!pack.availableVersion) return "unavailable";
  if (pack.updateAvailable) return "update";
  if (pack.installed) return "installed";
  return "download";
}

/**
 * @param {LanguagePackState} pack
 * @param {boolean} failed
 */
export function languagePackActions(pack, failed = false) {
  if (failed) return ["retry"];
  if (!pack.availableVersion) return [];
  if (!pack.installed) return ["download"];
  if (pack.active) return pack.updateAvailable ? ["update"] : [];
  return ["apply", ...(pack.updateAvailable ? ["update"] : []), "delete"];
}

/**
 * @param {number | null} bytes
 * @param {string} locale
 */
export function formatPackSize(bytes, locale = "en") {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  const kilobytes = bytes / 1024;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kilobytes)} KB`;
}

/**
 * @param {string} label
 * @param {string} action
 * @param {string} code
 * @param {string} variant
 */
function createButton(label, action, code, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `language-settings__action is-${variant}`;
  button.dataset.languagePackAction = action;
  button.dataset.locale = code;
  button.textContent = label;
  return button;
}

/**
 * @param {LanguagePackState} pack
 * @returns {LanguagePackState}
 */
function enrichedPack(pack) {
  const details = LOCALE_DETAILS.get(pack.code);
  return {
    ...pack,
    nativeName: details?.nativeName ?? pack.nativeName,
    voiceBeta: Boolean(details?.voiceBeta || pack.voice?.status === "beta"),
  };
}

/** @param {{locale: string, labels: any}} settings */
export function initializeLanguageSettings({ locale, labels }) {
  const openers = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll("[data-language-settings-open]")]);
  const currentLabels = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-language-current]")]);
  const dialog = document.querySelector("[data-language-settings-dialog]");
  const closeButton = dialog?.querySelector("[data-language-settings-close]");
  const list = dialog?.querySelector("[data-language-settings-list]");
  const notice = dialog?.querySelector("[data-language-settings-notice]");
  const eyebrow = dialog?.querySelector("[data-language-settings-eyebrow]");
  const title = dialog?.querySelector("[data-language-settings-title]");
  const description = dialog?.querySelector("[data-language-settings-description]");
  if (!openers.length
    || !openers.every((opener) => opener instanceof HTMLButtonElement)
    || !(dialog instanceof HTMLDialogElement)
    || !(closeButton instanceof HTMLButtonElement)
    || !(list instanceof HTMLUListElement)
    || !(notice instanceof HTMLParagraphElement)
    || !(eyebrow instanceof HTMLElement)
    || !(title instanceof HTMLElement)
    || !(description instanceof HTMLElement)) {
    throw new Error("The language settings UI is incomplete.");
  }
  const settingsDialog = dialog;
  const settingsList = list;
  const settingsNotice = notice;
  let returnOpenerIndex = -1;

  for (const opener of openers) opener.setAttribute("aria-label", labels.open);
  for (const current of currentLabels) {
    if (current instanceof HTMLElement) current.textContent = SHORT_LOCALE_LABELS[locale] ?? locale;
  }
  eyebrow.textContent = labels.eyebrow;
  title.textContent = labels.title;
  description.textContent = labels.description;
  closeButton.setAttribute("aria-label", labels.close);
  settingsList.setAttribute("aria-label", labels.listLabel);

  /** @type {LanguagePackState[]} */
  let packs = [];
  /** @type {Map<string, PackOperation>} */
  const operations = new Map();
  /** @type {Map<string, {action: PackOperation, error: unknown}>} */
  const failures = new Map();

  /**
   * @param {HTMLElement} actions
   * @param {LanguagePackState} pack
   */
  function renderPackActions(actions, pack) {
    const operation = operations.get(pack.code);
    const failure = failures.get(pack.code);
    if (operation) {
      const pendingLabel = operation === "delete" ? labels.status.deleting : labels.status.downloading;
      const pending = createButton(pendingLabel, operation, pack.code);
      pending.disabled = true;
      actions.append(pending);
      return;
    }
    for (const action of languagePackActions(pack, Boolean(failure))) {
      const variant = ["download", "apply", "retry"].includes(action)
        ? "primary"
        : action === "delete" ? "danger" : "secondary";
      actions.append(createButton(labels.action[action], action, pack.code, variant));
    }
  }

  function renderPacks() {
    const fragment = document.createDocumentFragment();
    for (const rawPack of packs) {
      const pack = enrichedPack(rawPack);
      const item = document.createElement("li");
      const summary = document.createElement("div");
      const nameLine = document.createElement("div");
      const name = document.createElement("strong");
      const code = document.createElement("code");
      const detail = document.createElement("span");
      const status = document.createElement("span");
      const actions = document.createElement("div");
      const statusKey = languagePackStatus(pack, operations.get(pack.code), failures.has(pack.code));
      const size = formatPackSize(pack.fileSize, locale);

      item.className = "language-settings__item";
      item.dataset.locale = pack.code;
      summary.className = "language-settings__summary";
      nameLine.className = "language-settings__name";
      name.textContent = pack.nativeName;
      code.textContent = pack.code;
      detail.className = "language-settings__detail";
      detail.textContent = size ?? labels.sizeUnknown;
      status.className = `language-settings__status is-${statusKey}`;
      status.textContent = labels.status[statusKey];
      actions.className = "language-settings__actions";

      nameLine.append(name, code);
      if (pack.voiceBeta) {
        const beta = document.createElement("span");
        beta.className = "language-settings__beta";
        beta.textContent = labels.voiceBeta;
        nameLine.append(beta);
      }
      summary.append(nameLine, detail, status);
      renderPackActions(actions, pack);
      item.append(summary, actions);
      fragment.append(item);
    }
    settingsList.replaceChildren(fragment);
  }

  async function refresh() {
    settingsList.setAttribute("aria-busy", "true");
    if (!packs.length) {
      const loading = document.createElement("li");
      loading.className = "language-settings__loading";
      loading.textContent = labels.loading;
      settingsList.replaceChildren(loading);
    }
    try {
      packs = await getInstalledPacks();
      renderPacks();
    } catch {
      const failure = document.createElement("li");
      failure.className = "language-settings__loading is-error";
      failure.textContent = labels.loadFailed;
      failure.append(createButton(labels.action.retry, "refresh", "", "primary"));
      settingsList.replaceChildren(failure);
    } finally {
      settingsList.removeAttribute("aria-busy");
    }
  }

  /**
   * @param {string} action
   * @param {string} code
   */
  async function runPackAction(action, code) {
    const pack = packs.find((candidate) => candidate.code === code);
    if (!pack) return;
    if (action === "apply") {
      const changeEvent = new CustomEvent("mars:locale-change-request", {
        cancelable: true,
        detail: { locale: code },
      });
      if (window.dispatchEvent(changeEvent)) settingsDialog.close();
      return;
    }

    const attemptedAction = action === "retry" ? failures.get(code)?.action : action;
    if (!attemptedAction) return;
    operations.set(code, attemptedAction);
    failures.delete(code);
    settingsNotice.textContent = "";
    renderPacks();
    try {
      if (attemptedAction === "delete") {
        await removeLanguagePack(code);
        settingsNotice.textContent = labels.notice.deleted(enrichedPack(pack).nativeName);
      } else {
        await downloadLanguagePack(code);
        settingsNotice.textContent = attemptedAction === "update"
          ? labels.notice.updated(enrichedPack(pack).nativeName)
          : labels.notice.downloaded(enrichedPack(pack).nativeName);
      }
    } catch (error) {
      failures.set(code, { action: attemptedAction, error });
      settingsNotice.textContent = labels.notice.failed(enrichedPack(pack).nativeName);
    } finally {
      operations.delete(code);
      await refresh();
    }
  }

  for (const [openerIndex, opener] of openers.entries()) {
    opener.addEventListener("click", () => {
      returnOpenerIndex = openerIndex;
      settingsNotice.textContent = "";
      if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
      else settingsDialog.setAttribute("open", "");
      void refresh();
    });
  }
  closeButton.addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("close", () => {
    const returnOpener = openers[returnOpenerIndex];
    if (returnOpener instanceof HTMLButtonElement) returnOpener.focus();
    returnOpenerIndex = -1;
  });
  settingsDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = /** @type {HTMLElement[]} */ ([...settingsDialog.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element instanceof HTMLElement && !element.hidden && element.offsetParent !== null));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  settingsList.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-language-pack-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const action = button.dataset.languagePackAction;
    if (!action) return;
    if (action === "refresh") void refresh();
    else void runPackAction(action, button.dataset.locale ?? "");
  });

  return Object.freeze({ refresh });
}
