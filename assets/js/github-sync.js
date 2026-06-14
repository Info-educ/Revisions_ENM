// ============================================================
// github-sync.js
// Lecture / écriture de data/progress.json dans un dépôt GitHub
// via l'API Contents, à l'aide d'un jeton d'accès personnel
// "fine-grained" (permission "Contents: Read and write" limitée
// au dépôt). Le jeton n'est jamais transmis ailleurs qu'à
// api.github.com et reste stocké en local (localStorage).
// ============================================================

const API_ROOT = "https://api.github.com";

/**
 * Encode un objet JS en base64 UTF-8 (requis par l'API Contents).
 */
function toBase64(obj) {
  const json = JSON.stringify(obj, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/**
 * Décode le contenu base64 renvoyé par l'API Contents en objet JS.
 */
function fromBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(json);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Télécharge data/progress.json depuis le dépôt configuré.
 * @returns {Promise<object|null>} le payload JSON, ou null si le
 *   fichier n'existe pas encore.
 */
export async function pullProgress({ repo, branch, token, path }) {
  if (!repo || !token) throw new Error("Dépôt et jeton requis.");
  const url = `${API_ROOT}/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch || "main")}`;
  const res = await fetch(url, { headers: headers(token) });

  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Échec du chargement GitHub (${res.status}) : ${body}`);
  }
  const data = await res.json();
  return fromBase64(data.content);
}

/**
 * Écrit data/progress.json dans le dépôt configuré (création ou
 * mise à jour selon l'existence préalable).
 */
export async function pushProgress({ repo, branch, token, path }, payload) {
  if (!repo || !token) throw new Error("Dépôt et jeton requis.");
  const url = `${API_ROOT}/repos/${repo}/contents/${encodeURI(path)}`;

  // Récupère le sha existant si le fichier est déjà présent.
  let sha;
  const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch || "main")}`, {
    headers: headers(token),
  });
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  } else if (getRes.status !== 404) {
    const body = await getRes.text();
    throw new Error(`Échec de la lecture préalable GitHub (${getRes.status}) : ${body}`);
  }

  const body = {
    message: sha ? "Mise à jour progression (Cabinet ENM)" : "Création progression (Cabinet ENM)",
    content: toBase64(payload),
    branch: branch || "main",
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const errBody = await putRes.text();
    throw new Error(`Échec de l'enregistrement GitHub (${putRes.status}) : ${errBody}`);
  }
  return putRes.json();
}
