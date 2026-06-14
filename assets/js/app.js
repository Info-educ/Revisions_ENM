// ============================================================
// app.js — Cabinet ENM, moteur principal
// ============================================================
import {
  createProgressEntry,
  applyResult,
  buildSessionQueue,
  requeueAfterMiss,
  levelDistribution,
  LEVEL_LABELS,
  isDue,
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
  if (name === "reglages") renderReglages();
  window.scrollTo(0, 0);
}

function setupNav() {
  $$(".bottombar__btn, .desktopbar__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.view === "session" && !state.session) {
        startSession();
        return;
      }
      showView(btn.dataset.view);
    });
  });
}

// ------------------------------------------------------------
// Tableau de bord
// ------------------------------------------------------------
function renderDashboard() {
  const items = getActiveItems();
  const sessionItems = getSessionItems();
  const now = Date.now();

  const dueCount = sessionItems.filter((it) => isDue(state.progress.get(it.id), now)).length;
  $("#due-count").textContent = dueCount;
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

  // Répartition par niveau
  const dist = levelDistribution(items, state.progress);
  const maxVal = Math.max(1, ...dist);
  const levelBars = $("#level-bars");
  levelBars.innerHTML = "";
  dist.forEach((count, lvl) => {
    const row = document.createElement("div");
    row.className = "level-bar-row";
    row.innerHTML = `
      <span class="level-name">${LEVEL_LABELS[lvl]}</span>
      <span class="level-track"><span class="level-fill" style="width:${(count / maxVal) * 100}%"></span></span>
      <span class="level-count">${count}</span>
    `;
    levelBars.appendChild(row);
  });

  // Résumé par chapitre
  const list = $("#chapter-summary-list");
  list.innerHTML = "";
  for (const ch of state.chaptersMeta) {
    const chItems = items.filter((it) => it.chapterId === ch.id);
    if (chItems.length === 0) continue;
    const due = chItems.filter((it) => isDue(state.progress.get(it.id), now)).length;
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <div class="chapter-list__title">${escapeHtml(ch.title)}</div>
        <div class="chapter-list__meta">${ch.counts.fc} fiches · ${ch.counts.qcm} QCM</div>
      </div>
      <span class="chapter-due-badge ${due === 0 ? "is-zero" : ""}">${due}</span>
    `;
    list.appendChild(li);
  }

  // Pastille "à réviser" sur la navigation
  $$("[data-view='session']").forEach((btn) => btn.classList.toggle("has-due", dueCount > 0));
}

// ------------------------------------------------------------
// Vue Chapitres
// ------------------------------------------------------------
function renderChapitres() {
  const list = $("#chapter-manage-list");
  list.innerHTML = "";
  const now = Date.now();
  const activeSet = new Set(state.settings.activeChapters || []);

  for (const ch of state.chaptersMeta) {
    const chItems = state.allItems.filter((it) => it.chapterId === ch.id);
    const due = chItems.filter((it) => isDue(state.progress.get(it.id), now)).length;
    const li = document.createElement("li");
    li.innerHTML = `
      <label class="chapter-toggle">
        <input type="checkbox" data-chapter="${ch.id}" ${activeSet.has(ch.id) ? "checked" : ""}>
        <span class="chapter-toggle__text">
          <span class="chapter-manage-list__title">${escapeHtml(ch.title)}</span>
          <span class="chapter-manage-list__meta">${ch.counts.fc} fiches · ${ch.counts.qcm} QCM${ch.category ? " · " + escapeHtml(ch.category) : ""}</span>
        </span>
      </label>
      <span class="chapter-due-badge ${due === 0 ? "is-zero" : ""}">${due}</span>
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

// ------------------------------------------------------------
// Vue Réglages
// ------------------------------------------------------------
function renderReglages() {
  $$("#session-size-segmented button").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.size) === state.settings.sessionSize);
  });
  $("#gh-repo").value = state.settings.github.repo || "";
  $("#gh-branch").value = state.settings.github.branch || "main";
  $("#gh-token").value = state.settings.github.token || "";
}

function setupReglages() {
  $$("#session-size-segmented button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settings.sessionSize = Number(btn.dataset.size);
      saveSettings(state.settings);
      renderReglages();
    });
  });

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
    alert(`Rien à réviser pour le moment (${typeLabel}) — tous les items actifs sont à jour. Revenez plus tard, changez de type de session, ou activez d'autres chapitres.`);
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
    `Revenez quand de nouveaux items seront dus pour ancrer durablement vos connaissances.`;

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

  const optionsEl = $("#qcm-options");
  optionsEl.innerHTML = "";
  const letters = ["A", "B", "C", "D", "E", "F"];

  item.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "qcm-option";
    btn.innerHTML = `<span class="qcm-option__letter">${letters[idx] || idx + 1}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener("click", () => handleQcmAnswer(item, idx));
    optionsEl.appendChild(btn);
  });
}

function handleQcmAnswer(item, chosenIdx) {
  const correct = chosenIdx === item.answer;
  const buttons = $$("#qcm-options .qcm-option");
  buttons.forEach((btn, idx) => {
    btn.classList.add("is-disabled");
    if (idx === item.answer) btn.classList.add("is-correct");
    if (idx === chosenIdx && idx !== item.answer) btn.classList.add("is-incorrect");
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
