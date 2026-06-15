// ============================================================
// app.js — Cabinet ENM, moteur principal
// ============================================================
import {
  createProgressEntry,
  applyResult,
  buildSessionQueue,
  requeueAfterMiss,
  shuffle,
  shuffleQcmOptions,
} from "./scheduler.js";
import {
  loadProgress,
  saveProgress,
  loadSettings,
  saveSettings,
  exportProgressPayload,
  mergeProgress,
  resetAll,
} from "./storage.js";
import { pullProgress, pushProgress } from "./github-sync.js";

// ------------------------------------------------------------
// État global
// ------------------------------------------------------------
const state = {
  chaptersMeta: [],   // [{id, title, category, counts:{fc, qcm}}]
  allItems: [],       // [{id, type, chapterId, chapterTitle, ...payload}]
  progress: new Map(),
  settings: loadSettings(),
  session: null,      // { queue, total, validatedCount, current }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------
// Chargement des données
// ------------------------------------------------------------
async function loadAllChapters() {
  let manifest;
  try {
    const res = await fetch("data/manifest.json");
    manifest = await res.json();
  } catch (e) {
    console.error("Impossible de charger data/manifest.json", e);
    manifest = { chapters: [] };
  }

  const chaptersMeta = [];
  const allItems = [];

  for (const entry of manifest.chapters || []) {
    try {
      const res = await fetch(`data/${entry.file}`);
      const chapter = await res.json();

      const flashcards = chapter.flashcards || [];
      const qcm = chapter.qcm || [];

      for (const fc of flashcards) {
        allItems.push({
          id: fc.id,
          type: "flashcard",
          chapterId: chapter.id || entry.id,
          chapterTitle: chapter.title || entry.title,
          front: fc.front,
          back: fc.back,
          tags: fc.tags || [],
        });
      }
      for (const q of qcm) {
        allItems.push({
          id: q.id,
          type: "qcm",
          chapterId: chapter.id || entry.id,
          chapterTitle: chapter.title || entry.title,
          question: q.question,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          tags: q.tags || [],
        });
      }

      chaptersMeta.push({
        id: chapter.id || entry.id,
        title: chapter.title || entry.title,
        category: chapter.category || entry.category || "",
        counts: { fc: flashcards.length, qcm: qcm.length },
      });
    } catch (e) {
      console.warn(`Chapitre illisible : ${entry.file}`, e);
    }
  }

  state.chaptersMeta = chaptersMeta;
  state.allItems = allItems;

  // Initialise la liste des chapitres actifs si nécessaire
  if (!state.settings.activeChapters) {
    state.settings.activeChapters = chaptersMeta.map((c) => c.id);
    saveSettings(state.settings);
  } else {
    // Ajoute automatiquement les nouveaux chapitres détectés
    const known = new Set(state.settings.activeChapters);
    let changed = false;
    for (const c of chaptersMeta) {
      if (!known.has(c.id)) {
        state.settings.activeChapters.push(c.id);
        changed = true;
      }
    }
    if (changed) saveSettings(state.settings);
  }

  // Initialise la liste des chapitres sélectionnés pour l'onglet
  // « Révisions » (indépendante des chapitres actifs des sessions).
  if (!state.settings.revisionChapters) {
    state.settings.revisionChapters = chaptersMeta.map((c) => c.id);
    saveSettings(state.settings);
  } else {
    const known = new Set(state.settings.revisionChapters);
    let changed = false;
    for (const c of chaptersMeta) {
      if (!known.has(c.id)) {
        state.settings.revisionChapters.push(c.id);
        changed = true;
      }
    }
    if (changed) saveSettings(state.settings);
  }
}

function getActiveItems() {
  const active = new Set(state.settings.activeChapters || []);
  return state.allItems.filter((it) => active.has(it.chapterId));
}

function getSessionItems() {
  const items = getActiveItems();
  const type = state.settings.sessionType || "all";
  if (type === "all") return items;
  return items.filter((it) => it.type === type);
}

/**
 * Items pour l'onglet « Révisions » : tous les items des chapitres
 * sélectionnés pour cet onglet, filtrés par type, sans tenir
 * compte du niveau de maîtrise.
 */
function getRevisionItems() {
  const selected = new Set(state.settings.revisionChapters || []);
  const type = state.settings.revisionType || "all";
  return state.allItems.filter((it) => {
    if (!selected.has(it.chapterId)) return false;
    if (type !== "all" && it.type !== type) return false;
    return true;
  });
}

function ensureProgressEntry(id) {
  if (!state.progress.has(id)) {
    state.progress.set(id, createProgressEntry());
  }
  return state.progress.get(id);
}

// ------------------------------------------------------------
// Navigation entre vues
// ------------------------------------------------------------
function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
  $$("[data-view]").forEach((btn) => {
    if (btn.id === "btn-start-session") return;
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
  if (name === "accueil") renderDashboard();
  if (name === "chapitres") renderChapitres();
  if (name === "revisions") renderRevisions();
  if (name === "reglages") renderReglages();
  window.scrollTo(0, 0);
}

function setupNav() {
  $$(".bottombar__btn, .desktopbar__btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
}

// ------------------------------------------------------------
// Tableau de bord
// ------------------------------------------------------------
function renderDashboard() {
  const items = getActiveItems();
  const sessionItems = getSessionItems();

  // Items "prioritaires" : peu ou pas maîtrisés (niveau ≤ 2).
  // N'exclut rien de la session — sert uniquement d'indicateur.
  const priorityCount = sessionItems.filter(
    (it) => (state.progress.get(it.id)?.level ?? 0) <= 2
  ).length;
  $("#due-count").textContent = priorityCount;
  $("#due-label").textContent = {
    all: "fiches & QCM",
    flashcard: "fiches",
    qcm: "QCM",
  }[state.settings.sessionType || "all"];

  const newCount = items.filter((it) => !state.progress.has(it.id)).length;
  const masteredCount = items.filter((it) => (state.progress.get(it.id)?.level ?? 0) >= 5).length;

  $("#stat-total").textContent = items.length;
  $("#stat-mastered").textContent = masteredCount;
  $("#stat-new").textContent = newCount;
  $("#stat-chapters").textContent = state.chaptersMeta.length;
}

// ------------------------------------------------------------
// Vue Chapitres
// ------------------------------------------------------------
function renderChapitres() {
  const list = $("#chapter-manage-list");
  list.innerHTML = "";
  const activeSet = new Set(state.settings.activeChapters || []);

  for (const ch of state.chaptersMeta) {
    const chItems = state.allItems.filter((it) => it.chapterId === ch.id);
    const priority = chItems.filter((it) => (state.progress.get(it.id)?.level ?? 0) <= 2).length;
    const li = document.createElement("li");
    li.innerHTML = `
      <label class="chapter-toggle">
        <input type="checkbox" data-chapter="${ch.id}" ${activeSet.has(ch.id) ? "checked" : ""}>
        <span class="chapter-toggle__text">
          <span class="chapter-manage-list__title">${escapeHtml(ch.title)}</span>
          <span class="chapter-manage-list__meta">${ch.counts.fc} fiches · ${ch.counts.qcm} QCM${ch.category ? " · " + escapeHtml(ch.category) : ""}</span>
        </span>
      </label>
      <span class="chapter-due-badge ${priority === 0 ? "is-zero" : ""}" title="Items peu maîtrisés">${priority}</span>
    `;
    list.appendChild(li);
  }

  $$("#chapter-manage-list input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.chapter;
      const set = new Set(state.settings.activeChapters || []);
      if (cb.checked) set.add(id);
      else set.delete(id);
      state.settings.activeChapters = [...set];
      saveSettings(state.settings);
    });
  });
}

