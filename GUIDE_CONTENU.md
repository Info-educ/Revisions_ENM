# Guide de rédaction des chapitres (flashcards & QCM)

Ce document est la référence à fournir à Claude (ou à suivre soi-même) pour
produire de nouveaux fichiers `data/<matière>/<chapitre>.json` qui s'intègrent
directement dans Cabinet ENM, sans réglage supplémentaire.

> **Structure multi-matières.** Le contenu est désormais rangé par matière :
> `data/penal/`, `data/civil/`, `data/culture-g/`. Chaque dossier possède son
> propre `manifest.json` listant ses chapitres. La matière « Droit Pénal » est
> déjà remplie ; « Droit Civil » et « Culture générale » sont vides et prêtes à
> recevoir des chapitres. Pour ajouter du contenu à une matière, déposez le
> fichier de chapitre dans le dossier correspondant et référencez-le dans le
> `manifest.json` **de ce dossier**.
>
> Pour ajouter une matière supplémentaire : créez un dossier `data/<id>/` avec
> son `manifest.json`, puis ajoutez une entrée dans `data/themes.json`.

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
   cohérente avec les chapitres déjà présents dans `data/manifest.json`.

---

## 2. Ce que Claude livre pour chaque chapitre

- Un fichier `data/<id-chapitre>.json` complet, conforme au schéma ci-dessous.
- La mise à jour de `data/manifest.json` (ajout de l'entrée correspondante).
- Un court résumé des thèmes couverts par les flashcards et par les QCM, pour
  vérification rapide.

Il vous suffit ensuite de déposer/committer ces fichiers dans `/data` de votre
dépôt GitHub (remplacement de `manifest.json`, ajout du nouveau fichier de
chapitre). GitHub Pages se met à jour automatiquement.

---

## 3. Schéma attendu

### 3.1 Entrée dans `data/manifest.json`

```json
{
  "id": "identifiant-unique-du-chapitre",
  "file": "identifiant-unique-du-chapitre.json",
  "title": "Titre affiché du chapitre",
  "category": "Catégorie (ex. Droit pénal général)"
}
```

Cette entrée s'ajoute au tableau `chapters` du fichier `data/manifest.json`,
dont la structure globale est :

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
- [ ] `data/manifest.json` contient bien la nouvelle entrée, avec le même
      `id` et le même `title` que dans le fichier de chapitre.

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
      "front": "Quelle est la question ?",
      "back": "Voici la réponse complète et autonome.",
      "tags": ["exemple"]
    }
  ],
  "qcm": [
    {
      "id": "exemple-qcm-001",
      "question": "Quelle proposition est correcte ?",
      "options": ["Proposition A", "Proposition B (correcte)", "Proposition C", "Proposition D"],
      "answer": 1,
      "explanation": "La proposition B est correcte car... ; les autres sont écartées car...",
      "tags": ["exemple"]
    }
  ]
}
```
