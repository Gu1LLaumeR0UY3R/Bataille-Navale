# Documentation technique

## 1. Présentation

Le projet est une démonstration de bataille navale en 3D exécutée dans le navigateur. L’interface est construite avec Vue 3 et TypeScript ; les grilles sont rendues avec BabylonLite et WebGPU. La partie est actuellement simulée entièrement côté client : l’adversaire et sa flotte sont locaux. Un serveur PHP est envisagé, mais il n’est pas fourni dans ce dépôt.

La grille mesure 10 × 10 cases. Le joueur place cinq bateaux, puis alterne ses tirs avec ceux d’un adversaire simulé. Les bateaux sont représentés par des marqueurs 3D par case, pas encore par des modèles de navires.

## 2. Arborescence

```text
.
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── README.md
├── doc-tech.md
├── scripts/
│   └── check-picking.ts
└── src/
    ├── App.vue
    ├── main.ts
    ├── env.d.ts
    ├── components/
    │   ├── BoardView3D.vue
    │   └── ShipPlacement.vue
    ├── engine/
    │   ├── boardGeometry.ts
    │   ├── boardScene.ts
    │   └── cellPicking.ts
    └── game/
        ├── rules.ts
        └── types.ts
```

Les dépendances installées dans `node_modules/` et les fichiers générés dans `dist/` ne font pas partie des sources maintenues et ne sont pas détaillés ici.

## 3. Architecture

Le code est organisé en trois couches, avec une séparation explicite des responsabilités :

1. **Règles et données (`src/game/`)** : constantes, types, placement, résolution des tirs et construction des grilles. Ces modules ne dépendent ni de Vue ni de BabylonLite.
2. **Moteur 3D (`src/engine/`)** : correspondance entre coordonnées de jeu et monde 3D, détection de la case sous le pointeur, création et gestion des scènes BabylonLite. Cette couche ne dépend pas de Vue.
3. **Interface (`src/components/` et `src/App.vue`)** : état de partie et interactions Vue. `BoardView3D.vue` sert d’adaptateur entre les propriétés/événements Vue et l’API de scène 3D.

Le flux d’affichage et d’interaction est le suivant :

```text
état de partie
    └─ propriétés Vue
        └─ BoardView3D.vue
            └─ API SceneGrille
                └─ scène et maillages BabylonLite

événement DOM du canvas
    └─ détection du rayon et de la case
        └─ rappel de SceneGrille
            └─ événement Vue
                └─ action de placement ou de tir
```

Les deux usages de la grille partagent le composant et le moteur : `ShipPlacement.vue` demande une vue de dessus avec aperçu de placement ; `App.vue` affiche deux grilles inclinées pendant la partie, l’une pour chaque camp.

## 4. Données et conventions du jeu

### Coordonnées et repère 3D

- `CoordCase` contient `colonne` et `ligne`, indexées à partir de zéro.
- La ligne 0 est en haut de la grille affichée.
- Le monde utilise le repère main gauche de BabylonLite : x va vers la droite, y vers le haut et z s’éloigne de la caméra.
- La grille repose sur le plan y = 0. Son centre est à l’origine du monde ; une case a une taille de 1 unité.
- `caseVersMonde` et `mondeVersCase` effectuent les conversions dans les deux sens.

### Flotte et états de case

`FLOTTE` décrit les modèles de bateaux : identifiant, nom et longueur. Un bateau placé ajoute sa colonne, sa ligne de départ et son orientation (`horizontal`). Les longueurs sont 5, 4, 3, 3 et 2 cases.

Les états d’affichage d’une case sont :

| État | Signification |
| --- | --- |
| `eau` | Case sans bateau ni tir |
| `bateau` | Bateau visible sur la grille de son propriétaire |
| `touche` | Case de bateau touchée |
| `rate` | Tir dans l’eau |
| `coule` | Case appartenant à un bateau entièrement coulé |

Un résultat de tir (`ResultatTir`) est `rate`, `touche` ou `coule`. Les coordonnées de tir et l’état d’affichage sont volontairement distincts : le résultat d’un tir indique ce qui s’est passé, tandis que `EtatCase` décrit comment dessiner la case.

