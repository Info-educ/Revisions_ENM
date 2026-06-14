// ============================================================
// scheduler.js
// Algorithme de planification des révisions.
//
// Chaque item (flashcard ou QCM) possède un "niveau de maîtrise"
// de 0 à 6. Le niveau 0 = jamais validé / à revoir en priorité.
// Plus le niveau est élevé, plus l'intervalle avant la prochaine
// présentation est long (répétition espacée).
//
// Règle demandée : au sein d'une session, un item validé (réponse
// correcte) ne réapparaît plus jusqu'à ce que tous les items non
// maîtrisés de la session aient été traités. Un item raté est
// replacé plus loin dans la file et devra donc être retraité
// avant la fin de la session.
// ============================================================

// Intervalle (en jours) avant qu'un item de ce niveau redevienne "dû".
// Niveau 0 -> toujours dû (apprentissage / à revoir).
export const LEVEL_INTERVALS_DAYS = [0, 1, 2, 4, 9, 20, 45, 100];
export const MAX_LEVEL = LEVEL_INTERVALS_DAYS.length - 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Crée un enregistrement de progression vierge pour un item.
 */
export function createProgressEntry() {
  return {
    level: 0,
    dueAt: 0, // 0 = toujours dû (jamais vu)
    seenCount: 0,
    correctCount: 0,
    lastResult: null,
    lastSeenAt: null,
  };
}

/**
 * Calcule le prochain niveau et la prochaine date d'échéance
 * après une réponse.
 * @param {object} entry - entrée de progression actuelle
 * @param {boolean} correct - réponse correcte ou non
 * @returns {object} nouvelle entrée de progression
 */
export function applyResult(entry, correct) {
  const now = Date.now();
  let level = entry.level ?? 0;

  if (correct) {
    level = Math.min(level + 1, MAX_LEVEL);
  } else {
    // Une erreur fait redescendre franchement, mais jamais en dessous de 0.
    level = Math.max(level - 2, 0);
  }

  const days = LEVEL_INTERVALS_DAYS[level];
  const dueAt = days === 0 ? now : now + days * DAY_MS;

  return {
    level,
    dueAt,
    seenCount: (entry.seenCount ?? 0) + 1,
    correctCount: (entry.correctCount ?? 0) + (correct ? 1 : 0),
    lastResult: correct ? "hit" : "miss",
    lastSeenAt: now,
  };
}

/**
 * Un item est "dû" s'il n'a jamais été vu, ou si sa date
 * d'échéance est passée.
 */
export function isDue(entry, now = Date.now()) {
  if (!entry) return true;
  return (entry.dueAt ?? 0) <= now;
}

/**
 * Construit la file d'attente d'une session de révision.
 *
 * @param {Array} items - items éligibles (flashcards + QCM mélangés)
 * @param {Map} progressMap - id -> entrée de progression
 * @param {object} opts
 *   - limit: nombre maximal d'items dans la session (0 = illimité)
 * @returns {Array} file mélangée, items dus en priorité, items
 *   de niveau faible passant en premier si limite atteinte.
 */
export function buildSessionQueue(items, progressMap, opts = {}) {
  const now = Date.now();
  const due = items.filter((item) => isDue(progressMap.get(item.id), now));

  // Trie par niveau croissant (les moins maîtrisés d'abord) puis
  // mélange à l'intérieur de chaque niveau pour l'aléatoire.
  const byLevel = new Map();
  for (const item of due) {
    const lvl = progressMap.get(item.id)?.level ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(item);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  let ordered = [];
  for (const lvl of levels) {
    ordered = ordered.concat(shuffle(byLevel.get(lvl)));
  }

  const limit = opts.limit ?? 0;
  if (limit > 0 && ordered.length > limit) {
    ordered = ordered.slice(0, limit);
  }

  // Mélange final léger pour ne pas avoir un bloc "niveau 0" trop
  // visible, tout en gardant les priorités globalement respectées
  // via interleaving.
  return interleave(ordered);
}

/**
 * Mélange aléatoire (Fisher-Yates).
 */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Entrelace légèrement une liste déjà ordonnée par priorité, pour
 * éviter de présenter 40 items de niveau 0 d'affilée tout en
 * conservant globalement la priorité.
 */
function interleave(arr) {
  if (arr.length <= 3) return arr;
  const chunkSize = Math.max(1, Math.floor(arr.length / 6));
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(shuffle(arr.slice(i, i + chunkSize)));
  }
  return chunks.flat();
}

/**
 * Insère un item raté plus loin dans la file de session, pour
 * qu'il revienne avant la fin de la session mais pas
 * immédiatement.
 */
export function requeueAfterMiss(queue, item) {
  const rest = queue.filter((q) => q !== item);
  if (rest.length === 0) {
    return [item];
  }
  // Position aléatoire dans le tiers restant de la file, avec un
  // minimum de 1 pour ne jamais redemander juste après.
  const minPos = 1;
  const maxPos = rest.length;
  const pos = Math.min(
    rest.length,
    Math.max(minPos, Math.floor(Math.random() * (maxPos - minPos + 1)) + minPos)
  );
  rest.splice(pos, 0, item);
  return rest;
}

/**
 * Regroupe les items par niveau pour affichage de statistiques.
 */
export function levelDistribution(items, progressMap) {
  const dist = new Array(MAX_LEVEL + 1).fill(0);
  for (const item of items) {
    const lvl = progressMap.get(item.id)?.level ?? 0;
    dist[lvl] += 1;
  }
  return dist;
}

export const LEVEL_LABELS = [
  "Niv. 0 — Nouveau",
  "Niv. 1",
  "Niv. 2",
  "Niv. 3",
  "Niv. 4",
  "Niv. 5",
  "Niv. 6",
  "Niv. 7 — Acquis",
];
