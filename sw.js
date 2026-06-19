// ============================================================
// sw.js — mise en cache pour un usage hors-ligne.
//
// IMPORTANT : le « shell » de l'application (HTML, JS, CSS) suit
// désormais une stratégie NETWORK-FIRST : on tente toujours le
// réseau d'abord et on ne retombe sur le cache qu'en cas d'absence
// de connexion. Cela évite qu'une ancienne version du code reste
// servie indéfiniment depuis le cache (cause classique d'une page
// d'accueil « figée » sur mobile après une mise à jour).
//
// Les données (JSON des chapitres, polices) restent en
// « stale-while-revalidate » : affichage instantané puis mise à
// jour silencieuse en arrière-plan.
// ============================================================

// Le numéro de version DOIT être incrémenté à chaque déploiement
// modifiant le HTML/CSS/JS, afin de purger l'ancien cache.
const CACHE_NAME = "cabinet-enm-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Détermine si une requête concerne le « shell » applicatif
// (document HTML, script JS ou feuille de style). Ces ressources
// ne doivent jamais être servies depuis une version périmée.
function isAppShell(req, url) {
  if (req.mode === "navigate") return true;
  if (req.destination === "document") return true;
  if (req.destination === "script") return true;
  if (req.destination === "style") return true;
  return /\.(html|js|css)(\?.*)?$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isAppShell(req, url)) {
    // NETWORK-FIRST : code toujours frais quand le réseau répond.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req);
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        } catch (e) {
          const cached = await cache.match(req);
          if (cached) return cached;
          // En dernier recours pour une navigation hors-ligne,
          // on tente de servir la page d'accueil mise en cache.
          if (req.mode === "navigate") {
            const fallback = await cache.match("./index.html") || await cache.match("index.html");
            if (fallback) return fallback;
          }
          throw e;
        }
      })()
    );
    return;
  }

  // Reste (données JSON, polices, images) : stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
