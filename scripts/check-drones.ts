// Vérification sans navigateur : trajectoire des quatre drones de réparation.
//   pnpm check:drones
import { DUREE_DRONES, INSTANT_REPARATION, NOMBRE_DRONES, PHASES_DRONES, poseDrone } from '../src/engine/dronesAnimation.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const cible = { x: 2, z: -1 }
const distance = (p: { x: number, z: number }) => Math.hypot(p.x - cible.x, p.z - cible.z)

for (let index = 0; index < NOMBRE_DRONES; index++) {
    // Invisible avant et après l'animation.
    if (poseDrone(index, -0.1, cible).visible || poseDrone(index, DUREE_DRONES + 0.1, cible).visible) erreur('Drone visible hors animation.')

    // Au début : loin et en altitude. Pendant le travail : près de la case. À la fin : reparti loin.
    const debut = poseDrone(index, 0, cible)
    const travail = poseDrone(index, INSTANT_REPARATION, cible)
    const fin = poseDrone(index, DUREE_DRONES, cible)
    if (distance(debut) < 6 || debut.y < 3.5) erreur(`Drone ${index} : départ trop proche.`)
    if (distance(travail) > 1.4 || travail.y < 1.2 || travail.y > 1.6) erreur(`Drone ${index} : pas en orbite à l'instant de réparation.`)
    if (distance(fin) < 6) erreur(`Drone ${index} : ne repart pas assez loin.`)

    // L'approche est continue et ne recule jamais.
    let precedent = distance(poseDrone(index, 0, cible))
    for (let t = 0.02; t <= PHASES_DRONES.arrivee; t += 0.02) {
        const d = distance(poseDrone(index, t, cible))
        if (d > precedent + 1e-9) erreur(`Drone ${index} : recule pendant l'arrivée (t=${t.toFixed(2)}).`)
        precedent = d
    }
}

// Les quatre drones arrivent de directions différentes (jamais empilés).
const departs = Array.from({ length: NOMBRE_DRONES }, (_, i) => poseDrone(i, 0, cible))
for (let a = 0; a < NOMBRE_DRONES; a++) {
    for (let b = a + 1; b < NOMBRE_DRONES; b++) {
        if (Math.hypot(departs[a]!.x - departs[b]!.x, departs[a]!.z - departs[b]!.z) < 3) erreur('Deux drones partent du même endroit.')
    }
}
// En orbite, ils restent espacés d'au moins une case : les quatre drones ne se chevauchent pas.
const orbite = Array.from({ length: NOMBRE_DRONES }, (_, i) => poseDrone(i, INSTANT_REPARATION, cible))
for (let a = 0; a < NOMBRE_DRONES; a++) {
    for (let b = a + 1; b < NOMBRE_DRONES; b++) {
        if (Math.hypot(orbite[a]!.x - orbite[b]!.x, orbite[a]!.z - orbite[b]!.z) < 1.0) erreur('Deux drones se chevauchent en orbite.')
    }
}
console.log(`OK : drones (durée ${DUREE_DRONES.toFixed(1)} s, réparation à ${INSTANT_REPARATION.toFixed(2)} s).`)
