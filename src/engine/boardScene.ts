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
    loadGltf,
    onBeforeRender,
    registerScene,
    resizeEngine,
    setSubtreeVisible,
    startEngine,
    stopEngine,
    type Camera,
    type EngineContext,
    type Mesh,
    type SceneNode,
} from '@babylonjs/lite'
import { FLOTTE, TAILLE_GRILLE, type Bateau, type CoordCase, type EtatCase, type Couleur } from '../game/types.ts'
import { TAILLE_CASE, caseVersMonde } from './boardGeometry.ts'
import { ecranVersCase } from './cellPicking.ts'
import { hauteurVague, penteVague } from './vagues.ts'

/** Couleur des dalles de mer (RGB, 0 à 1). */
const COULEUR_DALLE: Couleur = [0.07, 0.62, 0.72]
/** Les dalles s'inclinent avec la pente de la vague (1 = normal, 0 = pas d'inclinaison, -1 = inversé). */
const INCLINAISON_DALLES = 1

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
    definirBateaux(bateaux: readonly Bateau[]): void

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

const CONFIG_MODELES: Record<string, { fichier: string, facteur: number, y: number, inverserSens?: boolean, inverserSensHorizontal?: boolean, inverserSensVertical?: boolean }> = {
    porte_avions: { fichier: 'porte-avions-lowpoly.glb', facteur: 0.32, y: 0.1 },
    croiseur: { fichier: 'cuirasse-lowpoly.glb', facteur: 0.03, y: 0.1, inverserSens: true },
    contre_torpilleur: { fichier: 'patrouilleur-hurricane.glb', facteur: 0.15, y: 0.1, inverserSensVertical: true },
    sous_marin: { fichier: 'sous-marin.glb', facteur: 0.0045, y: 0.1, inverserSensHorizontal: true },
    torpilleur: { fichier: 'cuirasse-simple.glb', facteur: 0.59, y: 0.3, inverserSens: true },
}

