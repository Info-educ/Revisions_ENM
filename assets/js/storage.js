// ============================================================
// storage.js
// Persistance locale (localStorage) de la progression et des
// réglages. Le format est volontairement simple (JSON) afin de
// pouvoir être exporté / importé / synchronisé avec GitHub.
//
// MULTI-THÉMATIQUE : chaque thématique (civil / penal / culture-g)
// possède sa propre progression et ses propres réglages, isolées
// les unes des autres via un préfixe de clé localStorage.
// L'ancien format mono-thématique (clés sans thème) est migré
// automatiquement vers la thématique « penal » au premier accès.
// ============================================================

const PROGRESS_PREFIX = "enm.progress.v1";
const SETTINGS_PREFIX = "enm.settings.v1";

// Thématique active courante (définie par l'application au démarrage,
// une fois que l'utilisateur a choisi sur la page d'accueil).
let CURRENT_THEME = "penal";

export function setCurrentTheme(themeId) {
  CURRENT_THEME = themeId || "penal";
  migrateLegacyKeysIfNeeded(CURRENT_THEME);
}

export function getCurrentTheme() {
  return CURRENT_THEME;
}

function progressKey(themeId = CURRENT_THEME) {
  return `${PROGRESS_PREFIX}.${themeId}`;
}

function settingsKey(themeId = CURRENT_THEME) {
  return `${SETTINGS_PREFIX}.${themeId}`;
}

// ------------------------------------------------------------
// Migration de l'ancien format (mono-thématique) vers « penal ».
// Les anciennes clés "enm.progress.v1" / "enm.settings.v1" (sans
// suffixe de thème) correspondaient au contenu pénal historique.
// ------------------------------------------------------------
function migrateLegacyKeysIfNeeded(themeId) {
  if (themeId !== "penal") return;
  try {
    const legacyProgress = localStorage.getItem(PROGRESS_PREFIX);
    if (legacyProgress && !localStorage.getItem(progressKey("penal"))) {
      localStorage.setItem(progressKey("penal"), legacyProgress);
    }
    const legacySettings = localStorage.getItem(SETTINGS_PREFIX);
    if (legacySettings && !localStorage.getItem(settingsKey("penal"))) {
      localStorage.setItem(settingsKey("penal"), legacySettings);
    }
  } catch (e) {
    console.warn("Migration des clés héritées impossible", e);
  }
}

const DEFAULT_SETTINGS = {
  sessionSize: 40, // 0 = illimité
  sessionType: "all", // "all" | "flashcard" | "qcm"
  activeChapters: null, // null = tous les chapitres actifs
  revisionChapters: null, // null = tous les chapitres sélectionnés (onglet Révisions)
  revisionType: "all", // "all" | "flashcard" | "qcm" (onglet Révisions)
  revisionSize: 0, // 0 = illimité (onglet Révisions)
  github: {
    repo: "",
    branch: "main",
    token: "",
    path: "data/progress.json",
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Charge la table de progression complète pour la thématique courante.
 * @returns {Map<string,object>} id -> entrée de progression
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(progressKey());
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj.items || {}));
  } catch (e) {
    console.error("Lecture progression impossible", e);
    return new Map();
  }
}

/**
 * Sauvegarde la table de progression complète pour la thématique courante.
 * @param {Map<string,object>} progressMap
 */
export function saveProgress(progressMap) {
  const items = {};
  for (const [id, entry] of progressMap.entries()) {
    items[id] = entry;
  }
  const payload = {
    version: 1,
    theme: CURRENT_THEME,
    updatedAt: Date.now(),
    items,
  };
  localStorage.setItem(progressKey(), JSON.stringify(payload));
  return payload;
}

/**
 * Exporte la progression sous forme d'objet sérialisable
 * (utilisé pour export fichier ET pour la synchronisation GitHub).
 */
export function exportProgressPayload(progressMap) {
  const items = {};
  for (const [id, entry] of progressMap.entries()) {
    items[id] = entry;
  }
  return {
    version: 1,
    theme: CURRENT_THEME,
    updatedAt: Date.now(),
    items,
  };
}

/**
 * Fusionne un payload importé (fichier ou GitHub) avec la
 * progression locale. Stratégie : on garde l'entrée la plus
 * récente (lastSeenAt le plus grand) pour chaque id.
 */
export function mergeProgress(localMap, importedPayload) {
  const merged = new Map(localMap);
  const importedItems = importedPayload?.items || {};
  for (const [id, entry] of Object.entries(importedItems)) {
    const current = merged.get(id);
    if (!current) {
      merged.set(id, entry);
      continue;
    }
    const currentTime = current.lastSeenAt ?? 0;
    const importedTime = entry.lastSeenAt ?? 0;
    if (importedTime > currentTime) {
      merged.set(id, entry);
    }
  }
  return merged;
}

/**
 * Charge les réglages utilisateur pour la thématique courante.
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsKey());
    if (!raw) return clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...clone(DEFAULT_SETTINGS),
      ...parsed,
      github: { ...clone(DEFAULT_SETTINGS.github), ...(parsed.github || {}) },
    };
  } catch (e) {
    console.error("Lecture réglages impossible", e);
    return clone(DEFAULT_SETTINGS);
  }
}

/**
 * Sauvegarde les réglages utilisateur pour la thématique courante.
 */
export function saveSettings(settings) {
  localStorage.setItem(settingsKey(), JSON.stringify(settings));
}

export function resetAll() {
  localStorage.removeItem(progressKey());
  // On conserve les réglages (notamment le jeton GitHub) lors d'une
  // réinitialisation de la progression.
}
