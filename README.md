# Cabinet ENM — Outil de révision (flashcards & QCM)

Application web statique (HTML/CSS/JS, sans backend) pour réviser le concours
de l'ENM par flashcards et QCM, avec un algorithme de répétition espacée
inspiré de la méthode Leitner. Conçue pour GitHub Pages, mobile-first.

## 1. Mise en ligne (GitHub Pages)

1. Créez un dépôt GitHub (public ou privé avec un plan permettant Pages sur
   dépôt privé) et poussez l'intégralité de ce dossier à la racine du dépôt
   (la branche par défaut, généralement `main`).
2. Dans **Settings → Pages**, sélectionnez la branche `main` et le dossier
   `/ (root)`, puis enregistrez.
3. Votre site est accessible à `https://<votre-utilisateur>.github.io/<nom-du-depot>/`.
4. Aucune étape de build n'est nécessaire : tout est servi tel quel.

Le fichier `.nojekyll` est présent pour éviter tout traitement Jekyll inutile.

### Confidentialité / non-référencement

Le site inclut des balises `<meta name="robots" content="noindex, nofollow, ...">`
et un fichier `robots.txt` qui interdit toute exploration par les robots des
moteurs de recherche. Cela empêche Google, Bing, etc. d'indexer ou d'afficher
ce site dans leurs résultats.

⚠️ Ces mécanismes **ne remplacent pas un vrai contrôle d'accès** : tant que le
dépôt est public, le site reste accessible à quiconque connaît ou devine son
URL `https://<utilisateur>.github.io/<depot>/`. Pour une confidentialité
réelle (accès restreint), seules ces options fonctionnent :
- héberger le dépôt en **privé** avec GitHub Pages (nécessite un plan GitHub
  payant : Pro, Team ou Enterprise) ;
- ou choisir une URL difficile à deviner et ne la partager avec personne.

## 2. Fonctionnement général

- **Tableau de bord** : nombre d'items à réviser aujourd'hui, répartition par
  niveau de maîtrise, vue par chapitre, et choix du **type de session**
  (fiches + QCM, fiches seules, ou QCM seuls).