function mesurer(racine: SceneNode): { min: [number, number, number], max: [number, number, number] } | null {
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    const visiter = (noeud: SceneNode) => {
        const limites = noeud as SceneNode & {
            boundMin?: readonly [number, number, number]
            boundMax?: readonly [number, number, number]
        }
        if (limites.boundMin && limites.boundMax) {
            const matrice = noeud.worldMatrix
            for (const x of [limites.boundMin[0], limites.boundMax[0]]) {
                for (const y of [limites.boundMin[1], limites.boundMax[1]]) {
                    for (const z of [limites.boundMin[2], limites.boundMax[2]]) {
                        const point = [
                            x * matrice[0]! + y * matrice[4]! + z * matrice[8]! + matrice[12]!,
                            x * matrice[1]! + y * matrice[5]! + z * matrice[9]! + matrice[13]!,
                            x * matrice[2]! + y * matrice[6]! + z * matrice[10]! + matrice[14]!,
                        ]
                        for (let axe = 0; axe < 3; axe++) {
                            min[axe] = Math.min(min[axe]!, point[axe]!)
                            max[axe] = Math.max(max[axe]!, point[axe]!)
                        }
                    }
                }
            }
        }
        noeud.children.forEach(visiter)
    }
    visiter(racine)
    return Number.isFinite(min[0]) ? { min, max } : null
}

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

    let materiauDalle = materiauColore(COULEUR_DALLE)
    if (options.vue === 'dessus') {
        materiauDalle = materiauColore(COULEUR_DALLE, [0.1, 0.1, 0.2])
    }

    // Vagues : seulement en vue inclinée (les grilles de jeu). En vue de dessus (placement), l'eau reste calme.
    const AVEC_VAGUES = options.vue === 'inclinee'
    let tempsVagues = 0
    interface Cellule {
        x: number
        z: number
        dalle: Mesh
        /** Marqueurs posés sur la case, avec leur hauteur de repos. */
        marqueurs: { maillage: Mesh, hauteurRepos: number }[]
    }
    const cellules: Cellule[] = []
    /** Surbrillance et aperçu : montrés puis cachés, ils suivent la vague tant qu'ils sont affichés. */
    let survolActuel: { x: number, z: number } | null = null
    const apercuActif: { maillage: Mesh, x: number, z: number, hauteurRepos: number }[] = []
    /** Modèles 3D de bateaux placés : ils montent et descendent avec la vague. */
    const bateauxFlottants: { racine: SceneNode, hauteurRepos: number, x: number, z: number }[] = []
  
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
    const etatsCases: EtatCase[][] = Array.from(
        { length: TAILLE_GRILLE },
        () => Array<EtatCase>(TAILLE_GRILLE).fill('eau'),
    )
    const casesAvecModele = new Set<string>()

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
            const cellule: Cellule = { x: mondeX, z: mondeZ, dalle, marqueurs: [] }
            cellules.push(cellule)

            const maillageBateau = masquer(createBox(moteur, { width: 0.86, height: 0.4, depth: 0.86 }))
            maillageBateau.material = materiauBateau
            maillageBateau.position.set(mondeX, 0.2, mondeZ)
            addToScene(scene, maillageBateau)
            marqueursBateau[ligne]!.push(maillageBateau)
            cellule.marqueurs.push({ maillage: maillageBateau, hauteurRepos: 0.2 })

            const maillageTouche = masquer(createCylinder(moteur, { height: 0.3, diameter: 0.44, tessellation: 16 }))
            maillageTouche.material = materiauTouche
            maillageTouche.position.set(mondeX, 0.15, mondeZ)
            addToScene(scene, maillageTouche)
            marqueursTouche[ligne]!.push(maillageTouche)
            cellule.marqueurs.push({ maillage: maillageTouche, hauteurRepos: 0.15 })

            const maillageRate = masquer(createCylinder(moteur, { height: 0.1, diameter: 0.34, tessellation: 16 }))
            maillageRate.material = materiauRate
            maillageRate.position.set(mondeX, 0.05, mondeZ)
            addToScene(scene, maillageRate)
            marqueursRate[ligne]!.push(maillageRate)
            cellule.marqueurs.push({ maillage: maillageRate, hauteurRepos: 0.05 })
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

    const modelesBateaux = new Map<string, {
        racine: SceneNode
        centreX: number
        centreZ: number
        axeLongX: boolean
    }>()
    for (const modele of FLOTTE) {
        const config = CONFIG_MODELES[modele.identifiant]!
        const asset = await loadGltf(moteur, `/modeles/${config.fichier}`)
        const racine = asset.entities[0]!
        racine.scaling.set(
            racine.scaling.x * config.facteur,
            racine.scaling.y * config.facteur,
            racine.scaling.z * config.facteur,
        )
        addToScene(scene, asset)
        const limites = mesurer(racine)
        if (!limites) {
            throw new Error(`Impossible de mesurer le modèle ${config.fichier} : aucune géométrie avec des limites.`)
        }
        const largeurX = limites.max[0] - limites.min[0]
        const largeurZ = limites.max[2] - limites.min[2]
        setSubtreeVisible(racine, false)
        modelesBateaux.set(modele.identifiant, {
            racine,
            centreX: (limites.min[0] + limites.max[0]) / 2,
            centreZ: (limites.min[2] + limites.max[2]) / 2,
            axeLongX: largeurX >= largeurZ,
        })
    }

    // 5. Enregistrement (compile les pipelines GPU) puis démarrage de la boucle de rendu
    await registerScene(scene)
    await startEngine(moteur)

    // Animation des vagues : une fois par image, on recalcule les hauteurs depuis la position de repos
    // (jamais depuis la position précédente : les décalages ne s'accumulent donc pas).
    if (AVEC_VAGUES) {
        onBeforeRender(scene, (deltaMs) => {
            tempsVagues += deltaMs / 1000
            for (const cellule of cellules) {
                const hauteur = hauteurVague(cellule.x, cellule.z, tempsVagues)
                const pente = penteVague(cellule.x, cellule.z, tempsVagues)
                cellule.dalle.position.y = -0.05 + hauteur
                cellule.dalle.rotation.z = pente.x * INCLINAISON_DALLES
                cellule.dalle.rotation.x = -pente.z * INCLINAISON_DALLES
                for (const { maillage, hauteurRepos } of cellule.marqueurs) maillage.position.y = hauteurRepos + hauteur
            }
            if (survolActuel) maillageSurvol.position.y = 0.02 + hauteurVague(survolActuel.x, survolActuel.z, tempsVagues)
            for (const element of apercuActif) {
                element.maillage.position.y = element.hauteurRepos + hauteurVague(element.x, element.z, tempsVagues)
            }
            for (const bateau of bateauxFlottants) {
                bateau.racine.position.y = bateau.hauteurRepos + hauteurVague(bateau.x, bateau.z, tempsVagues)
            }
        })
    }

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
        etatsCases[ligne]![colonne] = etat
        const cleCase = `${colonne},${ligne}`
        const aUnModele = casesAvecModele.has(cleCase)
        setSubtreeVisible(
            marqueursBateau[ligne]![colonne]!,
            !aUnModele && (etat === 'bateau' || etat === 'coule'),
        )
        setSubtreeVisible(marqueursTouche[ligne]![colonne]!, etat === 'touche' || etat === 'coule')
        setSubtreeVisible(marqueursRate[ligne]![colonne]!, etat === 'rate')
    }

    const effacerApercu = () => {
        apercuActif.length = 0
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
        definirBateaux(bateaux) {
            modelesBateaux.forEach(({ racine }) => setSubtreeVisible(racine, false))
            casesAvecModele.clear()
            bateauxFlottants.length = 0
            for (const bateau of bateaux) {
                const modele = modelesBateaux.get(bateau.identifiant)
                if (!modele) continue
                for (let index = 0; index < bateau.longueur; index++) {
                    const colonne = bateau.colonne + (bateau.horizontal ? index : 0)
                    const ligne = bateau.ligne + (bateau.horizontal ? 0 : index)
                    if (colonne >= 0 && colonne < TAILLE_GRILLE && ligne >= 0 && ligne < TAILLE_GRILLE) {
                        casesAvecModele.add(`${colonne},${ligne}`)
                    }
                }
                const { racine, centreX, centreZ, axeLongX } = modele
                const decalage = (bateau.longueur - 1) / 2
                const centre = bateau.horizontal
                    ? caseVersMonde({ colonne: bateau.colonne + decalage, ligne: bateau.ligne })
                    : caseVersMonde({ colonne: bateau.colonne, ligne: bateau.ligne + decalage })
                const rotationBase = bateau.horizontal === axeLongX ? 0 : Math.PI / 2
                const config = CONFIG_MODELES[bateau.identifiant]!
                const inverserSens = config.inverserSens ||
                    (bateau.horizontal && config.inverserSensHorizontal) ||
                    (!bateau.horizontal && config.inverserSensVertical)
                const rotation = rotationBase + (inverserSens ? Math.PI : 0)
                const cosinus = Math.cos(rotation)
                const sinus = Math.sin(rotation)
                const centreModeleX = cosinus * centreX + sinus * centreZ
                const centreModeleZ = -sinus * centreX + cosinus * centreZ
                racine.position.set(
                    centre.x - centreModeleX,
                    config.y,
                    centre.z - centreModeleZ,
                )
                racine.rotation.y = rotation
                racine.rotation.z = 0
                bateauxFlottants.push({ racine, hauteurRepos: config.y, x: centre.x, z: centre.z })
                setSubtreeVisible(racine, true)
            }
            for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
                for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
                    definirEtatCase(colonne, ligne, etatsCases[ligne]![colonne]!)
                }
            }
        },
        definirSurvol(caseGrille) {
            if (!caseGrille) {
                survolActuel = null
                setSubtreeVisible(maillageSurvol, false)
                return
            }
            const { x, z } = caseVersMonde(caseGrille)
            survolActuel = { x, z }
            maillageSurvol.position.set(x, 0.02 + (AVEC_VAGUES ? hauteurVague(x, z, tempsVagues) : 0), z)
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
                maillage.position.set(x, 0.17 + (AVEC_VAGUES ? hauteurVague(x, z, tempsVagues) : 0), z)
                if (AVEC_VAGUES) apercuActif.push({ maillage, x, z, hauteurRepos: 0.17 })
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
