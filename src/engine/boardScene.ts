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
import { casesBateau } from '../game/rules.ts'
import { TAILLE_CASE, caseVersMonde } from './boardGeometry.ts'
import { ecranVersCase } from './cellPicking.ts'
import { hauteurVague } from './vagues.ts'
import { creerEau, creerEffets, type Effets } from './effets.ts'
import { AMBIANCE_DEFAUT } from '../maps/chargeur.ts'
import type { Carte } from '../maps/types.ts'

/** Couleur des cases de placement vues du dessus (RGB, 0 à 1). */
const COULEUR_DALLE: Couleur = [0.07, 0.62, 0.72]
<<<<<<< HEAD
const COULEUR_EAU: Couleur = [0.04, 0.4, 0.52]
=======
>>>>>>> 7e35a9bde77b9e9cd51915efdfdedda515b3f8de
const NIVEAU_EAU = -0.3
/** Fond marin : l'eau est un bloc plein entre ce fond et la surface. */
const FOND_MARIN = -1.4
const EPAISSEUR_LIGNE_GRILLE = 0.018
const HAUTEUR_LIGNE_GRILLE = NIVEAU_EAU + 0.16
const DUREE_NAUFRAGE = 3.5
const DELAI_NAUFRAGE = 0.4
const ENFONCEMENT_NAUFRAGE = 0.35
const ROULIS_NAUFRAGE = 0.42
const TANGAGE_NAUFRAGE = 0.14

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]

const quaternionAxeAngle = (axe: Vec3, angle: number): Quat => {
    const sinus = Math.sin(angle / 2)
    return [axe[0] * sinus, axe[1] * sinus, axe[2] * sinus, Math.cos(angle / 2)]
}

const multiplierQuaternions = (a: Quat, b: Quat): Quat => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]

const tournerVecteur = (q: Quat, v: Vec3): Vec3 => {
    const tx = 2 * (q[1] * v[2] - q[2] * v[1])
    const ty = 2 * (q[2] * v[0] - q[0] * v[2])
    const tz = 2 * (q[0] * v[1] - q[1] * v[0])
    return [
        v[0] + q[3] * tx + (q[1] * tz - q[2] * ty),
        v[1] + q[3] * ty + (q[2] * tx - q[0] * tz),
        v[2] + q[3] * tz + (q[0] * ty - q[1] * tx),
    ]
}

export interface OptionsSceneGrille {
    /** 'inclinee' : vue en perspective inclinée (les grilles de jeu). 'dessus' : vue de dessus (placement). */
    vue: 'inclinee' | 'dessus',
    couleurCase: Couleur | null,
    couleurFondMarin: Couleur | null,
    /** Carte choisie : ambiance (mer, ciel, lumière) et décors. Sans carte : ambiance par défaut. */
    carte?: Carte | null
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

    const ambiance = options.carte?.ambiance ?? AMBIANCE_DEFAUT