- **Réviser** : lance une session. Les items sont sélectionnés parmi ceux
  « dus » (jamais vus, ou dont l'intervalle de révision est écoulé), triés
  par niveau de maîtrise croissant puis mélangés.
  - **Flashcard** : on touche la carte pour révéler la réponse, puis on
    indique « Maîtrisé » ou « À revoir ».
  - **QCM** : 4 propositions, une seule bonne réponse, explication affichée
    immédiatement après la réponse.
  - Une réponse correcte **valide** l'item pour la session : il ne revient
    plus. Une réponse incorrecte le replace plus loin dans la file : il
    devra être retraité avant la fin de la session.
- **Chapitres** : active/désactive des chapitres entiers pour cibler ses
  révisions (ex. ne travailler qu'un ou deux chapitres).
- **Réglages** : taille de session, export/import de la progression,
  réinitialisation, synchronisation GitHub.

## 3. Algorithme de répétition espacée

Chaque item (flashcard ou QCM) a un **niveau de maîtrise** de 0 à 7 :

| Niveau | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| Intervalle avant réapparition | toujours dû | 1 j | 2 j | 4 j | 9 j | 20 j | 45 j | 100 j |

- Réponse correcte → le niveau **monte** d'un cran (max 7) et l'item devient
  « dû » seulement après l'intervalle correspondant.
- Réponse incorrecte → le niveau **descend** de deux crans (min 0) et l'item
  redevient immédiatement « dû ».

Ainsi, les items jamais vus ou mal maîtrisés reviennent très souvent, et les
items bien ancrés ne reviennent que ponctuellement, pour de l'entretien à
long terme — exactement le comportement demandé.

La taille de session (réglable : 20 / 40 / 60 / illimité) limite le nombre
d'items proposés en une fois, en donnant toujours la priorité aux niveaux les
plus faibles. Si plus d'items sont dus que la limite, les autres restent
disponibles pour la session suivante.

## 4. Sauvegarde de la progression

La progression (niveau, historique, dates d'échéance) est enregistrée
automatiquement dans le navigateur (`localStorage`). Trois options
complémentaires existent dans **Réglages** :

- **Export / Import** : télécharge ou recharge un fichier `.json` de
  sauvegarde — utile pour une sauvegarde manuelle ou un transfert ponctuel.
- **Synchronisation GitHub (automatique)** : une fois configurée, l'application
  lit `data/progress.json` au démarrage et le réécrit automatiquement quelques
  secondes après chaque réponse, sur n'importe quel navigateur/appareil — via
  l'API GitHub et un **jeton d'accès personnel fine-grained** :
  1. Sur GitHub : **Settings → Developer settings → Personal access tokens
     → Fine-grained tokens → Generate new token**.
  2. Limitez l'accès au seul dépôt de cette application.
  3. Permissions : **Contents → Read and write** (rien d'autre n'est requis).
  4. Renseignez le jeton et le dépôt (`utilisateur/depot`) dans **Réglages →
     Synchronisation GitHub**.

  Le jeton reste stocké uniquement dans le `localStorage` de votre
  navigateur ; il n'est envoyé qu'à `api.github.com`. La fusion entre
  progression locale et distante conserve, pour chaque item, l'entrée la
  plus récente (`lastSeenAt`). Les boutons « Charger »/« Sauvegarder »
  permettent en complément de forcer une synchronisation manuelle (utile par
  exemple en arrivant sur un nouvel appareil, avant la première réponse).

  ⚠️ Si le dépôt est public, `data/progress.json` sera visible publiquement
  (ce ne sont que des statistiques de révision, sans donnée personnelle).
  Pour plus de confidentialité, utilisez un dépôt privé (Pages sur dépôt
  privé nécessite un plan GitHub payant) ou laissez la synchronisation
  désactivée et utilisez uniquement export/import.

## 5. Schéma des fichiers de chapitre (`data/*.json`)

Chaque chapitre est un fichier JSON indépendant, référencé dans
`data/manifest.json` :

```json
{
  "chapters": [
    { "id": "identifiant-unique", "file": "nom-du-fichier.json", "title": "Titre affiché", "category": "Catégorie" }
  ]
}
```

Et le fichier de chapitre lui-même :

```json
{
  "id": "identifiant-unique",
  "title": "Titre du chapitre",
  "category": "Droit administratif",
  "flashcards": [
    {
      "id": "prefixe-fc-001",
      "front": "Question / intitulé recto",
      "back": "Réponse complète verso",
      "tags": ["mot-clé-1", "mot-clé-2"]
    }
  ],
  "qcm": [
    {
      "id": "prefixe-qcm-001",
      "question": "Énoncé de la question",
      "options": ["Proposition A", "Proposition B", "Proposition C", "Proposition D"],
      "answer": 1,
      "explanation": "Pourquoi cette réponse est correcte (et éventuellement pourquoi les autres ne le sont pas).",
      "tags": ["mot-clé"]
    }
  ]
}
```

Règles importantes :

- **`id` globalement unique** pour chaque flashcard et chaque QCM (préfixer
  par l'identifiant du chapitre, ex. `ce2024-fc-012`). Ces identifiants
  servent de clé de progression : ne jamais les changer une fois créés, sous
  peine de perdre l'historique de révision associé.
- **`answer`** est l'index (0 = A, 1 = B, 2 = C, 3 = D) de la bonne réponse.
- Les **flashcards et les QCM d'un même chapitre doivent être
  complémentaires** : une flashcard fixe une définition/notion/chiffre clé,
  un QCM teste plutôt l'application, la nuance ou le piège associé — sans
  reformuler la même question sous deux formes.

## 6. Ajouter un nouveau chapitre

1. Créez `data/<id-chapitre>.json` selon le schéma ci-dessus.
2. Ajoutez une entrée correspondante dans `data/manifest.json`.
3. Poussez les deux fichiers sur GitHub (ou via le workflow habituel de mise
   à jour du dépôt). GitHub Pages se met à jour automatiquement en
   quelques instants.
4. Le nouveau chapitre apparaît automatiquement dans le tableau de bord, la
   liste des chapitres (actif par défaut), et ses items entrent dans le
   cycle de révision dès la prochaine session.

## 7. Méthode de travail avec Claude pour générer le contenu

Le détail complet (schéma, conventions d'identifiants, règles de
complémentarité flashcards/QCM, registre des chapitres) est dans
[`GUIDE_CONTENU.md`](GUIDE_CONTENU.md). En résumé, pour chaque chapitre :

1. Envoyer **l'intégralité** des pages/images du chapitre (pas d'envoi
   partiel — attendre que tout le matériau soit transmis avant génération).
2. Préciser le **nombre de flashcards** et le **nombre de QCM** souhaités.
3. Claude génère le fichier `data/<id-chapitre>.json` complet
   (flashcards + QCM, complémentaires et non redondants, avec explications
   pour les QCM), met à jour `data/manifest.json` et `GUIDE_CONTENU.md`
   (registre des chapitres), et fournit les fichiers prêts à être poussés sur
   GitHub.

## 8. Structure du dépôt

```
.
├── index.html
├── manifest.webmanifest
├── sw.js
├── .nojekyll
├── README.md
├── GUIDE_CONTENU.md
├── assets/
│   ├── css/style.css
│   └── js/
│       ├── app.js          (logique principale)
│       ├── scheduler.js     (algorithme de répétition espacée)
│       ├── storage.js        (persistance locale)
│       └── github-sync.js    (synchronisation GitHub)
└── data/
    ├── manifest.json
    └── <chapitre>.json
```