function renderSessionTypeSegmented() {
  $$("#session-type-segmented button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.type === (state.settings.sessionType || "all"));
  });
}

function setupSessionType() {
  $$("#session-type-segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.sessionType = btn.dataset.type;
      saveSettings(state.settings);
      renderSessionTypeSegmented();
      renderDashboard();
    });
  });
  renderSessionTypeSegmented();
}

function renderSessionSizeSegmented() {
  $$("#session-size-segmented button").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.size) === state.settings.sessionSize);
  });
}

function setupSessionSize() {
  $$("#session-size-segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.sessionSize = Number(btn.dataset.size);
      saveSettings(state.settings);
      renderSessionSizeSegmented();
    });
  });
  renderSessionSizeSegmented();
}

// ------------------------------------------------------------
// Vue Révisions (parcours complet par thématiques, sans tenir
// compte du niveau de maîtrise)
// ------------------------------------------------------------
function renderRevisions() {
  const list = $("#revision-chapter-list");
  list.innerHTML = "";
  const selected = new Set(state.settings.revisionChapters || []);

  for (const ch of state.chaptersMeta) {
    const li = document.createElement("li");
    li.innerHTML = `
      <label class="chapter-toggle">
        <input type="checkbox" data-chapter="${ch.id}" ${selected.has(ch.id) ? "checked" : ""}>
        <span class="chapter-toggle__text">
          <span class="chapter-manage-list__title">${escapeHtml(ch.title)}</span>
          <span class="chapter-manage-list__meta">${ch.counts.fc} fiches · ${ch.counts.qcm} QCM${ch.category ? " · " + escapeHtml(ch.category) : ""}</span>
        </span>
      </label>
    `;
    list.appendChild(li);
  }

  $$("#revision-chapter-list input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.chapter;
      const set = new Set(state.settings.revisionChapters || []);
      if (cb.checked) set.add(id);
      else set.delete(id);
      state.settings.revisionChapters = [...set];
      saveSettings(state.settings);
      renderRevisionsSummary();
    });
  });

  renderRevisionTypeSegmented();
  renderRevisionsSummary();
}

