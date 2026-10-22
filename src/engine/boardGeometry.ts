// Correspondance « case de la grille » ↔ « position dans le monde 3D ».
// Repère de Lite (main gauche) : +x vers la droite, +y vers le haut, +z s'éloigne de la caméra.
// La caméra est placée côté -z : la ligne 0 de la grille est donc en HAUT de l'écran.

import { TAILLE_GRILLE, type CoordCase } from '../game/types.ts'

export const TAILLE_CASE = 1

const DEMI_GRILLE = (TAILLE_GRILLE - 1) / 2

/** Centre de la case (x, y) dans le monde (sur le plan de la mer, y = 0). */
export function caseVersMonde(caseGrille: CoordCase): { x: number; z: number } {
    return {
        x: (caseGrille.colonne - DEMI_GRILLE) * TAILLE_CASE,
        z: (DEMI_GRILLE - caseGrille.ligne) * TAILLE_CASE,
    }
}

/** Case qui contient le point (x, z) du plan de la mer, ou null si on est hors de la grille. */
export function mondeVersCase(abscisse: number, profondeur: number): CoordCase | null {
    const colonne = Math.floor(abscisse / TAILLE_CASE + TAILLE_GRILLE / 2)
    const ligne = Math.floor(TAILLE_GRILLE / 2 - profondeur / TAILLE_CASE)
    if (colonne < 0 || colonne >= TAILLE_GRILLE || ligne < 0 || ligne >= TAILLE_GRILLE) return null
    return { colonne, ligne }
}
