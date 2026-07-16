# Guide de rédaction des chapitres (flashcards & QCM)

Ce document est la référence à fournir à Claude (ou à suivre soi-même) pour
produire de nouveaux fichiers `data/<chapitre>.json` qui s'intègrent
directement dans Cabinet ENM, sans réglage supplémentaire.

---

## 1. Ce qu'il faut transmettre pour chaque chapitre

1. **Le contenu complet du chapitre**, en une seule fois (toutes les pages /
   sections / images). Un envoi partiel produit un chapitre incomplet qu'il
   faudra reprendre entièrement par la suite — autant tout envoyer d'un coup.
2. **Le nombre de flashcards et de QCM souhaités** pour ce chapitre (ex. « 10
   flashcards / 6 QCM »). À titre indicatif, pour une fiche de cours classique
   (2-4 pages denses), une dizaine de flashcards et 5-8 QCM permettent une
   bonne couverture sans redondance.
3. *(Optionnel)* Une **catégorie** si elle diffère des chapitres déjà
   existants (ex. « Droit pénal général », « Procédure pénale », « Droit
   civil — Famille »...). Si rien n'est précisé, Claude propose une catégorie
   cohérente avec les chapitres déjà présents dans le manifest du module
   concerné.
4. **Le module concerné** (`culture-g`, `penal` ou `civil`) **et le contenu
   actuel de son `manifest.json`** (`data/<module>/manifest.json`), collé
   intégralement dans la conversation. Sans ce fichier, Claude n'a aucune
   visibilité sur les chapitres déjà existants et ne doit jamais tenter de le
   reconstituer de mémoire — voir l'avertissement en section 2.

---

## 2. Ce que Claude livre pour chaque chapitre

- Un fichier `data/<module>/<id-chapitre>.json` complet, conforme au schéma
  ci-dessous.
- **La seule nouvelle entrée** à ajouter au tableau `chapters` de
  `data/<module>/manifest.json` (au format indiqué en 3.1) — **jamais un
  fichier `manifest.json` complet regénéré**.
- Un court résumé des thèmes couverts par les flashcards et par les QCM, pour
  vérification rapide.

> ⚠️ **Règle impérative — ne jamais faire régénérer le manifest en entier.**
> Claude (dans une conversation qui n'a pas accès au dépôt) n'a pas de
> visibilité sur les chapitres déjà présents tant que vous ne les lui avez
> pas transmis. Si on lui demande de « livrer le manifest.json mis à jour »
> sans lui donner le fichier actuel, il ne peut que le recomposer de mémoire
> ou à partir d'un autre module — ce qui **écrase silencieusement tous les
> chapitres existants** au moment du commit. C'est exactement ce qui a
> provoqué la perte des chapitres de Culture générale.
>
> La bonne pratique : Claude ne livre **que la nouvelle entrée** (un objet
> JSON de 4 champs). Vous l'ajoutez vous-même manuellement à la fin du
> tableau `chapters` du vrai fichier `data/<module>/manifest.json` dans votre
> dépôt, sans toucher au reste.

Il vous suffit ensuite de déposer/committer le nouveau fichier de chapitre
dans `data/<module>/`, et d'ajouter la nouvelle entrée dans
`data/<module>/manifest.json` existant. GitHub Pages se met à jour
automatiquement.

---

## 3. Schéma attendu

### 3.1 Entrée dans `data/<module>/manifest.json`

Le site utilise **un manifest distinct par module** :
`data/culture-g/manifest.json`, `data/penal/manifest.json`,
`data/civil/manifest.json`. Chaque nouvelle notion ne concerne qu'un seul de
ces fichiers — ne jamais confondre ou fusionner les modules entre eux.

```json
{
  "id": "identifiant-unique-du-chapitre",
  "file": "identifiant-unique-du-chapitre.json",
  "title": "Titre affiché du chapitre",
  "category": "Catégorie (ex. Droit pénal général)"
}
```

C'est **uniquement cette entrée** que Claude doit livrer. Elle s'ajoute à la
fin du tableau `chapters` du fichier `data/<module>/manifest.json`
correspondant, dont la structure globale est :

```json
{
  "chapters": [
    { "id": "...", "file": "...", "title": "...", "category": "..." },
    { "id": "...", "file": "...", "title": "...", "category": "..." }
  ]
}
```

### 3.2 Fichier `data/<id-chapitre>.json`

```json
{
  "id": "identifiant-unique-du-chapitre",
  "title": "Titre affiché du chapitre",
  "category": "Catégorie (identique au manifest)",
  "flashcards": [
    {
      "id": "prefixe-fc-001",
      "front": "Question / intitulé recto, formulé comme une vraie question",
      "back": "Réponse complète et autonome (pas de recopie littérale du cours, reformulation synthétique)",
      "tags": ["mot-clé-1", "mot-clé-2"]
    }
  ],
  "qcm": [
    {
      "id": "prefixe-qcm-001",
      "question": "Énoncé de la question (définition, application, cas pratique...)",
      "options": ["Proposition A", "Proposition B", "Proposition C", "Proposition D"],
      "answer": 1,
      "explanation": "Pourquoi cette réponse est correcte, et le cas échéant pourquoi les autres ne le sont pas. Référence précise (article, arrêt, date) si pertinent.",
      "tags": ["mot-clé"]
    }
  ]
}
```

---

## 4. Règles impératives

### Identifiants (`id`)

- **Préfixe court et unique par chapitre**, dérivé de son sujet (ex.
  `legalite-`, `intro-`, `cohabitation-`). Voir la liste des préfixes déjà
  utilisés en section 6.
- Format : `<prefixe>-fc-NNN` pour les flashcards, `<prefixe>-qcm-NNN` pour
  les QCM, `NNN` sur 3 chiffres (`001`, `002`...).
- **Unicité absolue** sur l'ensemble du projet, tous chapitres confondus.
- **Ne jamais réutiliser ou modifier un `id` existant** : c'est la clé sur
  laquelle repose toute la progression (niveau de maîtrise, dates de
  révision). Modifier un `id` revient à faire repartir l'item à zéro et/ou à
  laisser une entrée orpheline dans `progress.json`.
- Si un chapitre est complété ultérieurement (ajout de flashcards/QCM), les
  nouveaux items continuent la numérotation existante (`legalite-fc-011`,
  `legalite-fc-012`...) — ne jamais renuméroter les items déjà présents.

### QCM

- Toujours **4 propositions**, une seule correcte.
- `answer` est l'**index 0-based** de la bonne réponse (0 = A, 1 = B, 2 = C,
  3 = D).
