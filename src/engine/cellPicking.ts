// Pointeur → case de la grille, par intersection du rayon de la souris avec le plan de la mer (y = 0).
// Fonctionne pour n'importe quelle caméra fixe (inclinée ou vue de dessus), sans picker GPU ni mesh.

import { createPickingRay, getEffectiveAspectRatio, getViewProjectionMatrix, type Camera } from '@babylonjs/lite'
import type { CoordCase } from '../game/types.ts'
import { mondeVersCase } from './boardGeometry.ts'

/**
 * @param abscissePixel, ordonneePixel   position du pointeur, relative au coin haut-gauche du canvas
 * @param largeur, hauteur  taille du canvas en pixels CSS
 */
export function ecranVersCase(
    camera: Camera,
    abscissePixel: number,
    ordonneePixel: number,
    largeur: number,
    hauteur: number,
): CoordCase | null {
    const rapport = getEffectiveAspectRatio(camera, largeur, hauteur)
    const matriceVueProjection = getViewProjectionMatrix(camera, rapport)
    const rayon = createPickingRay(abscissePixel, ordonneePixel, matriceVueProjection, largeur, hauteur)
    if (!rayon) return null

    // Plan y = 0 :  origin.y + t * direction.y = 0
    const directionY = rayon.direction[1]
    if (Math.abs(directionY) < 1e-9) return null // rayon parallèle à la mer
    const distance = -rayon.origin[1] / directionY
    if (distance < 0) return null // la mer est derrière la caméra

    return mondeVersCase(
        rayon.origin[0] + distance * rayon.direction[0],
        rayon.origin[2] + distance * rayon.direction[2],
    )
}
