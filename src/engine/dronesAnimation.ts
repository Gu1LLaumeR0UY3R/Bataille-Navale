// Animation des quatre drones de réparation : ils arrivent du ciel, tournent autour de la case
// pendant la réparation, puis repartent. Calcul pur (aucune dépendance à Lite) : boardScene.ts
// n'a plus qu'à appliquer la pose de chaque drone à chaque image.

/** Durée de chaque phase, en secondes. */
export const PHASES_DRONES = { arrivee: 1.4, travail: 1.5, depart: 1.0 } as const
export const DUREE_DRONES = PHASES_DRONES.arrivee + PHASES_DRONES.travail + PHASES_DRONES.depart
/** Instant où la case est réparée : au milieu du travail. */
export const INSTANT_REPARATION = PHASES_DRONES.arrivee + PHASES_DRONES.travail / 2

const RAYON_ARRIVEE = 7.5
const HAUTEUR_ARRIVEE = 4.2
const RAYON_ORBITE = 1.25
const HAUTEUR_ORBITE = 1.4
/** Vitesse de rotation autour de la case, en radians par seconde. */
const VITESSE_ORBITE = 2.1
export const NOMBRE_DRONES = 4

export interface PoseDrone {
    visible: boolean
    x: number
    y: number
    z: number
    /** Rotation du drone autour de l'axe vertical. */
    lacet: number
    /** Facteur à appliquer à la taille normale du drone (0 à 1). */
    echelle: number
}

const sortieDouce = (u: number) => 1 - Math.pow(1 - u, 3)
const entreeDouce = (u: number) => u * u * u
const borner = (u: number) => Math.min(1, Math.max(0, u))

/** Pose du drone `index` (0 à 3) à l'instant `temps` (secondes depuis le début), autour de `cible`. */
export function poseDrone(index: number, temps: number, cible: { x: number, z: number }): PoseDrone {
    if (temps < 0 || temps > DUREE_DRONES) return { visible: false, x: cible.x, y: HAUTEUR_ORBITE, z: cible.z, lacet: 0, echelle: 0 }

    const { arrivee, travail } = PHASES_DRONES
    // Chaque drone arrive d'un coin différent et reste décalé d'un quart de tour sur l'orbite.
    const angleDepart = Math.PI / 4 + (index * Math.PI) / 2
    const angle = angleDepart + VITESSE_ORBITE * temps

    let rayon = RAYON_ORBITE
    let hauteur = HAUTEUR_ORBITE
    let echelle = 1
    if (temps < arrivee) {
        const u = sortieDouce(temps / arrivee)
        rayon = RAYON_ARRIVEE + (RAYON_ORBITE - RAYON_ARRIVEE) * u
        hauteur = HAUTEUR_ARRIVEE + (HAUTEUR_ORBITE - HAUTEUR_ARRIVEE) * u
        echelle = 0.25 + 0.75 * sortieDouce(borner(temps / 0.6))
    } else if (temps <= arrivee + travail) {
        // Léger flottement, décalé d'un drone à l'autre.
        hauteur = HAUTEUR_ORBITE + 0.07 * Math.sin(6 * temps + index * 1.7)
    } else {
        const u = entreeDouce(borner((temps - arrivee - travail) / PHASES_DRONES.depart))
        rayon = RAYON_ORBITE + (RAYON_ARRIVEE - RAYON_ORBITE) * u
        hauteur = HAUTEUR_ORBITE + (HAUTEUR_ARRIVEE - HAUTEUR_ORBITE) * u
        echelle = 1 - 0.75 * u
    }

    return {
        visible: true,
        x: cible.x + rayon * Math.cos(angle),
        y: hauteur,
        z: cible.z + rayon * Math.sin(angle),
        lacet: -angle + Math.PI,
        echelle,
    }
}
