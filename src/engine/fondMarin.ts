// Fond de la mer : sable, cailloux et algues, visibles à travers l'eau translucide.
// Même règle que le reste de la 3D : tout est créé et ajouté à la scène avant registerScene.
// Les algues ondulent à chaque image ; le tout est déterministe (même décor sur les deux grilles).

import {
    addToScene,
    createCylinder,
    createSphere,
    createStandardMaterial,
    createTransformNode,
    onBeforeRender,
    type EngineContext,
    type Mesh,
    type SceneContext,
} from '@babylonjs/lite'
import type { Couleur } from '../game/types.ts'
import { creerHorloge } from './horloge.ts'

export interface OptionsFondMarin {
    /** Côté du bloc d'eau, en unités du monde. */
    taille: number
    /** Hauteur du sable. */
    fond: number
    /** Côté de la grille de jeu : le décor reste un peu en retrait pour ne pas cacher les cases. */
    tailleGrille: number
}

/** Générateur pseudo-aléatoire reproductible (mulberry32) : le décor est identique à chaque partie. */
function generateur(graine: number) {
    let etat = graine >>> 0
    return () => {
        etat = (etat + 0x6d2b79f5) >>> 0
        let t = etat
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function matiere(couleur: Couleur, emission = 0.0) {
    const materiau = createStandardMaterial()
    materiau.diffuseColor = couleur
    materiau.emissiveColor = [couleur[0] * emission, couleur[1] * emission, couleur[2] * emission]
    materiau.specularColor = [0.03, 0.03, 0.03]
    return materiau
}

export const COULEUR_SABLE: Couleur = [0.9, 0.8, 0.56]
/** Ondulation des algues : angle maximal du haut du brin (en radians, 0,06 ≈ 3,5°) et vitesse. */
const AMPLITUDE_ALGUES = 0.06
const VITESSE_ALGUES = 0.9

export function creerDecorFondMarin(moteur: EngineContext, scene: SceneContext, options: OptionsFondMarin): void {
    const hasard = generateur(20261024)
    const demi = options.taille / 2 - 0.35
    const placer = <T extends Mesh>(maillage: T, x: number, y: number, z: number): T => {
        maillage.position.set(x, y, z)
        addToScene(scene, maillage)
        return maillage
    }

    // Cailloux : sphères aplaties de grises et de beiges, posées sur le sable.
    const nuancesCailloux = [[0.72, 0.68, 0.6], [0.82, 0.76, 0.64], [0.62, 0.62, 0.6], [0.88, 0.8, 0.66]].map((c) => matiere(c as Couleur))
    for (let i = 0; i < 46; i++) {
        const x = (hasard() * 2 - 1) * demi
        const z = (hasard() * 2 - 1) * demi
        const largeur = 0.14 + hasard() * 0.34
        const caillou = createSphere(moteur, { diameterX: largeur, diameterY: largeur * (0.45 + hasard() * 0.3), diameterZ: largeur * (0.7 + hasard() * 0.4), segments: 7 })
        caillou.material = nuancesCailloux[Math.floor(hasard() * nuancesCailloux.length)]!
        placer(caillou, x, options.fond + largeur * 0.16, z)
        caillou.rotation.y = hasard() * Math.PI
    }

    // Quelques gros rochers, plus près des bords.
    const rocher = matiere([0.58, 0.58, 0.56])
    for (let i = 0; i < 7; i++) {
        const angle = hasard() * Math.PI * 2
        const rayon = demi * (0.72 + hasard() * 0.26)
        const largeur = 0.7 + hasard() * 0.6
        const gros = createSphere(moteur, { diameterX: largeur, diameterY: largeur * 0.55, diameterZ: largeur * 0.8, segments: 8 })
        gros.material = rocher
        placer(gros, Math.cos(angle) * rayon, options.fond + largeur * 0.18, Math.sin(angle) * rayon)
        gros.rotation.y = hasard() * Math.PI
    }

    // Algues : fines pointes vertes. Chaque brin est accroché à un pivot placé AU PIED : seul le haut bouge,
    // le pied reste planté dans le sable. Chaque touffe en réunit trois, de tailles différentes.
    const verts: Couleur[] = [[0.16, 0.62, 0.3], [0.28, 0.74, 0.32], [0.1, 0.54, 0.36], [0.42, 0.76, 0.3]]
    const nuancesAlgues = verts.map((couleur) => matiere(couleur, 0.55))
    interface Algue { pivot: ReturnType<typeof createTransformNode>, phase: number, amplitude: number }
    const algues: Algue[] = []
    for (let touffe = 0; touffe < 26; touffe++) {
        const centreX = (hasard() * 2 - 1) * demi
        const centreZ = (hasard() * 2 - 1) * demi
        const materiau = nuancesAlgues[Math.floor(hasard() * nuancesAlgues.length)]!
        for (let brin = 0; brin < 3; brin++) {
            const hauteur = 0.6 + hasard() * 0.7
            const maillage = createCylinder(moteur, { height: hauteur, diameterBottom: 0.15 + hasard() * 0.07, diameterTop: 0.02, tessellation: 5 })
            maillage.material = materiau
            maillage.position.set(0, hauteur / 2, 0) // le pivot est au pied du brin
            const pivot = createTransformNode(`algue_${touffe}_${brin}`, centreX + (hasard() - 0.5) * 0.26, options.fond, centreZ + (hasard() - 0.5) * 0.26)
            pivot.children.push(maillage)
            addToScene(scene, pivot)
            algues.push({ pivot, phase: hasard() * Math.PI * 2, amplitude: AMPLITUDE_ALGUES * (0.7 + hasard() * 0.6) })
        }
    }

    let temps = 0
    const horloge = creerHorloge()
    onBeforeRender(scene, (deltaMs) => {
        temps += horloge(deltaMs) / 1000
        for (const algue of algues) {
            algue.pivot.rotation.z = Math.sin(temps * VITESSE_ALGUES + algue.phase) * algue.amplitude
            algue.pivot.rotation.x = Math.cos(temps * VITESSE_ALGUES * 0.8 + algue.phase * 1.3) * algue.amplitude * 0.7
        }
    })
}
