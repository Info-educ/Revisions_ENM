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

- **Tableau de bord** : nombre d'items **jamais réussis** (jamais répondus
  correctement), vue par chapitre, et choix du **type de session** (fiches +
  QCM, fiches seules, ou QCM seuls).
- **Réviser** (écran d'accueil) : lance une session d'apprentissage initial.
  Seuls les items **auxquels vous n'avez jamais répondu correctement** sont
  proposés, dans un ordre aléatoire. Dès qu'un item est réussi une première
  fois, il **disparaît définitivement** de cet écran (mais reste disponible
  dans l'onglet « Révisions »).
  - **Flashcard** : on touche la carte pour révéler la réponse, puis on
    indique « Maîtrisé » ou « À revoir ».
  - **QCM** : 4 propositions affichées dans un ordre aléatoire à chaque
    présentation (la bonne réponse n'est donc jamais systématiquement à la
    même position), explication affichée immédiatement après la réponse.
  - Une réponse correcte **valide** l'item pour la session : il ne revient
    plus *dans cette session* (ni dans les suivantes, voir ci-dessus). Une
    réponse incorrecte le replace plus loin dans la file : il devra être
    retraité avant la fin de la session.
- **Chapitres** : active/désactive des chapitres entiers pour cibler ses
  révisions (ex. ne travailler qu'un ou deux chapitres). Le badge affiche le
  nombre d'items jamais réussis du chapitre.
- **Révisions** : entraînement sur **l'ensemble** des items (y compris ceux
  déjà réussis), par thématiques choisies et type de contenu (fiches, QCM,
  ou les deux). Le tirage est aléatoire mais privilégie les items les moins
  maîtrisés, sans jamais exclure totalement les autres — un item bien
  maîtrisé peut donc revenir, même le jour même d'une bonne réponse,
  simplement moins souvent. Une limite (10 / 20 / 40 / Tout) permet de
  choisir entre une session courte ciblée ou un accès à la totalité des
  items de la sélection.
- **Réglages** : taille de session, export/import de la progression,
  réinitialisation, synchronisation GitHub.

## 3. Algorithme de sélection des items

Chaque item (flashcard ou QCM) a un **niveau de maîtrise** de 0 à 7 et un
compteur de bonnes réponses (`correctCount`), qui évoluent à chaque
réponse :

- Réponse correcte → le niveau **monte** d'un cran (max 7) et
  `correctCount` est incrémenté.
- Réponse incorrecte → le niveau **descend** de deux crans (min 0).

### Écran d'accueil — apprentissage initial

La session ne contient que les items dont `correctCount` est encore à 0,
c'est-à-dire ceux auxquels vous n'avez **jamais** répondu correctement. Ils
sont mélangés aléatoirement. Dès qu'un item est réussi une première fois, il
sort définitivement de cette liste.

### Onglet Révisions — entraînement complet pondéré

Tous les items des thématiques choisies sont éligibles, sans condition sur
`correctCount`. Chaque item reçoit un **poids** dépendant de son niveau de
maîtrise (plus le niveau est bas, plus le poids est élevé), puis un tirage
aléatoire pondéré sans remise détermine l'ordre — et, si une limite est
choisie, la sélection — des items de la session. Aucun item n'est donc
jamais totalement exclu : les items mal maîtrisés apparaissent beaucoup plus
souvent, les items bien ancrés beaucoup plus rarement, mais tous restent
susceptibles de revenir, y compris le jour même d'une bonne réponse. Avec
« Tout », l'ensemble des items de la sélection est proposé, dans cet ordre
pondéré.

## 4. Sauvegarde de la progression

La progression (niveau de maîtrise, historique des réponses) est enregistrée
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