## 5. Flux fonctionnels

### Placement

1. `ShipPlacement.vue` sélectionne le modèle suivant dans `FLOTTE`.
2. Le mouvement du pointeur fournit une `CoordCase` via `BoardView3D.vue`.
3. Le composant calcule un candidat horizontal ou vertical et envoie ses cases au moteur comme aperçu.
4. `peutPlacer` vérifie que toutes les cases restent dans la grille et ne chevauchent aucun bateau déjà posé.
5. L’aperçu est vert si valide et rouge sinon. Un clic ne valide que les candidats valides.
6. Le bouton de validation n’est activé que lorsque toute la flotte a été placée. Le placement aléatoire utilise également les règles communes.

### Partie locale

1. `App.vue` reçoit la flotte du joueur, génère une flotte adverse aléatoire et initialise les tirs.
2. Un clic sur la grille adverse appelle `tirer`. Un tir déjà joué est refusé.
3. `resoudreTir` donne le résultat, puis `grilleAvecTirs` met à jour la représentation.
4. Si la flotte ciblée est entièrement coulée, la partie se termine ; sinon, après un délai de 700 ms, l’adversaire choisit au hasard une case où il n’a pas encore tiré.
5. Le bouton de nouvelle partie ramène à la phase de placement.

Dans le code actuel, `App.vue` conserve les deux flottes, y compris celle de l’adversaire. Les commentaires `SERVEUR` signalent les opérations à remplacer lors de l’ajout d’un serveur : en production, la flotte adverse ne doit pas être envoyée au client.

### Détection d’une case par la scène

Le moteur convertit les coordonnées de l’événement en pixels CSS relatifs au canvas, puis `ecranVersCase` crée un rayon à partir de la caméra. L’intersection avec le plan horizontal y = 0 fournit une position du monde, convertie en colonne et ligne. Une case hors grille, un rayon parallèle au plan ou une intersection derrière la caméra ne donne aucune case.

## 6. Contenu des fichiers

### Fichiers d’entrée et configuration

- **`index.html`** — document HTML initial de Vite. Définit la langue française, les métadonnées de viewport, le titre, le conteneur `#app` et le chargement du module `src/main.ts`.
- **`src/main.ts`** — point d’entrée Vue. Importe `App.vue`, crée l’application et la monte dans `#app`.
- **`src/env.d.ts`** — déclaration TypeScript des fichiers `.vue` comme composants Vue typés.
- **`package.json`** — identité du paquet, scripts, dépendances directes et versions/outils. Les commandes sont `dev`, `build`, `preview`, `typecheck` et `check:picking`. BabylonLite est fixé à la version 1.34.0.
- **`pnpm-lock.yaml`** — verrouille l’arbre complet des dépendances résolues par pnpm pour rendre les installations reproductibles.
- **`tsconfig.json`** — configuration TypeScript stricte, ciblant ES2022 et les modules ESNext avec résolution Bundler. Inclut les sources Vue/TypeScript, les scripts et `vite.config.ts`.
- **`vite.config.ts`** — active le plugin Vue. Configure en développement un proxy `/api` vers `http://localhost:8000`, destiné au futur serveur PHP.
- **`README.md`** — documentation de démarrage et aperçu initial du projet : prérequis WebGPU, commandes, principes BabylonLite et pistes d’évolution.

### Application et composants Vue

- **`src/App.vue`** — orchestre les étapes `placement`, `en_cours` et `terminee`, les flottes et les listes de tirs. Gère les tours, les messages, les conditions de victoire et le redémarrage. C’est aussi ici que l’adversaire local est simulé. Le template présente les deux grilles en jeu et le composant de placement avant la partie. Les styles globaux et ceux de la page définissent la palette, la typographie, la mise en page et l’adaptation mobile.
- **`src/components/ShipPlacement.vue`** — gère le placement interactif : modèle suivant, orientation, aperçu, validation, annulation, remise à zéro et placement aléatoire. Écoute le clavier pour la touche R et transmet la flotte complète à l’application via l’événement `valider`.
- **`src/components/BoardView3D.vue`** — adaptateur Vue autour de `SceneGrille`. À partir de ses propriétés, initialise la scène, met à jour cases et aperçu, puis émet `survol-case` et `clic-case`. Surveille les changements de propriétés et libère la scène au démontage. Affiche aussi une erreur accessible si l’initialisation échoue.

