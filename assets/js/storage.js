// ============================================================
// storage.js
// Persistance locale (localStorage) de la progression et des
// réglages. Le format est volontairement simple (JSON) afin de
// pouvoir être exporté / importé / synchronisé avec GitHub.
// ============================================================

const PROGRESS_KEY = "enm.progress.v1";
const SETTINGS_KEY = "enm.settings.v1";

const DEFAULT_SETTINGS = {
  sessionSize: 40, // 0 = illimité
  activeChapters: null, // null = tous les chapitres actifs
  github: {
    repo: "",
    branch: "main",
    token: "",
    path: "data/progress.json",
  },
};

/**
 * Charge la table de progression complète.
 * @returns {Map<string,object>} id -> entrée de progression
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj.items || {}));
  } catch (e) {
    console.error("Lecture progression impossible", e);
    return new Map();
  }
}

/**
 * Sauvegarde la table de progression complète.
 * @param {Map<string,object>} progressMap
 */
export function saveProgress(progressMap) {
  const items = {};
  for (const [id, entry] of progressMap.entries()) {
    items[id] = entry;
  }
  const payload = {
    version: 1,
    updatedAt: Date.now(),
    items,
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
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
 * Charge les réglages utilisateur.
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      github: { ...structuredClone(DEFAULT_SETTINGS.github), ...(parsed.github || {}) },
    };
  } catch (e) {
    console.error("Lecture réglages impossible", e);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/**
 * Sauvegarde les réglages utilisateur.
 */
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function resetAll() {
  localStorage.removeItem(PROGRESS_KEY);
  // On conserve les réglages (notamment le jeton GitHub) lors d'une
  // réinitialisation de la progression.
}
