# Créer une carte personnalisée

1. Copier un dossier existant (par exemple `lagon/`) et le renommer : lettres minuscules, chiffres, `-` ou `_` (ex. `mon-ile`).
2. Modifier `carte.json` dans ce dossier.
3. Ajouter l'identifiant dans `index.json` : `{ "cartes": ["lagon", "mon-ile"] }`.
4. Recharger la page : la carte apparaît dans le menu. Aucune recompilation.

Une carte invalide est ignorée, avec un avertissement dans la console du navigateur (F12).

## carte.json

```json
{
    "nom": "Mon île",
    "description": "Une phrase pour le menu.",
    "apercu": "apercu.png",
    "ambiance": {
        "eau": [0.04, 0.4, 0.52],
        "ciel": [0.12, 0.36, 0.52],
        "lumiereCiel": { "couleur": [0.78, 0.9, 1], "intensite": 0.85 },
        "soleil": { "direction": [0.35, -0.85, 0.5], "couleur": [1, 0.93, 0.76], "intensite": 0.85 }
    },
    "decors": [
        { "type": "ile", "x": -6, "z": -5.6, "echelle": 1.3 },
        { "type": "modele", "fichier": "phare.glb", "x": 6, "y": 0, "z": 5, "echelle": 0.5, "rotation": 0.8 }
    ]
}
```

- Couleurs : `[rouge, vert, bleu]`, de 0 à 1.
- `soleil.direction` : sens de la lumière. `[0.35, -0.85, 0.5]` = soleil haut derrière la caméra (peu de reflets). Mettre un `z` négatif donne un soleil face à la caméra : plus de reflets.
- `apercu` : image facultative (dans le dossier de la carte). Sans elle, un aperçu est dessiné avec les couleurs de l'ambiance.
- Décors : `ile`, `rocher`, `bouee` (formes intégrées) ou `modele` (fichier `.glb` du dossier de la carte).
  La grille occupe de -5 à 5 en `x` et `z` ; la mer s'étend jusqu'à ±7. Placer les décors entre 5,5 et 6,5 pour ne pas gêner le jeu (valeurs limitées à ±6,5).
- Les décors flottent avec les vagues et n'ont aucun effet sur les règles.
