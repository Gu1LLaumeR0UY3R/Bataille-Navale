// Format d'une carte. Une carte ne change PAS les règles : elle change l'ambiance (mer, ciel, lumière)
// et ajoute des décors autour de la grille. Les cartes vivent en JSON dans public/cartes/<id>/carte.json.

import type { Couleur } from '../game/types.ts'

export type Vec3 = [number, number, number]

export interface Ambiance {
    /** Couleur de la mer. */
    eau: Couleur
    /** Couleur du ciel (fond de la scène). */
    ciel: Couleur
    /** Lumière d'ambiance venue du ciel. */
    lumiereCiel: { couleur: Couleur, intensite: number }
    /** Soleil : direction de la lumière (elle avance vers +z, comme le regard de la caméra). */
    soleil: { direction: Vec3, couleur: Couleur, intensite: number }
}

interface DecorSimple<T extends string> { type: T, x: number, z: number, echelle: number }

export type Decor =
    | DecorSimple<'ile'>
    | DecorSimple<'rocher'>
    | DecorSimple<'bouee'>
    | { type: 'modele', fichier: string, x: number, y: number, z: number, echelle: number, rotation: number }

export interface Carte {
    id: string
    nom: string
    description: string
    /** Image d'aperçu (relative au dossier de la carte). Sans image, un aperçu est dessiné avec l'ambiance. */
    apercu: string | null
    ambiance: Ambiance
    decors: Decor[]
    /** Dossier de la carte, pour retrouver ses fichiers (modèles 3D, aperçu). */
    base: string
}