### Règles et types

- **`src/game/types.ts`** — définit `TAILLE_GRILLE`, les états `EtatCase`, les coordonnées `CoordCase`, les bateaux (`Bateau`, `ModeleBateau`), la flotte classique `FLOTTE`, les résultats `ResultatTir` et le type de couleur `Couleur`.
- **`src/game/rules.ts`** — logique métier indépendante du rendu : calcul des cases d’un bateau (`casesBateau`), validation du placement (`estDansGrille`, `peutPlacer`), création d’une grille vide ou occupée, résolution d’un tir (`resoudreTir`), détection de fin de partie (`tousCoules`), composition de la grille après les tirs (`grilleAvecTirs`) et placement aléatoire de la flotte.

### Moteur 3D et géométrie

- **`src/engine/boardGeometry.ts`** — définit la taille d’une case, la conversion du centre d’une case vers le monde 3D et la conversion inverse d’un point du plan de jeu vers une case, avec rejet des coordonnées hors grille.
- **`src/engine/cellPicking.ts`** — calcule la case visée à partir d’une caméra et d’un point en pixels CSS. Crée le rayon de sélection, trouve son intersection avec le plan y = 0 et délègue la conversion monde-grille à `mondeVersCase`.
- **`src/engine/boardScene.ts`** — contient toute l’intégration BabylonLite. Définit l’API publique `SceneGrille` et ses options, construit moteur, scène, caméra, éclairages, fond marin, dalles et marqueurs. Les marqueurs sont créés avant l’enregistrement de la scène puis rendus visibles ou masqués selon l’état. Le module gère aussi les aperçus, le survol, les événements DOM, le redimensionnement et la libération des ressources.

### Vérification

- **`scripts/check-picking.ts`** — vérification sans création de moteur GPU. Pour chaque case, projette son centre dans deux formats de canvas et deux configurations de caméra, puis vérifie que la conversion écran-vers-grille retrouve la case d’origine. Vérifie aussi que la case (0, 0) apparaît en haut à gauche. Le script échoue si une vérification ne passe pas.

## 7. Exécution et validation

Prérequis : Node.js compatible avec les dépendances et pnpm. L’affichage 3D nécessite un navigateur prenant en charge WebGPU. Si WebGPU est absent, le composant de grille présente une erreur plutôt que la scène.

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm check:picking
pnpm build
pnpm preview
```

- `pnpm dev` lance le serveur Vite de développement.
- `pnpm typecheck` exécute `vue-tsc --noEmit`.
- `pnpm check:picking` lance la vérification géométrique avec le support TypeScript expérimental de Node.
- `pnpm build` exécute d’abord la vérification Vue/TypeScript, puis produit le build Vite dans `dist/`.
- `pnpm preview` sert localement le build produit.

## 8. Limites et évolutions prévues

- **Serveur arbitre** : déplacer la flotte adverse et la résolution des coups côté serveur. Le client ne doit recevoir que les résultats nécessaires, pas l’état secret adverse.
- **Placement côté serveur** : valider les flottes transmises au serveur, même si le client réutilise les fonctions de règles.
- **Modèles 3D** : remplacer les marqueurs géométriques actuels par des modèles de bateaux.
- **Animations et décor** : ajouter notamment des animations d’eau, de projectile et d’impact.
- **Contrat de couleur de case** : `OptionsSceneGrille` expose actuellement `couleurCase`, mais la scène ne l’utilise pas encore.
- **Documentation d’architecture** : `README.md` présente le découpage général ; ce document décrit les noms et contrats tels qu’ils existent dans le code actuel.
