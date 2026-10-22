// Tout ce qui touche à BabylonLite est ici, et nulle part ailleurs.
// Ce module ne sait pas ce qu'est Vue : il reçoit une toile et renvoie une petite API (SceneGrille).

import {
    addToScene,
    createArcRotateCamera,
    attachControl,
    createBox,
    createCylinder,
    createDirectionalLight,
    createEngine,
    createGround,
    createHemisphericLight,
    createSceneContext,
    createSphere,
    createStandardMaterial,
    disposeEngine,
    disposeScene,
    enableOrthographicCamera,
    registerScene,
    resizeEngine,
    setSubtreeVisible,
    startEngine,
    stopEngine,
    type Camera,
    type EngineContext,
    type Mesh,
} from '@babylonjs/lite'
import { FLOTTE, TAILLE_GRILLE, type CoordCase, type EtatCase, type Couleur } from '../game/types.ts'
import { TAILLE_CASE, caseVersMonde } from './boardGeometry.ts'
import { ecranVersCase } from './cellPicking.ts'

export interface OptionsSceneGrille {
    /** 'inclinee' : vue en perspective inclinée (les grilles de jeu). 'dessus' : vue de dessus (placement). */
    vue: 'inclinee' | 'dessus',
    couleurCase: Couleur | null,
    couleurFondMarin: Couleur | null 
}

// "API" de SceneGrille : ce que l'on peut appeler de l'extérieur
export interface SceneGrille {
    /** Met à jour toutes les cases d'un coup. */
    definirCases(cases: readonly (readonly EtatCase[])[]): void
    definirEtatCase(colonne: number, ligne: number, etat: EtatCase): void

    /** Surbrillance de la case sous le pointeur (null pour l'enlever). */
    definirSurvol(caseGrille: CoordCase | null): void

    /** Prévisualisation d'un bateau en cours de placement : vert si valide, rouge sinon. */
    definirApercu(cases: readonly CoordCase[], valide: boolean): void
    effacerApercu(): void

    surSurvolCase(rappel: (caseGrille: CoordCase | null) => void): void
    surClicCase(rappel: (caseGrille: CoordCase) => void): void
    liberer(): void
}


function materiauColore(couleur: Couleur, emission: Couleur = [0, 0, 0]) {
    const materiau = createStandardMaterial()
    materiau.diffuseColor = couleur
    materiau.emissiveColor = emission
    return materiau
  
}

function masquer(maillage: Mesh): Mesh {
    setSubtreeVisible(maillage, false)
    return maillage
}

const LONGUEUR_MAX_BATEAU = Math.max(...FLOTTE.map((bateau) => bateau.longueur))