function renderRevisionsSummary() {
  const items = getRevisionItems();
  const fc = items.filter((it) => it.type === "flashcard").length;
  const qcm = items.filter((it) => it.type === "qcm").length;
  $("#revision-summary").textContent =
    items.length === 0
      ? "Aucun item ne correspond à cette sélection."
      : `${items.length} item${items.length > 1 ? "s" : ""} (${fc} fiche${fc > 1 ? "s" : ""}, ${qcm} QCM) seront proposés, dans un ordre aléatoire.`;
}

function renderRevisionTypeSegmented() {
  $$("#revision-type-segmented button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.type === (state.settings.revisionType || "all"));
  });
}

function setupRevisions() {
  $$("#revision-type-segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.revisionType = btn.dataset.type;
      saveSettings(state.settings);
      renderRevisionTypeSegmented();
      renderRevisionsSummary();
    });
  });

  $("#btn-select-all-chapters").addEventListener("click", () => {
    state.settings.revisionChapters = state.chaptersMeta.map((c) => c.id);
    saveSettings(state.settings);
    renderRevisions();
  });

  $("#btn-select-none-chapters").addEventListener("click", () => {
    state.settings.revisionChapters = [];
    saveSettings(state.settings);
    renderRevisions();
  });

  $("#btn-start-revision").addEventListener("click", startRevisionSession);
}

function startRevisionSession() {
  const items = getRevisionItems();

  if (items.length === 0) {
    alert("Aucun item ne correspond à cette sélection. Cochez au moins un chapitre.");
    return;
  }

  const queue = shuffle(items);

  state.session = {
    queue,
    total: queue.length,
    validatedCount: 0,
    current: null,
  };

  showView("session");
  $("#session-end").hidden = true;
  $("#fc-controls").hidden = true;
  $("#qcm-controls").hidden = true;
  nextCard();
}

// ------------------------------------------------------------
// Vue Réglages
// ------------------------------------------------------------
function renderReglages() {
  $("#gh-repo").value = state.settings.github.repo || "";
  $("#gh-branch").value = state.settings.github.branch || "main";
  $("#gh-token").value = state.settings.github.token || "";
}

