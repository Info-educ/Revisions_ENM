// ============================================================
// scheduler.js
// Algorithme de planification des révisions.
//
// Chaque item (flashcard ou QCM) possède un "niveau de maîtrise"
// de 0 à 7. Le niveau 0 = jamais validé / à revoir en priorité.
//
// Règle : un item n'est jamais totalement écarté. Plus son
// niveau de maîtrise est élevé, moins il a de chances d'être
// tiré dans une session, mais il reste toujours possible qu'il
// apparaisse (y compris le jour même où il a été validé).
// La sélection se fait par tirage aléatoire pondéré sans
// remise : chaque item reçoit un poids dépendant de son niveau,
// puis on tire les items un par un en tenant compte de ces poids.
// ============================================================

export const MAX_LEVEL = 7;

// Poids relatif de tirage pour chaque niveau de maîtrise (0 à 7).
// Plus le niveau est élevé, plus le poids est faible — mais jamais
// nul, afin qu'un item bien maîtrisé puisse toujours réapparaître,
// simplement moins souvent.
export const WEIGHT_BY_LEVEL = [12, 9, 6.5, 4.5, 3, 2, 1.2, 0.7];

/**
 * Crée un enregistrement de progression vierge pour un item.
 */
export function createProgressEntry() {
  return {
    level: 0,
    seenCount: 0,
    correctCount: 0,
    lastResult: null,
    lastSeenAt: null,
  };
}

/**
 * Calcule le prochain niveau de maîtrise après une réponse.
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

  return {
    level,
    seenCount: (entry.seenCount ?? 0) + 1,
    correctCount: (entry.correctCount ?? 0) + (correct ? 1 : 0),
    lastResult: correct ? "hit" : "miss",
    lastSeenAt: now,
  };
}

/**
 * Renvoie le poids de tirage associé à un niveau de maîtrise.
 */
export function weightForLevel(level) {
  const lvl = Math.max(0, Math.min(MAX_LEVEL, Math.round(level ?? 0)));
  return WEIGHT_BY_LEVEL[lvl];
}

/**
 * Un item est "non encore appris" s'il n'a jamais été répondu
 * correctement (aucune entrée de progression, ou correctCount
 * encore à 0).
 */
export function isUnlearned(entry) {
  return !entry || (entry.correctCount ?? 0) === 0;
}

/**
 * Construit la file d'attente de l'écran d'accueil : uniquement
 * les items pour lesquels aucune bonne réponse n'a encore été
 * donnée. Dès qu'un item est réussi une première fois, il
 * disparaît définitivement de cette file (mais reste disponible
 * dans l'onglet « Révisions »).
 *
 * @param {Array} items - items éligibles (flashcards + QCM mélangés)
 * @param {Map} progressMap - id -> entrée de progression
 * @param {object} opts
 *   - limit: nombre maximal d'items dans la session (0 = illimité)
 * @returns {Array} file d'items non encore appris, ordre aléatoire
 */
export function buildLearningQueue(items, progressMap, opts = {}) {
  const limit = opts.limit ?? 0;
  let ordered = shuffle(items.filter((item) => isUnlearned(progressMap.get(item.id))));
  if (limit > 0 && ordered.length > limit) {
    ordered = ordered.slice(0, limit);
  }
  return ordered;
}

/**
 * Construit la file d'attente d'une session de révision par
 * tirage aléatoire pondéré sans remise (algorithme « A-Res » de
 * Efraimidis & Spirakis) : chaque item reçoit une clé aléatoire
 * dépendant de son poids, puis on trie par clé décroissante.
 * Les items les moins maîtrisés ont une probabilité plus forte
 * d'apparaître en tête, sans qu'aucun item ne soit jamais exclu
 * d'office.
 *
 * @param {Array} items - items éligibles (flashcards + QCM mélangés)
 * @param {Map} progressMap - id -> entrée de progression
 * @param {object} opts
 *   - limit: nombre maximal d'items dans la session (0 = illimité)
 * @returns {Array} file d'items, ordre aléatoire pondéré
 */
export function buildSessionQueue(items, progressMap, opts = {}) {
  const limit = opts.limit ?? 0;

  const keyed = items.map((item) => {
    const level = progressMap.get(item.id)?.level ?? 0;
    const weight = weightForLevel(level);
    const u = Math.random();
    const key = Math.pow(Math.max(u, 1e-9), 1 / weight);
    return { item, key };
  });

  keyed.sort((a, b) => b.key - a.key);

  let ordered = keyed.map((k) => k.item);
  if (limit > 0 && ordered.length > limit) {
    ordered = ordered.slice(0, limit);
  }
  return ordered;
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
 * Mélange aléatoirement les propositions d'un QCM et renvoie le
 * nouvel ordre des options ainsi que le nouvel index de la bonne
 * réponse, afin que la position de la réponse correcte varie
 * d'une présentation à l'autre.
 *
 * @param {object} item - item de type "qcm" (avec .options et .answer)
 * @returns {{options: string[], answer: number}}
 */
export function shuffleQcmOptions(item) {
  const indices = item.options.map((_, i) => i);
  const order = shuffle(indices);
  return {
    options: order.map((i) => item.options[i]),
    answer: order.indexOf(item.answer),
  };
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