export async function creerSceneGrille(toile: HTMLCanvasElement, options: OptionsSceneGrille): Promise<SceneGrille> {
    if (!('gpu' in navigator)) throw new Error('WebGPU non disponible dans ce navigateur.')

    // 1. Moteur et scène
    const moteur: EngineContext = await createEngine(toile)
    const scene = createSceneContext(moteur)
    scene.clearColor = { r: 0.02, g: 0.06, b: 0.12, a: 1 }

    // 2. Caméra FIXE : on n'appelle pas attachControl, le joueur ne peut pas la bouger.
    let camera: Camera
    if (options.vue === 'dessus') {
        const cameraVueDessus = createArcRotateCamera(-Math.PI / 2, 0.0001, 20, { x: 0, y: 0, z: 0 })
        enableOrthographicCamera(cameraVueDessus, { halfHeight: (TAILLE_GRILLE * TAILLE_CASE) / 2 + 0.5 })
        camera = cameraVueDessus
    } else {
        const cameraInclinee = createArcRotateCamera(-Math.PI / 2, 1.0, 16, { x: 0, y: 0, z: 0 })
        camera = cameraInclinee
        attachControl(cameraInclinee, toile, scene)
    }
    scene.camera = camera

    // 3. Lumières
    if (options.vue === 'inclinee') {
        addToScene(scene, createHemisphericLight([0, 1, 0], 0.8))
        addToScene(scene, createDirectionalLight([-0.4, -1, -0.3], 0.8))
    }

    if (options.vue === 'dessus') {
        addToScene(scene, createDirectionalLight([-0.5, -1, -0.3], 0.8))
    }

    // 4. Décor : fond marin + une dalle par case (le jeu de cases forme visuellement la grille)
    const fondMarin = createGround(moteur, { width: TAILLE_GRILLE + 4, height: TAILLE_GRILLE + 4 })
    if (options.couleurFondMarin === null) {
        if (options.vue === 'inclinee') {
            fondMarin.material = materiauColore([0.03, 0.1, 0.2])
        } else {
            fondMarin.material = materiauColore([1, 1, 1])
        }
    } else {
        fondMarin.material = materiauColore(options.couleurFondMarin)
    }
    fondMarin.position.set(0, -0.12, 0)
    addToScene(scene, fondMarin)

    let materiauDalle = materiauColore([0.1, 0.35, 0.6])
    if (options.vue === 'dessus') {
        materiauDalle = materiauColore([0.1, 0.35, 0.6], [0.1, 0.1, 0.2])
    }
  
    const materiauBateau = materiauColore([0.25, 0.80, 0.82])
    const materiauTouche = materiauColore([0.9, 0.15, 0.1], [0.5, 0.05, 0.02])
    const materiauRate = materiauColore([0.95, 0.95, 0.95], [0.25, 0.25, 0.25])
    const materiauSurvol = materiauColore([0.95, 0.8, 0.2], [0.5, 0.4, 0.1])
    const materiauValide = materiauColore([0.2, 0.8, 0.35], [0.1, 0.4, 0.15])
    const materiauInvalide = materiauColore([0.85, 0.2, 0.2], [0.4, 0.08, 0.08])

    // Marqueurs par case, créés une fois pour toutes puis montrés/cachés.
    // (Dans Lite, tout doit être ajouté à la scène AVANT registerScene.)
    const marqueursBateau: Mesh[][] = []
    const marqueursTouche: Mesh[][] = []
    const marqueursRate: Mesh[][] = []

    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        marqueursBateau.push([])
        marqueursTouche.push([])
        marqueursRate.push([])
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
            const { x: mondeX, z: mondeZ } = caseVersMonde({ colonne, ligne })

            const dalle = createBox(moteur, { width: 0.94, height: 0.1, depth: 0.94 })
            dalle.material = materiauDalle
            dalle.position.set(mondeX, -0.05, mondeZ)
            addToScene(scene, dalle)

            const maillageBateau = masquer(createBox(moteur, { width: 0.86, height: 0.4, depth: 0.86 }))
            maillageBateau.material = materiauBateau
            maillageBateau.position.set(mondeX, 0.2, mondeZ)
            addToScene(scene, maillageBateau)
            marqueursBateau[ligne]!.push(maillageBateau)

            const maillageTouche = masquer(createCylinder(moteur, { height: 0.3, diameter: 0.44, tessellation: 16 }))
            maillageTouche.material = materiauTouche
            maillageTouche.position.set(mondeX, 0.15, mondeZ)
            addToScene(scene, maillageTouche)
            marqueursTouche[ligne]!.push(maillageTouche)

            const maillageRate = masquer(createCylinder(moteur, { height: 0.1, diameter: 0.34, tessellation: 16 }))
            maillageRate.material = materiauRate
            maillageRate.position.set(mondeX, 0.05, mondeZ)
            addToScene(scene, maillageRate)
            marqueursRate[ligne]!.push(maillageRate)
        }
    }

    // Surbrillance (une seule dalle qu'on déplace) et prévisualisation (deux petits lots de dalles réutilisées)
    const maillageSurvol = masquer(createBox(moteur, { width: 0.98, height: 0.04, depth: 0.98 }))
    maillageSurvol.material = materiauSurvol
    addToScene(scene, maillageSurvol)

    const creerLotApercu = (materiau: ReturnType<typeof materiauColore>): Mesh[] =>
        Array.from({ length: LONGUEUR_MAX_BATEAU }, () => {
            const maillage = masquer(createBox(moteur, { width: 0.9, height: 0.3, depth: 0.9 }))
            maillage.material = materiau
            addToScene(scene, maillage)
            return maillage
        })
    const lotValide = creerLotApercu(materiauValide)
    const lotInvalide = creerLotApercu(materiauInvalide)

    // 5. Enregistrement (compile les pipelines GPU) puis démarrage de la boucle de rendu
    await registerScene(scene)
    await startEngine(moteur)

    // Redimensionnement : le canvas suit la taille de son conteneur CSS
    resizeEngine(moteur)
    const observateurTaille = new ResizeObserver(() => resizeEngine(moteur))
    observateurTaille.observe(toile)

    // 6. Interactions : événements DOM du canvas → case de la grille
    const rappelsSurvol: Array<(caseGrille: CoordCase | null) => void> = []
    const rappelsClic: Array<(caseGrille: CoordCase) => void> = []

    const caseSousPointeur = (evenement: PointerEvent | MouseEvent): CoordCase | null => {
        const rectangle = toile.getBoundingClientRect()
        // Coordonnées relatives au canvas (et pas à la page), en pixels CSS
        return ecranVersCase(
            camera,
            evenement.clientX - rectangle.left,
            evenement.clientY - rectangle.top,
            rectangle.width,
            rectangle.height,
        )
    }

    let dernierSurvol: CoordCase | null = null
    const memeCase = (premiere: CoordCase | null, seconde: CoordCase | null) =>
        premiere === seconde || (!!premiere && !!seconde &&
            premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne)

    const surDeplacementPointeur = (evenement: PointerEvent) => {
        const caseGrille = caseSousPointeur(evenement)
        if (memeCase(caseGrille, dernierSurvol)) return
        dernierSurvol = caseGrille
        rappelsSurvol.forEach((rappel) => rappel(caseGrille))
    }
    const surSortiePointeur = () => {
        if (dernierSurvol === null) return
        dernierSurvol = null
        rappelsSurvol.forEach((rappel) => rappel(null))
    }
    const surClic = (evenement: MouseEvent) => {
        const caseGrille = caseSousPointeur(evenement)
        if (caseGrille) rappelsClic.forEach((rappel) => rappel(caseGrille))
    }
    toile.addEventListener('pointermove', surDeplacementPointeur)
    toile.addEventListener('pointerleave', surSortiePointeur)
    toile.addEventListener('click', surClic)

    // 7. L'API exposée au reste de l'application
    const definirEtatCase = (colonne: number, ligne: number, etat: EtatCase) => {
        setSubtreeVisible(marqueursBateau[ligne]![colonne]!, etat === 'bateau' || etat === 'coule')
        setSubtreeVisible(marqueursTouche[ligne]![colonne]!, etat === 'touche' || etat === 'coule')
        setSubtreeVisible(marqueursRate[ligne]![colonne]!, etat === 'rate')
    }

    const effacerApercu = () => {
        lotValide.forEach((maillage) => setSubtreeVisible(maillage, false))
        lotInvalide.forEach((maillage) => setSubtreeVisible(maillage, false))
    }

    let estLiberee = false
    return {
        definirEtatCase,
        definirCases(cases) {
            for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
                for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
                    definirEtatCase(colonne, ligne, cases[ligne]?.[colonne] ?? 'eau')
                }
            }
        },
        definirSurvol(caseGrille) {
            if (!caseGrille) {
                setSubtreeVisible(maillageSurvol, false)
                return
            }
            const { x, z } = caseVersMonde(caseGrille)
            maillageSurvol.position.set(x, 0.02, z)
            setSubtreeVisible(maillageSurvol, true)
        },
        definirApercu(cases, valide) {
            effacerApercu()
            const lot = valide ? lotValide : lotInvalide
            cases.slice(0, lot.length).forEach((caseGrille, index) => {
                const maillage = lot[index]!
                // Les cases hors grille ne sont pas dessinées (le rouge ne s'affiche que sur la grille)
                if (caseGrille.colonne < 0 || caseGrille.colonne >= TAILLE_GRILLE ||
                        caseGrille.ligne < 0 || caseGrille.ligne >= TAILLE_GRILLE) return
                const { x, z } = caseVersMonde(caseGrille)
                maillage.position.set(x, 0.17, z)
                setSubtreeVisible(maillage, true)
            })
        },
        effacerApercu,
        surSurvolCase: (rappel) => void rappelsSurvol.push(rappel),
        surClicCase: (rappel) => void rappelsClic.push(rappel),
        liberer() {
            if (estLiberee) return
            estLiberee = true
            toile.removeEventListener('pointermove', surDeplacementPointeur)
            toile.removeEventListener('pointerleave', surSortiePointeur)
            toile.removeEventListener('click', surClic)
            observateurTaille.disconnect()
            stopEngine(moteur)
            disposeScene(scene)
            disposeEngine(moteur)
        },
    }
}
