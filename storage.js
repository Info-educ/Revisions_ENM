// ============================================================
// storage.js  –  Cabinet ENM
//
// Format de progression v2 : UN SEUL fichier data/progress.json
// couvrant les trois matières. Structure :
//
//   {
//     "version": 2,
//     "updatedAt": <timestamp>,
//     "themes": {
//       "penal":     { "items": { ... } },
//       "civil":     { "items": { ... } },
//       "culture-g": { "items": { ... } }
//     }
//   }
//
// Ce format unique simplifie la synchronisation GitHub : il n'y a
// qu'un seul fichier à déposer / restaurer, et la config de synchro
// est partagée entre les trois matières (même dépôt, même branche,
// même chemin).
//
// Migration automatique :
//  • Ancien format v1 sans clé « theme » → pénal (progress.json natif)
//  • Ancien format v1 avec clé « theme » (per-item intermédiaire)
//    → section de la matière correspondante
//  • Anciennes clés localStorage isolées par matière
//    → rapatriées dans la clé unique avant suppression
// ============================================================

// Clé unique dans localStorage pour TOUTE la progression multi-matières.
const PROGRESS_KEY   = "enm.progress.v2";
// Clé des réglages (partagés entre matières, sauf activeChapters / revisionChapters
// qui sont écrasés à chaque entrée dans une matière).
const SETTINGS_KEY   = "enm.settings.v1";

// Les anciennes clés v1 per-thème (préfixe + ".penal", etc.)
const LEGACY_V1_BASE = "enm.progress.v1";

let CURRENT_THEME = "penal";

export function setCurrentTheme(id) {
  CURRENT_THEME = id || "penal";
  _migrateLegacy();
}

export function getCurrentTheme() {
  return CURRENT_THEME;
}

// -----------------------------------------------------------
// Chargement / sauvegarde du bloc multi-matières complet
// -----------------------------------------------------------

/** Charge le bloc complet depuis localStorage (ou retourne un bloc vide). */
function _loadAllThemes() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj.version === 2 && obj.themes) return obj;
    }
  } catch (_) {}
  return { version: 2, updatedAt: Date.now(), themes: {} };
}

/** Sauvegarde le bloc complet dans localStorage. */
function _saveAllThemes(block) {
  block.updatedAt = Date.now();
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(block));
}

// -----------------------------------------------------------
// API publique — progression (thématique courante)
// -----------------------------------------------------------

/**
 * Charge la progression de la thématique courante.
 * @returns {Map<string, object>}
 */
export function loadProgress() {
  const block = _loadAllThemes();
  const section = block.themes[CURRENT_THEME] || {};
  return new Map(Object.entries(section.items || {}));
}

/**
 * Sauvegarde la progression de la thématique courante dans le bloc
 * commun (les autres thématiques ne sont pas touchées).
 */
export function saveProgress(progressMap) {
  const block = _loadAllThemes();
  if (!block.themes[CURRENT_THEME]) block.themes[CURRENT_THEME] = {};
  block.themes[CURRENT_THEME].items = Object.fromEntries(progressMap);
  _saveAllThemes(block);
  return _buildPayload(block);
}

// -----------------------------------------------------------
// Export / Import / Merge  (pour synchro GitHub et fichier)
// -----------------------------------------------------------

/**
 * Construit le payload complet à envoyer sur GitHub
 * (toutes les matières, format v2).
 */
function _buildPayload(block) {
  return {
    version: 2,
    updatedAt: block.updatedAt,
    themes: block.themes,
  };
}

/**
 * Retourne le payload multi-matières complet à sérialiser.
 * Utilisé pour l'export fichier ET la synchronisation GitHub.
 */
export function exportProgressPayload(progressMap) {
  // On écrit d'abord la thématique courante pour être sûr qu'elle
  // est à jour, puis on exporte tout le bloc.
  return saveProgress(progressMap);
}

/**
 * Fusionne un payload importé (GitHub ou fichier) avec la
 * progression locale complète.
 *
 * Formats acceptés :
 *  • v2 multi-thématique (format natif actuel)
 *  • v1 mono-thématique sans clé « theme » → pénal
 *  • v1 mono-thématique avec clé « theme » → matière indiquée
 */