- `explanation` est **obligatoire** et doit apporter une information utile
  au-delà de la simple reformulation de la bonne réponse (référence
  textuelle précise, distinction avec les autres propositions, piège
  classique...).
- Les propositions incorrectes doivent être **plausibles** (pas de réponse
  absurde évidente qui se devine sans connaître le cours), idéalement basées
  sur des confusions fréquentes (article voisin, condition oubliée, exception
  généralisée à tort...).
- **Aucune référence d'article de loi dans les options** (`options`) :
  les numéros d'article, de loi, d'ordonnance ou de décision ne doivent
  jamais apparaître dans les 4 propositions, car cela permettrait de
  deviner ou d'éliminer une réponse par simple reconnaissance d'un numéro,
  sans connaître le fond. Ces références restent en revanche autorisées
  (et même recommandées) dans `question` et dans `explanation`.
- **Toute référence d'article de loi citée dans `question` doit être
  expliquée** : dès qu'un numéro d'article, de loi, d'ordonnance ou de
  décision apparaît dans l'énoncé de la question, le contenu (la règle de
  droit) de cet article doit être indiqué — soit directement dans la
  question (si nécessaire à sa compréhension), soit dans `explanation`. On
  ne doit jamais laisser une référence d'article « nue » sans préciser ce
  qu'elle dit : citer un numéro d'article sans en exposer la teneur ne
  permet pas de réviser la règle elle-même, seulement de mémoriser un
  numéro.
- **Longueur homogène des 4 options** : les propositions d'un même QCM
  doivent avoir une taille comparable, **chacune comprise entre 75 et 90
  caractères**. Une option nettement plus longue ou plus courte que les
  autres constitue souvent un indice involontaire de la bonne réponse —
  veiller à reformuler pour équilibrer.
  **Exception** : si la question appelle naturellement des réponses très
  courtes (date, nom propre, terme technique de 1 à 3 mots, chiffre…),
  les options peuvent être brèves sans padding artificiel. Les 4 options
  restent néanmoins homogènes entre elles.

### Complémentarité flashcards / QCM

- Les flashcards couvrent les **définitions, principes, listes, dates,
  références d'articles** : la base de connaissance brute.
