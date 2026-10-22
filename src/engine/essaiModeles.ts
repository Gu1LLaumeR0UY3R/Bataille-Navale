// Scène d'essai : affiche l'océan et les bateaux côte à côte pour vérifier chargement, textures,
// échelle et orientation. Aucune règle de jeu ici.

import {
    addToScene,
    attachControl,
    createArcRotateCamera,
    createBox,
    createDirectionalLight,
    createEngine,
    createHemisphericLight,
    createSceneContext,
    createStandardMaterial,
    disposeEngine,
    disposeScene,
    registerScene,
    resizeEngine,
    startEngine,
    stopEngine,
} from '@babylonjs/lite'
import { TAILLE_CASE } from './boardGeometry.ts'
import { MODELES, chargerModele, type ModeleCharge } from './modeles.ts'

export interface ModeleEssai {
    identifiant: string
    nom: string
    cases: number
}

export interface SceneEssai {
    /** Bateaux affichés, du haut vers le bas de l'écran. */
    bateaux: readonly ModeleEssai[]
    /** Ajoute `degres` à la rotation du bateau (sens horaire vu de dessus). */
    tourner(identifiant: string, degres: number): void
    /** Rotation totale actuelle du bateau, en degrés (0 à 359). */
    lireRotation(identifiant: string): number
    liberer(): void
}

const ESPACEMENT_COULOIRS = 2
const DEGRES_VERS_RADIANS = Math.PI / 180

export async function creerSceneEssai(toile: HTMLCanvasElement): Promise<SceneEssai> {
    if (!('gpu' in navigator)) throw new Error('WebGPU non disponible dans ce navigateur.')

    const moteur = await createEngine(toile)
    const scene = createSceneContext(moteur)
    scene.clearColor = { r: 0.02, g: 0.06, b: 0.12, a: 1 }

    const camera = createArcRotateCamera(-Math.PI / 2, 1.0, 20, { x: 0, y: 0, z: 0 })
    scene.camera = camera
    attachControl(camera, toile, scene)

    addToScene(scene, createHemisphericLight([0, 1, 0], 0.8))
    addToScene(scene, createDirectionalLight([-0.4, -1, -0.3], 0.8))

    // Chargement : tout doit être ajouté à la scène AVANT registerScene.
    const modelesCharges: ModeleCharge[] = []
    for (const definition of MODELES) {
        modelesCharges.push(await chargerModele(moteur, definition))
    }

    const ocean = modelesCharges.find((modele) => modele.definition.type === 'ocean')
    if (ocean) addToScene(scene, ocean.pivot)

    const bateaux = modelesCharges.filter((modele) => modele.definition.type === 'bateau')
    const materielEmplacement = createStandardMaterial()
    materielEmplacement.diffuseColor = [0.1, 0.35, 0.6]
    materielEmplacement.emissiveColor = [0.05, 0.1, 0.2]

    const rotations = new Map<string, number>() // degrés, rotation totale par bateau
    bateaux.forEach((modele, index) => {
        // Le premier bateau est tout en haut de l'écran (z le plus grand), comme la ligne 0 de la grille.
        const z = ((bateaux.length - 1) / 2 - index) * ESPACEMENT_COULOIRS
        modele.pivot.position.set(0, 0, z)
        addToScene(scene, modele.pivot)
        rotations.set(modele.definition.identifiant, Math.round(modele.yawAlignement / DEGRES_VERS_RADIANS))

        // Emplacement de référence : la longueur du bateau en cases, 1 case de large.
        const emplacement = createBox(moteur, { width: modele.definition.cases * TAILLE_CASE, height: 0.04, depth: TAILLE_CASE * 0.94 })
        emplacement.material = materielEmplacement
        emplacement.position.set(0, -0.02, z)
        addToScene(scene, emplacement)
    })

    await registerScene(scene)
    await startEngine(moteur)

    resizeEngine(moteur)
    const observateurTaille = new ResizeObserver(() => resizeEngine(moteur))
    observateurTaille.observe(toile)

    const pivotDe = (identifiant: string) => bateaux.find((modele) => modele.definition.identifiant === identifiant)?.pivot

    let estLiberee = false
    return {
        bateaux: bateaux.map(({ definition }) => ({ identifiant: definition.identifiant, nom: definition.nom, cases: definition.cases })),
        tourner(identifiant, degres) {
            const pivot = pivotDe(identifiant)
            if (!pivot) return
            const total = (((rotations.get(identifiant) ?? 0) + degres) % 360 + 360) % 360
            rotations.set(identifiant, total)
            pivot.rotation.set(0, total * DEGRES_VERS_RADIANS, 0)
        },
        lireRotation: (identifiant) => rotations.get(identifiant) ?? 0,
        liberer() {
            if (estLiberee) return
            estLiberee = true
            observateurTaille.disconnect()
            stopEngine(moteur)
            disposeScene(scene)
            disposeEngine(moteur)
        },
    }
}