export function mergeProgress(localMap, importedPayload) {
  if (!importedPayload) return localMap;

  // --- normalise en v2 ---
  let importedBlock;
  if (importedPayload.version === 2 && importedPayload.themes) {
    importedBlock = importedPayload;
  } else {
    // Ancien format v1 : on le range dans la bonne matière.
    const themeId = importedPayload.theme || "penal";
    importedBlock = {
      version: 2,
      updatedAt: importedPayload.updatedAt || Date.now(),
      themes: { [themeId]: { items: importedPayload.items || {} } },
    };
  }

  // Fusionne les items de la thématique courante (pour la Map retournée
  // qui sera utilisée directement par app.js).
  const importedCurrent = importedBlock.themes[CURRENT_THEME]?.items || {};
  const merged = new Map(localMap);
  for (const [id, entry] of Object.entries(importedCurrent)) {
    const current = merged.get(id);
    if (!current || (entry.lastSeenAt ?? 0) > (current.lastSeenAt ?? 0)) {
      merged.set(id, entry);
    }
  }

  // Fusionne aussi les AUTRES thématiques directement dans localStorage
  // (app.js ne voit que la thématique courante via sa Map).
  const localBlock = _loadAllThemes();
  for (const [tid, section] of Object.entries(importedBlock.themes)) {
    if (tid === CURRENT_THEME) continue; // déjà géré via la Map ci-dessus
    if (!localBlock.themes[tid]) localBlock.themes[tid] = { items: {} };
    for (const [id, entry] of Object.entries(section.items || {})) {
      const cur = localBlock.themes[tid].items[id];
      if (!cur || (entry.lastSeenAt ?? 0) > (cur.lastSeenAt ?? 0)) {
        localBlock.themes[tid].items[id] = entry;
      }
    }
  }
  // On persiste les autres thématiques fusionnées ; la thématique
  // courante sera sauvée par app.js via saveProgress(merged).
  if (!localBlock.themes[CURRENT_THEME]) localBlock.themes[CURRENT_THEME] = { items: {} };
  localBlock.themes[CURRENT_THEME].items = Object.fromEntries(merged);
  _saveAllThemes(localBlock);

  return merged;
}

/**
 * Réinitialise la progression de la thématique courante uniquement.
 */
export function resetAll() {
  const block = _loadAllThemes();
  block.themes[CURRENT_THEME] = { items: {} };
  _saveAllThemes(block);
}

// -----------------------------------------------------------
// Réglages (partagés entre matières)
// -----------------------------------------------------------

const DEFAULT_SETTINGS = {
  sessionSize: 40,
  sessionType: "all",
  activeChapters: null,
  revisionChapters: null,
  revisionType: "all",
  revisionSize: 0,
  github: {
    repo: "",
    branch: "main",
    token: "",
    path: "data/progress.json",   // chemin UNIQUE, identique pour toutes les matières
  },
};

function _clone(obj) { return JSON.parse(JSON.stringify(obj)); }

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return _clone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ..._clone(DEFAULT_SETTINGS),
      ...parsed,
      github: {
        ..._clone(DEFAULT_SETTINGS.github),
        ...(parsed.github || {}),
        // Le chemin est unique et non configurable : on ignore
        // volontairement toute valeur différente qui aurait pu être
        // écrite par une ancienne version de l'app (ex. chemins
        // séparés par matière), afin d'éviter une dérive silencieuse
        // qui ferait pointer la synchro vers un fichier inexistant.
        path: DEFAULT_SETTINGS.github.path,
      },
    };
  } catch (_) {
    return _clone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// -----------------------------------------------------------
// Migration automatique des anciens formats
// -----------------------------------------------------------

/**
 * Appelée à chaque setCurrentTheme.
 * Détecte et importe les données stockées dans les anciennes clés
 * localStorage (format v1 per-thème) vers le nouveau bloc unique v2.
 * Les anciennes clés sont supprimées après migration réussie.
 */
function _migrateLegacy() {
  try {
    const block = _loadAllThemes();
    let dirty = false;

    for (const tid of ["penal", "civil", "culture-g"]) {
      const oldKey = `${LEGACY_V1_BASE}.${tid}`;
      const raw = localStorage.getItem(oldKey);
      if (!raw) continue;
      const old = JSON.parse(raw);
      const oldItems = old.items || {};
      if (!block.themes[tid]) block.themes[tid] = { items: {} };
      for (const [id, entry] of Object.entries(oldItems)) {
        const cur = block.themes[tid].items[id];
        if (!cur || (entry.lastSeenAt ?? 0) > (cur.lastSeenAt ?? 0)) {
          block.themes[tid].items[id] = entry;
          dirty = true;
        }
      }
      localStorage.removeItem(oldKey);
    }

    // Ancienne clé v1 sans suffixe (tout premier format mono-pénal)
    const rawBase = localStorage.getItem(LEGACY_V1_BASE);
    if (rawBase) {
      const old = JSON.parse(rawBase);
      const themeId = old.theme || "penal";
      const oldItems = old.items || {};
      if (!block.themes[themeId]) block.themes[themeId] = { items: {} };
      for (const [id, entry] of Object.entries(oldItems)) {
        const cur = block.themes[themeId].items[id];
        if (!cur || (entry.lastSeenAt ?? 0) > (cur.lastSeenAt ?? 0)) {
          block.themes[themeId].items[id] = entry;
          dirty = true;
        }
      }
      localStorage.removeItem(LEGACY_V1_BASE);
    }

    if (dirty) _saveAllThemes(block);
  } catch (e) {
    console.warn("Migration progression impossible :", e);
  }
}