    // 1. Moteur et scène
    const moteur: EngineContext = await createEngine(toile)
    const scene = createSceneContext(moteur)
<<<<<<< HEAD
    scene.clearColor = { r: 0.12, g: 0.36, b: 0.52, a: 1 }
=======
    scene.clearColor = { r: ambiance.ciel[0], g: ambiance.ciel[1], b: ambiance.ciel[2], a: 1 }
>>>>>>> 7e35a9bde77b9e9cd51915efdfdedda515b3f8de

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
        // Ciel : lumière d'ambiance douce, plus claire en haut qu'en bas, sans reflet.
<<<<<<< HEAD
        const ciel = createHemisphericLight([0, 1, 0], 0.85)
        ciel.diffuseColor = [0.78, 0.9, 1]
        ciel.groundColor = [0.32, 0.5, 0.58]
=======
        const ciel = createHemisphericLight([0, 1, 0], ambiance.lumiereCiel.intensite)
        ciel.diffuseColor = ambiance.lumiereCiel.couleur
        ciel.groundColor = ambiance.eau.map((composante) => 0.3 + composante * 0.4) as Couleur
>>>>>>> 7e35a9bde77b9e9cd51915efdfdedda515b3f8de
        ciel.specularColor = [0, 0, 0]
        addToScene(scene, ciel)
        // Soleil : haut dans le ciel, derrière la caméra (la lumière avance vers +z, comme le regard).
        // Les reflets partent donc loin de la caméra : ni éblouissement ni « pluie » de points brillants.
<<<<<<< HEAD
        const soleil = createDirectionalLight([0.35, -0.85, 0.5], 0.85)
        soleil.diffuse = [1, 0.93, 0.76]
=======
        const soleil = createDirectionalLight(ambiance.soleil.direction, ambiance.soleil.intensite)
        soleil.diffuse = ambiance.soleil.couleur
>>>>>>> 7e35a9bde77b9e9cd51915efdfdedda515b3f8de
        soleil.specular = [0.12, 0.1, 0.07]
        addToScene(scene, soleil)
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
    fondMarin.position.set(0, options.vue === 'inclinee' ? FOND_MARIN : -0.12, 0)
    addToScene(scene, fondMarin)

    const materiauDalle = materiauColore(COULEUR_DALLE)
    if (options.vue === 'dessus') {
        materiauDalle.emissiveColor = [0.1, 0.1, 0.2]
    }

