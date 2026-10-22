// Chargement et mise à l'échelle des modèles 3D (.glb) du jeu.
// Comme boardScene.ts, ce module ne sait pas ce qu'est Vue.
// Crédits des modèles : voir CREDITS.md à la racine du projet.

import {
    computeMaxExtents,
    createTransformNode,
    getContainerMeshes,
    loadGltf,
    type EngineContext,
    type SceneNode,
    type TransformNode,
} from '@babylonjs/lite'
import { TAILLE_CASE } from './boardGeometry.ts'

export interface DefinitionModele {
    identifiant: string
    /** Nom du fichier dans public/modeles/. */
    fichier: string
    nom: string
    type: 'bateau' | 'ocean'
    /** Bateaux : nombre de cases occupées. Océan : nombre de cases couvertes (largeur et profondeur). */
    cases: number
}

/** Modèles utilisés par la page d'essai. L'association modèle ↔ bateau de la flotte reste à confirmer. */
export const MODELES: readonly DefinitionModele[] = [
    { identifiant: 'ocean', fichier: 'ocean.glb', nom: 'Océan', type: 'ocean', cases: 40 },
    { identifiant: 'porte_avions', fichier: 'porte-avions-lowpoly.glb', nom: 'Porte-avions (low poly aircraft carrier)', type: 'bateau', cases: 5 },
    { identifiant: 'croiseur', fichier: 'cuirasse-lowpoly.glb', nom: 'Croiseur (low poly battleship)', type: 'bateau', cases: 4 },
    { identifiant: 'contre_torpilleur', fichier: 'cuirasse-simple.glb', nom: 'Contre-torpilleur (Simple Battleship)', type: 'bateau', cases: 3 },
    { identifiant: 'sous_marin', fichier: 'sous-marin.glb', nom: 'Sous-marin (Submarine)', type: 'bateau', cases: 3 },
    { identifiant: 'torpilleur', fichier: 'patrouilleur-hurricane.glb', nom: 'Torpilleur (USS Hurricane PC-3)', type: 'bateau', cases: 2 },
]

/** Un modèle chargé : `pivot` est le nœud à ajouter à la scène, à déplacer et à tourner. */
export interface ModeleCharge {
    definition: DefinitionModele
    pivot: TransformNode
    /** Rotation autour de l'axe vertical qui aligne le grand axe du modèle sur +x (en radians). */
    yawAlignement: number
}

/** Part de la longueur d'une case occupée par un bateau (laisse un petit vide entre deux bateaux voisins). */
const REMPLISSAGE_BATEAU = 0.92
/** Hauteur de l'océan par rapport à sa largeur : le relief du fichier est très marqué, on l'aplatit. */
const RAPPORT_RELIEF_OCEAN = 0.12
/** Altitude du point le plus haut de l'océan. */
const ALTITUDE_OCEAN = -0.05

export function urlModele(fichier: string): string {
    return `${import.meta.env.BASE_URL}modeles/${fichier}`
}

/**
 * Charge un modèle, le centre, le met à l'échelle de la grille et l'enveloppe dans un pivot.
 * - Bateau : grand axe aligné sur +x, centré en x et z, base posée sur y = 0, longueur = cases × TAILLE_CASE.
 * - Océan : centré, aplati, surface la plus haute à ALTITUDE_OCEAN.
 * Le pivot doit ensuite être ajouté à la scène avec addToScene, AVANT registerScene.
 */
export async function chargerModele(moteur: EngineContext, definition: DefinitionModele): Promise<ModeleCharge> {
    let conteneur
    try {
        conteneur = await loadGltf(moteur, urlModele(definition.fichier))
    } catch (erreur) {
        const detail = erreur instanceof Error ? erreur.message : String(erreur)
        throw new Error(`Chargement de « ${definition.fichier} » impossible : ${detail}`)
    }

    const racine = conteneur.entities[0] as SceneNode | undefined
    if (!racine) throw new Error(`« ${definition.fichier} » ne contient aucune scène.`)

    // Étendue du modèle dans le monde, avant tout déplacement.
    const minimum = [Infinity, Infinity, Infinity]
    const maximum = [-Infinity, -Infinity, -Infinity]
    for (const etendue of computeMaxExtents(getContainerMeshes(conteneur))) {
        for (let axe = 0; axe < 3; axe++) {
            minimum[axe] = Math.min(minimum[axe]!, etendue.minimum[axe]!)
            maximum[axe] = Math.max(maximum[axe]!, etendue.maximum[axe]!)
        }
    }
    const taille = maximum.map((valeur, axe) => valeur - minimum[axe]!)
    if (!taille.every((valeur) => Number.isFinite(valeur) && valeur > 0)) {
        throw new Error(`Dimensions de « ${definition.fichier} » illisibles : ${taille.join(', ')}`)
    }
    const centre = maximum.map((valeur, axe) => (valeur + minimum[axe]!) / 2)

    // Le centre (x, z) du modèle est amené à l'origine du pivot ; en hauteur, selon le type de modèle.
    const decalageY = definition.type === 'bateau' ? minimum[1]! : centre[1]!
    racine.position.set(racine.position.x - centre[0]!, racine.position.y - decalageY, racine.position.z - centre[2]!)

    const pivot = createTransformNode(`pivot_${definition.identifiant}`)
    pivot.children.push(racine) // addToScene renseignera racine.parent

    let yawAlignement = 0
    if (definition.type === 'bateau') {
        const grandAxeEstZ = taille[2]! > taille[0]!
        const longueurModele = Math.max(taille[0]!, taille[2]!)
        const echelle = (definition.cases * TAILLE_CASE * REMPLISSAGE_BATEAU) / longueurModele
        pivot.scaling.set(echelle, echelle, echelle)
        yawAlignement = grandAxeEstZ ? Math.PI / 2 : 0
        pivot.rotation.set(0, yawAlignement, 0)
    } else {
        const echelleHorizontale = (definition.cases * TAILLE_CASE) / Math.max(taille[0]!, taille[2]!)
        const echelleVerticale = echelleHorizontale * RAPPORT_RELIEF_OCEAN
        pivot.scaling.set(echelleHorizontale, echelleVerticale, echelleHorizontale)
        pivot.position.set(0, ALTITUDE_OCEAN - (taille[1]! / 2) * echelleVerticale, 0)
    }

    return { definition, pivot, yawAlignement }
}