function setupReglages() {
  $("#btn-export").addEventListener("click", () => {
    const payload = exportProgressPayload(state.progress);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enm-progression-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      state.progress = mergeProgress(state.progress, payload);
      saveProgress(state.progress);
      renderDashboard();
      setSyncStatus("synced");
      alert("Progression importée avec succès.");
    } catch (err) {
      alert("Fichier illisible : " + err.message);
    }
    e.target.value = "";
  });

  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Réinitialiser TOUTE la progression ? Cette action est irréversible.")) return;
    resetAll();
    state.progress = new Map();
    renderDashboard();
    setSyncStatus("offline");
  });

  // GitHub
  const ghFields = ["gh-repo", "gh-branch", "gh-token"];
  ghFields.forEach((id) => {
    $("#" + id).addEventListener("change", () => {
      state.settings.github.repo = $("#gh-repo").value.trim().replace(/\s+/g, "");
      state.settings.github.branch = $("#gh-branch").value.trim() || "main";
      state.settings.github.token = $("#gh-token").value.trim();
      saveSettings(state.settings);
    });
  });

  $("#btn-gh-pull").addEventListener("click", async () => {
    const status = $("#gh-status");
    status.textContent = "Chargement depuis GitHub…";
    try {
      const payload = await pullProgress(state.settings.github);
      if (!payload) {
        status.textContent = "Aucun fichier progress.json trouvé sur le dépôt (ce sera créé lors de la prochaine sauvegarde).";
        return;
      }
      state.progress = mergeProgress(state.progress, payload);
      saveProgress(state.progress);
      renderDashboard();
      setSyncStatus("synced");
      status.textContent = "Progression chargée et fusionnée avec succès.";
    } catch (err) {
      status.textContent = "Erreur : " + err.message;
      setSyncStatus("offline");
    }
  });

  $("#btn-gh-push").addEventListener("click", async () => {
    const status = $("#gh-status");
    status.textContent = "Enregistrement sur GitHub…";
    try {
      const payload = exportProgressPayload(state.progress);
      await pushProgress(state.settings.github, payload);
      setSyncStatus("synced");
      status.textContent = "Progression enregistrée sur GitHub.";
    } catch (err) {
      status.textContent = "Erreur : " + err.message;
      setSyncStatus("offline");
    }
  });
}

function setSyncStatus(mode) {
  const dot = $(".sync-dot");
  dot.classList.remove("is-synced", "is-offline", "is-pending", "is-error");
  if (mode === "synced") dot.classList.add("is-synced");
  if (mode === "offline") dot.classList.add("is-offline");
  if (mode === "pending") dot.classList.add("is-pending");
  if (mode === "error") dot.classList.add("is-error");
}

// ------------------------------------------------------------
// Synchronisation GitHub automatique
// ------------------------------------------------------------
let autoPushTimer = null;

function isGithubConfigured() {
  const gh = state.settings.github;
  return Boolean(gh && gh.token && gh.repo);
}

/**
 * Planifie une sauvegarde sur GitHub quelques secondes après la
 * dernière modification (regroupe les réponses successives en un
 * seul appel API).
 */
function scheduleAutoPush() {
  if (!isGithubConfigured()) return;
  setSyncStatus("pending");
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(async () => {
    try {
      const payload = exportProgressPayload(state.progress);
      await pushProgress(state.settings.github, payload);
      setSyncStatus("synced");
    } catch (err) {
      console.error("Échec de la synchronisation automatique GitHub", err);
      setSyncStatus("error");
    }
  }, 4000);
}

/**
 * Au démarrage : récupère la progression distante (s'il y en a une)
 * et la fusionne avec la progression locale.
 */
async function autoPullOnStartup() {
  if (!isGithubConfigured()) {
    setSyncStatus("offline");
    return;
  }
  setSyncStatus("pending");
  try {
    const payload = await pullProgress(state.settings.github);
    if (payload) {
      state.progress = mergeProgress(state.progress, payload);
      saveProgress(state.progress);
    }
    setSyncStatus("synced");
  } catch (err) {
    console.error("Échec de la synchronisation automatique GitHub", err);
    setSyncStatus("error");
  }
}