    let effets: Effets | null = null
    if (options.vue === 'inclinee') {
        creerEau(moteur, scene, { taille: TAILLE_GRILLE + 4, couleur: ambiance.eau, niveau: NIVEAU_EAU, fond: FOND_MARIN })
        effets = await creerEffets(moteur, scene)

        const materiauQuadrillage = materiauColore([0.02, 0.18, 0.24], [0.12, 0.8, 1])
        materiauQuadrillage.specularColor = [0.3, 0.8, 1]
        const largeurGrille = TAILLE_GRILLE * TAILLE_CASE
        for (let index = 0; index <= TAILLE_GRILLE; index++) {
            const position = -largeurGrille / 2 + index * TAILLE_CASE
            const ligneVerticale = createBox(moteur, {
                width: EPAISSEUR_LIGNE_GRILLE,
                height: EPAISSEUR_LIGNE_GRILLE,
                depth: largeurGrille,
            })
            ligneVerticale.material = materiauQuadrillage
            ligneVerticale.position.set(position, HAUTEUR_LIGNE_GRILLE, 0)
            addToScene(scene, ligneVerticale)

            const ligneHorizontale = createBox(moteur, {
                width: largeurGrille,
                height: EPAISSEUR_LIGNE_GRILLE,
                depth: EPAISSEUR_LIGNE_GRILLE,
            })
            ligneHorizontale.material = materiauQuadrillage
            ligneHorizontale.position.set(0, HAUTEUR_LIGNE_GRILLE, position)
            addToScene(scene, ligneHorizontale)
        }
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
    const bateauxFlottants: { identifiant: string, racine: SceneNode, hauteurRepos: number, x: number, z: number }[] = []
  
    // Décors de la carte (îles, rochers, bouées, modèles 3D) : posés sur la mer, ils suivent les vagues.
    const decorsFlottants: { racine: SceneNode, x: number, z: number, reposY: number }[] = []
    if (options.vue === 'inclinee' && options.carte) {
        const sable = materiauColore([0.86, 0.76, 0.52])
        const vegetation = materiauColore([0.2, 0.52, 0.26])
        const roche = materiauColore([0.4, 0.42, 0.46])
        const rouge = materiauColore([0.85, 0.2, 0.15], [0.2, 0.03, 0.02])
        const blanc = materiauColore([0.95, 0.95, 0.92], [0.15, 0.15, 0.15])
        const poser = (maillage: Mesh, x: number, y: number, z: number): Mesh => {
            maillage.position.set(x, y, z)
            addToScene(scene, maillage)
            return maillage
        }
        for (const decor of options.carte.decors) {
            const e = decor.echelle
            const base = NIVEAU_EAU
            if (decor.type === 'ile') {
                const socle = poser(createCylinder(moteur, { height: 0.5 * e, diameterBottom: 1.5 * e, diameterTop: 0.95 * e, tessellation: 20 }), decor.x, base + 0.05 * e, decor.z)
                socle.material = sable
                const dome = poser(createSphere(moteur, { diameterX: 0.8 * e, diameterY: 0.5 * e, diameterZ: 0.8 * e, segments: 12 }), decor.x, base + 0.38 * e, decor.z)
                dome.material = vegetation
                decorsFlottants.push({ racine: socle, x: decor.x, z: decor.z, reposY: base + 0.05 * e }, { racine: dome, x: decor.x, z: decor.z, reposY: base + 0.38 * e })
            } else if (decor.type === 'rocher') {
                const rocher = poser(createSphere(moteur, { diameterX: 1.1 * e, diameterY: 0.7 * e, diameterZ: 0.9 * e, segments: 8 }), decor.x, base + 0.08 * e, decor.z)
                rocher.material = roche
                decorsFlottants.push({ racine: rocher, x: decor.x, z: decor.z, reposY: base + 0.08 * e })
            } else if (decor.type === 'bouee') {
                const corps = poser(createCylinder(moteur, { height: 0.5 * e, diameterBottom: 0.36 * e, diameterTop: 0.2 * e, tessellation: 12 }), decor.x, base + 0.15 * e, decor.z)
                corps.material = rouge
                const tete = poser(createSphere(moteur, { diameter: 0.2 * e, segments: 8 }), decor.x, base + 0.45 * e, decor.z)
                tete.material = blanc
                decorsFlottants.push({ racine: corps, x: decor.x, z: decor.z, reposY: base + 0.15 * e }, { racine: tete, x: decor.x, z: decor.z, reposY: base + 0.45 * e })
            } else {
                try {
                    const asset = await loadGltf(moteur, `${options.carte.base}${decor.fichier}`)
                    const racine = asset.entities[0]
                    if (!racine) continue
                    racine.scaling.set(racine.scaling.x * e, racine.scaling.y * e, racine.scaling.z * e)
                    racine.rotation.y = decor.rotation
                    addToScene(scene, asset)
                    racine.position.set(decor.x, decor.y, decor.z)
                    decorsFlottants.push({ racine, x: decor.x, z: decor.z, reposY: decor.y })
                } catch (erreur) {
                    // Un modèle de décor manquant ne doit pas empêcher de jouer.
                    console.warn(`[cartes] décor ${decor.fichier} : chargement impossible`, erreur)
                }
            }
        }
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
            if (options.vue === 'inclinee') setSubtreeVisible(dalle, false)
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
        centreY: number
        centreZ: number
        axeLongX: boolean
        /** Orientation du modèle juste après chargement : point de départ de chaque pose. */
        quaternionInitial: Quat
    }>()
    for (const modele of FLOTTE) {
        const config = CONFIG_MODELES[modele.identifiant]!
        const asset = await loadGltf(moteur, `${import.meta.env.BASE_URL}modeles/${config.fichier}`)
        const racine = asset.entities[0]
        if (!racine) throw new Error(`Le modèle ${config.fichier} ne contient aucune scène.`)
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
            centreY: (limites.min[1] + limites.max[1]) / 2,
            centreZ: (limites.min[2] + limites.max[2]) / 2,
            axeLongX: largeurX >= largeurZ,
            quaternionInitial: [
                racine.rotationQuaternion.x,
                racine.rotationQuaternion.y,
                racine.rotationQuaternion.z,
                racine.rotationQuaternion.w,
            ],
        })
    }

    interface BateauPose {
        bateau: Bateau
        racine: SceneNode
        cases: CoordCase[]
        position: Vec3
        pivot: Vec3
        quaternionBase: Quat
        /** Emplacement du bateau : sert à savoir s'il a changé entre deux appels de definirBateaux. */
        signature: string
    }
    const bateauxPoses = new Map<string, BateauPose>()
    const naufrages = new Map<string, { demarre: boolean, temps: number }>()
    const impactsEnAttente = new Set<string>()
    let initialise = false

    const avancementNaufrage = (identifiant: string): number => {
        const naufrage = naufrages.get(identifiant)
        if (!naufrage) return 0
        const lineaire = Math.min(1, naufrage.temps / DUREE_NAUFRAGE)
        return lineaire * lineaire * (3 - 2 * lineaire)
    }

    const poserBateau = (identifiant: string, vague = 0) => {
        const pose = bateauxPoses.get(identifiant)
        if (!pose) return
        const avancement = avancementNaufrage(identifiant)
        if (avancement <= 0) {
            pose.racine.rotationQuaternion.set(...pose.quaternionBase)
            pose.racine.position.set(pose.position[0], pose.position[1] + vague, pose.position[2])
            return
        }
        const axeLong: Vec3 = pose.bateau.horizontal ? [1, 0, 0] : [0, 0, 1]
        const axeLarge: Vec3 = pose.bateau.horizontal ? [0, 0, 1] : [1, 0, 0]
        const inclinaison = multiplierQuaternions(
            quaternionAxeAngle(axeLong, ROULIS_NAUFRAGE * avancement),
            quaternionAxeAngle(axeLarge, TANGAGE_NAUFRAGE * avancement),
        )
        pose.racine.rotationQuaternion.set(...multiplierQuaternions(inclinaison, pose.quaternionBase))
        const decalage = tournerVecteur(inclinaison, [
            pose.position[0] - pose.pivot[0],
            pose.position[1] - pose.pivot[1],
            pose.position[2] - pose.pivot[2],
        ])
        pose.racine.position.set(
            pose.pivot[0] + decalage[0],
            pose.pivot[1] + vague + decalage[1] - ENFONCEMENT_NAUFRAGE * avancement,
            pose.pivot[2] + decalage[2],
        )
    }

    const actualiserBateaux = () => {
        bateauxPoses.forEach((pose, identifiant) => {
            const enAttente = pose.cases.some(({ colonne, ligne }) => impactsEnAttente.has(`${colonne},${ligne}`))
            setSubtreeVisible(pose.racine, !enAttente)
            const toutesCoulees = pose.cases.every(({ colonne, ligne }) => etatsCases[ligne]?.[colonne] === 'coule')
            if (!effets || enAttente || !toutesCoulees || naufrages.has(identifiant)) return
            const naufrage = { demarre: false, temps: 0 }
            naufrages.set(identifiant, naufrage)
            effets.planifier(DELAI_NAUFRAGE, () => { naufrage.demarre = true })
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
                cellule.dalle.position.y = -0.05 + hauteur
                for (const { maillage, hauteurRepos } of cellule.marqueurs) maillage.position.y = hauteurRepos + hauteur
            }
            if (survolActuel) maillageSurvol.position.y = 0.02 + hauteurVague(survolActuel.x, survolActuel.z, tempsVagues)
            for (const element of apercuActif) {
                element.maillage.position.y = element.hauteurRepos + hauteurVague(element.x, element.z, tempsVagues)
            }
            for (const decor of decorsFlottants) {
                decor.racine.position.y = decor.reposY + hauteurVague(decor.x, decor.z, tempsVagues)
            }
            for (const bateau of bateauxFlottants) {
                poserBateau(bateau.identifiant, hauteurVague(bateau.x, bateau.z, tempsVagues))
            }
            naufrages.forEach((naufrage, identifiant) => {
                if (!naufrage.demarre || naufrage.temps >= DUREE_NAUFRAGE) return
                naufrage.temps = Math.min(DUREE_NAUFRAGE, naufrage.temps + Math.min(deltaMs, 50) / 1000)
                const bateau = bateauxFlottants.find((pose) => pose.identifiant === identifiant)
                if (bateau) poserBateau(identifiant, hauteurVague(bateau.x, bateau.z, tempsVagues))
            })
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
    const appliquerMarques = (colonne: number, ligne: number) => {
        const etat = etatsCases[ligne]![colonne]!
        if (effets) {
            effets.definirEcume(colonne, ligne, etat === 'rate')
            effets.definirFeu(colonne, ligne, etat === 'touche' || etat === 'coule')
            effets.definirTraceBrulure(colonne, ligne, etat === 'touche' || etat === 'coule')
        } else {
            setSubtreeVisible(marqueursTouche[ligne]![colonne]!, etat === 'touche' || etat === 'coule')
            setSubtreeVisible(marqueursRate[ligne]![colonne]!, etat === 'rate')
        }
    }

    const definirEtatCase = (colonne: number, ligne: number, etat: EtatCase) => {
        const avant = etatsCases[ligne]![colonne]!
        etatsCases[ligne]![colonne] = etat
        const cleCase = `${colonne},${ligne}`
        const aUnModele = casesAvecModele.has(cleCase)
        setSubtreeVisible(
            marqueursBateau[ligne]![colonne]!,
            !aUnModele && (etat === 'bateau' || etat === 'coule'),
        )

        const nouveauTir = (avant === 'eau' || avant === 'bateau') &&
            (etat === 'rate' || etat === 'touche' || etat === 'coule')
        if (effets && initialise && nouveauTir) {
            impactsEnAttente.add(cleCase)
            effets.tirer(colonne, ligne, etat === 'rate' ? 'rate' : etat === 'coule' ? 'coule' : 'touche', () => {
                impactsEnAttente.delete(cleCase)
                appliquerMarques(colonne, ligne)
                actualiserBateaux()
            })
            actualiserBateaux()
            return
        }
        if (impactsEnAttente.has(cleCase)) return
        appliquerMarques(colonne, ligne)
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
            initialise = true
            actualiserBateaux()
        },
        definirBateaux(bateaux) {
            modelesBateaux.forEach(({ racine }) => setSubtreeVisible(racine, false))
            casesAvecModele.clear()
            bateauxFlottants.length = 0
            const anciennesPoses = new Map(bateauxPoses)
            bateauxPoses.clear()
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
                const { racine, centreX, centreY, centreZ, axeLongX, quaternionInitial } = modele
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
                // On repart TOUJOURS de l'orientation d'origine du modèle. Sans cela, `rotation.y = …` décompose
                // l'orientation précédente en angles d'Euler : au-delà de 90° la décomposition bascule (x et z
                // valent π) et le bateau se retrouvait retourné à chaque nouveau bateau posé.
                racine.rotationQuaternion.set(...quaternionInitial)
                racine.rotation.y = rotation
                racine.rotation.z = 0
                const quaternion = racine.rotationQuaternion
                bateauxFlottants.push({ identifiant: bateau.identifiant, racine, hauteurRepos: config.y, x: centre.x, z: centre.z })
                bateauxPoses.set(bateau.identifiant, {
                    bateau,
                    racine,
                    cases: casesBateau(bateau),
                    position: [centre.x - centreModeleX, config.y, centre.z - centreModeleZ],
                    pivot: [centre.x, config.y + centreY, centre.z],
                    quaternionBase: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
                    signature: `${bateau.colonne},${bateau.ligne},${bateau.horizontal},${bateau.longueur}`,
                })
                poserBateau(bateau.identifiant)
            }
            // Un naufrage déjà joué est conservé tant que le bateau n'a pas bougé : sinon, à chaque nouveau
            // bateau coulé, les précédents remonteraient puis couleraient une seconde fois.
            naufrages.forEach((_, identifiant) => {
                const pose = bateauxPoses.get(identifiant)
                if (!pose || pose.signature !== anciennesPoses.get(identifiant)?.signature) naufrages.delete(identifiant)
            })
            for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
                for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
                    definirEtatCase(colonne, ligne, etatsCases[ligne]![colonne]!)
                }
            }
            actualiserBateaux()
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