- Les QCM testent l'**application, les nuances, les exceptions, les cas
  pratiques, les pièges** — sans reformuler une flashcard existante sous
  forme de question à choix multiples.
- Avant de finaliser un chapitre, Claude vérifie qu'aucune paire
  flashcard/QCM ne porte exactement sur le même fait avec la même formulation
  de réponse.

### Style de rédaction

- Reformulation synthétique, pas de copie mot pour mot de longs passages du
  cours source.
- Références précises (articles de code, dates de décisions/arrêts,
  numéros de loi) systématiquement reprises telles qu'elles apparaissent dans
  la source.
- **Si le `front` d'une flashcard cite un article de loi**, le `back` doit
  obligatoirement exposer le contenu de cet article (ce que dit la règle de
  droit), et non se limiter à renvoyer au numéro. Même règle que pour les
  QCM (voir section « QCM » ci-dessus) : une référence d'article ne se
  suffit jamais à elle-même, elle doit toujours être accompagnée de son
  contenu.
- Pas d'ambiguïté : une flashcard ou un QCM doit pouvoir être évalué comme
  vrai/faux sans débat d'interprétation.
- Les `tags` servent à indexer les notions transversales (ex. « rétroactivité
  in mitius », « article 111-4 ») — 1 à 3 tags par item, en minuscules.

---

## 5. Vérifications avant intégration

Avant de livrer un chapitre, Claude vérifie que :

- [ ] le JSON est valide (pas de virgule manquante/en trop) ;
- [ ] tous les `id` sont uniques sur l'ensemble du projet ;
- [ ] chaque `answer` est un index valide (0 à 3) ;
- [ ] le nombre de flashcards et de QCM correspond à la demande ;
- [ ] aucune redondance flashcard/QCM sur le même point précis ;
- [ ] aucune **option** de QCM ne contient de référence d'article de loi
      (les références restent autorisées dans la question et l'explication) ;
- [ ] toute référence d'article de loi présente dans une `question` (QCM) ou
      un `front` (flashcard) est accompagnée de son contenu — soit dans
      l'énoncé lui-même, soit dans `explanation`/`back` ;
- [ ] les 4 options de chaque QCM ont une longueur comparable, **chacune
      entre 75 et 90 caractères** — sauf si la question appelle des réponses
      naturellement courtes (date, terme court, chiffre), auquel cas les
      options peuvent être brèves à condition d'être homogènes entre elles ;
- [ ] Claude a livré **uniquement la nouvelle entrée** pour
      `data/<module>/manifest.json` (jamais un fichier manifest complet
      regénéré) ;
- [ ] cette entrée a le même `id` et le même `title` que dans le fichier de
      chapitre, et vise le bon module (`culture-g`, `penal` ou `civil`).

---

## 6. Registre des chapitres existants

Tenu à jour à chaque nouveau chapitre, pour garantir l'unicité des préfixes
et la cohérence des catégories.

| Préfixe | Chapitre | Catégorie | Fichier |
| --- | --- | --- | --- |
| `intro-` | Introduction générale — Droit pénal et procédure pénale | Droit pénal général | `intro-droit-penal-procedure.json` |
| `legalite-` | Le principe de légalité des délits et des peines | Droit pénal général | `legalite-delits-peines.json` |
| `espace-` | L'application de la loi pénale dans l'espace | Droit pénal général | `application-loi-penale-espace.json` |

---

## 7. Exemple minimal complet

```json
{
  "id": "exemple-chapitre",
  "title": "Exemple de chapitre",
  "category": "Catégorie de test",
  "flashcards": [
    {
      "id": "exemple-fc-001",
      "front": "Que prévoit l'article 111-4 du code pénal ?",
      "back": "La loi pénale est d'interprétation stricte : on ne peut ni l'étendre par analogie, ni l'appliquer à des faits qu'elle ne vise pas expressément.",
      "tags": ["exemple"]
    }
  ],
  "qcm": [
    {
      "id": "exemple-qcm-001",
      "question": "Selon l'article 111-4 du code pénal, comment la loi pénale doit-elle être interprétée ?",
      "options": ["Proposition A", "Proposition B (correcte)", "Proposition C", "Proposition D"],
      "answer": 1,
      "explanation": "L'article 111-4 du code pénal impose une interprétation stricte de la loi pénale, ce qui exclut tout raisonnement par analogie en défaveur de la personne poursuivie ; les autres propositions sont écartées car...",
      "tags": ["exemple"]
    }
  ]
}
```