/**
 * Force l'envoi immédiat d'une sauvegarde en attente (utilisé
 * lorsque l'utilisateur quitte/masque la page, pour ne pas perdre
 * une synchronisation programmée par scheduleAutoPush).
 */
function flushAutoPush() {
  if (!autoPushTimer) return;
  clearTimeout(autoPushTimer);
  autoPushTimer = null;
  if (!isGithubConfigured()) return;
  const payload = exportProgressPayload(state.progress);
  pushProgress(state.settings.github, payload)
    .then(() => setSyncStatus("synced"))
    .catch((err) => {
      console.error("Échec de la synchronisation GitHub", err);
      setSyncStatus("error");
    });
}

// ------------------------------------------------------------
// Session de révision
// ------------------------------------------------------------
function startSession() {
  const items = getSessionItems();
  const limit = state.settings.sessionSize || 0;
  const queue = buildSessionQueue(items, state.progress, { limit });

  if (queue.length === 0) {
    showView("accueil");
    const typeLabel = { all: "fiches et QCM", flashcard: "fiches", qcm: "QCM" }[state.settings.sessionType || "all"];
    alert(`Aucun item disponible (${typeLabel}) — activez au moins un chapitre dans l'onglet Chapitres, ou changez de type de session.`);
    return;
  }

  state.session = {
    queue,
    total: queue.length,
    validatedCount: 0,
    current: null,
  };

  showView("session");
  $("#session-end").hidden = true;
  $("#fc-controls").hidden = true;
  $("#qcm-controls").hidden = true;
  nextCard();
}

function endSession() {
  $("#flashcard").hidden = true;
  $("#qcm-card").hidden = true;
  $("#fc-controls").hidden = true;
  $("#qcm-controls").hidden = true;

  const end = $("#session-end");
  end.hidden = false;
  $("#session-end-summary").textContent =
    `${state.session.total} item${state.session.total > 1 ? "s" : ""} traité${state.session.total > 1 ? "s" : ""}. ` +
    `Revenez quand vous voulez pour une nouvelle session : les items les moins maîtrisés reviendront plus souvent.`;

  $("#session-progress-fill").style.width = "100%";
  $("#session-progress-text").textContent = `${state.session.total} / ${state.session.total}`;
}

function nextCard() {
  const session = state.session;
  if (!session) return;

  if (session.queue.length === 0) {
    endSession();
    return;
  }

  const item = session.queue[0];
  session.current = item;

  // Met à jour la barre de progression
  $("#session-progress-fill").style.width = `${(session.validatedCount / session.total) * 100}%`;
  $("#session-progress-text").textContent = `${session.validatedCount} / ${session.total}`;
  $("#session-mode-label").textContent = item.type === "flashcard" ? "Fiche" : "QCM";

  $("#stamp").className = "stamp";

  if (item.type === "flashcard") {
    renderFlashcard(item);
  } else {
    renderQcm(item);
  }
}

function renderFlashcard(item) {
  $("#qcm-card").hidden = true;
  $("#qcm-controls").hidden = true;
  const card = $("#flashcard");
  card.hidden = false;
  card.classList.remove("is-flipped");
  $("#fc-controls").hidden = true;

  const tagText = `${item.chapterTitle}${item.tags?.length ? " · " + item.tags.join(", ") : ""}`;
  $("#fc-tag-front").textContent = tagText;
  $("#fc-tag-back").textContent = tagText;
  $("#fc-front-text").textContent = item.front;
  $("#fc-back-text").textContent = item.back;
}

function renderQcm(item) {
  $("#flashcard").hidden = true;
  $("#fc-controls").hidden = true;
  const card = $("#qcm-card");
  card.hidden = false;
  $("#qcm-controls").hidden = true;

  const tagText = `${item.chapterTitle}${item.tags?.length ? " · " + item.tags.join(", ") : ""}`;
  $("#qcm-tag").textContent = tagText;
  $("#qcm-question").textContent = item.question;

  const explanation = $("#qcm-explanation");
  explanation.hidden = true;
  explanation.innerHTML = "";

  // Mélange l'ordre des propositions à chaque présentation, afin
  // que la bonne réponse ne soit pas toujours à la même position.
  const display = shuffleQcmOptions(item);
  state.session.currentDisplay = display;

  const optionsEl = $("#qcm-options");
  optionsEl.innerHTML = "";
  const letters = ["A", "B", "C", "D", "E", "F"];

  display.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "qcm-option";
    btn.innerHTML = `<span class="qcm-option__letter">${letters[idx] || idx + 1}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener("click", () => handleQcmAnswer(item, idx));
    optionsEl.appendChild(btn);
  });
}

function handleQcmAnswer(item, chosenIdx) {
  const display = state.session.currentDisplay;
  const correctIdx = display ? display.answer : item.answer;
  const correct = chosenIdx === correctIdx;
  const buttons = $$("#qcm-options .qcm-option");
  buttons.forEach((btn, idx) => {
    btn.classList.add("is-disabled");
    if (idx === correctIdx) btn.classList.add("is-correct");
    if (idx === chosenIdx && idx !== correctIdx) btn.classList.add("is-incorrect");
  });

  if (item.explanation) {
    const explanation = $("#qcm-explanation");
    explanation.hidden = false;
    explanation.innerHTML = `<span class="qcm-explanation__label">Explication</span>${escapeHtml(item.explanation)}`;
  }

  $("#qcm-controls").hidden = false;
  playStamp(correct);
  recordResult(item, correct);

  const continueBtn = $("#qcm-continue");
  continueBtn.onclick = () => advanceSession(item, correct);
}

function setupFlashcardHandlers() {
  $("#flashcard").addEventListener("click", () => {
    $("#flashcard").classList.toggle("is-flipped");
    const flipped = $("#flashcard").classList.contains("is-flipped");
    $("#fc-controls").hidden = !flipped;
  });

  $$("#fc-controls .btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = state.session.current;
      const correct = btn.dataset.result === "hit";
      playStamp(correct);
      recordResult(item, correct);
      $("#fc-controls").hidden = true;
      // Léger délai pour laisser voir le tampon avant de passer à la suite.
      setTimeout(() => advanceSession(item, correct), 650);
    });
  });
}

function playStamp(correct) {
  const stamp = $("#stamp");
  stamp.textContent = correct ? "Maîtrisé" : "À revoir";
  stamp.className = `stamp ${correct ? "is-hit" : "is-miss"} is-playing`;
}

function recordResult(item, correct) {
  const entry = ensureProgressEntry(item.id);
  const updated = applyResult(entry, correct);
  state.progress.set(item.id, updated);
  saveProgress(state.progress);
  scheduleAutoPush();
}

function advanceSession(item, correct) {
  const session = state.session;
  if (!session) return;

  // Retire l'item courant de la file.
  session.queue.shift();

  if (correct) {
    session.validatedCount += 1;
  } else {
    // Replacé plus loin : devra être retraité avant la fin de session.
    session.queue = requeueAfterMiss(session.queue, item);
  }

  nextCard();
}

function setupQuitSession() {
  $("#btn-quit-session").addEventListener("click", () => {
    if (state.session && state.session.queue.length > 0) {
      if (!confirm("Quitter la session en cours ? Votre progression sur les items déjà traités est conservée.")) return;
    }
    state.session = null;
    showView("accueil");
  });

  $("#btn-session-done").addEventListener("click", () => {
    state.session = null;
    showView("accueil");
  });
}

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
async function init() {
  state.progress = loadProgress();
  setupNav();
  setupReglages();
  setupSessionType();
  setupSessionSize();
  setupRevisions();
  setupFlashcardHandlers();
  setupQuitSession();

  $("#btn-start-session").addEventListener("click", startSession);

  await loadAllChapters();
  await autoPullOnStartup();
  renderDashboard();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAutoPush();
  });
  window.addEventListener("pagehide", flushAutoPush);
}

init();
