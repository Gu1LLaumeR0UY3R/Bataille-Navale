// Effets visuels de la grille 3D : eau animée, boulet, explosion, onde de choc, écume, feu et fumée.
// Comme boardScene.ts, ce module ne sait pas ce qu'est Vue. Il ne connaît pas non plus les règles du jeu :
// boardScene.ts lui dit quoi jouer et quand.
//
// Contraintes de BabylonLite respectées ici :
// - tout est créé et ajouté à la scène AVANT registerScene (les effets réutilisent des objets déjà créés) ;
// - un matériau dont on change l'opacité en cours de partie démarre avec alpha < 1 (sinon il est rendu
//   comme opaque) et passe par enableMaterialTracking, qui prévient le moteur à chaque modification.

import {
    addToScene,
    createBox,
    createCylinder,
    createMeshFromData,
    createSphere,
    createStandardMaterial,
    createTorus,
    createTransformNode,
    enableMaterialTracking,
    onBeforeRender,
    setSubtreeVisible,
    updateMeshNormals,
    updateMeshPositions,
    type EngineContext,
    type Mesh,
    type SceneContext,
    type StandardMaterialProps,
} from '@babylonjs/lite'
import { TAILLE_GRILLE, type Couleur } from '../game/types.ts'
import { TAILLE_CASE, caseVersMonde } from './boardGeometry.ts'

export type ResultatImpact = 'rate' | 'touche' | 'coule'

export interface Effets {
    /** Lance un boulet vers la case. `surImpact` est appelé quand il touche (l'état définitif de la case s'affiche alors). */
    tirer(colonne: number, ligne: number, resultat: ResultatImpact, surImpact: () => void): void
    definirFeu(colonne: number, ligne: number, actif: boolean): void
    definirEcume(colonne: number, ligne: number, actif: boolean): void
    definirTraceBrulure(colonne: number, ligne: number, actif: boolean): void
    /** Exécute `action` dans `delai` secondes (temps de l'animation, pas du jeu). */
    planifier(delai: number, action: () => void): void
    /** Durée totale entre le départ du boulet et son impact, en secondes. */
    readonly dureeVol: number
}

type Vec3 = [number, number, number]

const DUREE_VOL = 0.6
const DUREE_EXPLOSION = 1
const DUREE_ONDE = 1.3
const NOMBRE_BOULETS = 3
const NOMBRE_EXPLOSIONS = 3
const NOMBRE_ONDES = 4
/** Un bateau a au plus 5 cases, la flotte 17 : on garde un peu de marge. */
const NOMBRE_FEUX = TAILLE_GRILLE * 2
const BOUFFEES_PAR_FEU = 3
const HAUTEUR_FEU = 0.32

const borner = (valeur: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, valeur))
const hasard = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum)
const melange = (depart: number, arrivee: number, avancement: number) => depart + (arrivee - depart) * avancement

async function creerMateriau(couleur: Couleur, emission: Couleur, alpha = 1, anime = false): Promise<StandardMaterialProps> {
    const materiau = createStandardMaterial()
    materiau.diffuseColor = couleur
    materiau.emissiveColor = emission
    materiau.specularColor = [0, 0, 0]
    materiau.alpha = alpha
    if (anime) await enableMaterialTracking(materiau)
    return materiau
}

function ajouter(scene: SceneContext, maillage: Mesh, materiau: StandardMaterialProps): Mesh {
    maillage.material = materiau
    setSubtreeVisible(maillage, false)
    addToScene(scene, maillage)
    return maillage
}

const montrer = (maillage: Mesh, visible: boolean) => setSubtreeVisible(maillage, visible)

// ---------------------------------------------------------------------------------------------
// Eau : un plan sous la grille dont la hauteur suit une somme de sinusoïdes.
// ---------------------------------------------------------------------------------------------

export interface OptionsEau {
    /** Largeur et profondeur du plan, en unités du monde. */
    taille: number
    couleur: Couleur
    /** Hauteur moyenne de l'eau. */
    niveau: number
    /** Hauteur du fond : l'eau forme un bloc plein entre le fond et la surface. */
    fond: number
}

const SUBDIVISIONS_EAU = 40
const AMPLITUDE_EAU = 1

/** Hauteur de la surface (et pente) au point (x, z), à l'instant `temps`, relativement au niveau moyen. */
function surfaceEau(x: number, z: number, temps: number) {
    // Trois sinusoïdes de directions et de vitesses différentes : la surface ne se répète pas à l'œil.
    const phaseA = 1.6 * x + 1.1 * temps
    const phaseB = 1.2 * z - 0.9 * temps
    const phaseC = 2.4 * (x + z) + 1.7 * temps
    return {
        hauteur: (0.05 * Math.sin(phaseA) + 0.04 * Math.sin(phaseB) + 0.025 * Math.sin(phaseC)) * AMPLITUDE_EAU,
        penteX: 0.05 * 1.6 * Math.cos(phaseA) + 0.025 * 2.4 * Math.cos(phaseC),
        penteZ: 0.04 * 1.2 * Math.cos(phaseB) + 0.025 * 2.4 * Math.cos(phaseC),
    }
}

/** Part de la profondeur occupée par la tranche claire (près de la surface) des parois. */
const PART_TRANCHE_CLAIRE = 0.4

function materiauEau(couleur: Couleur, luminosite: number, emission: number, brillant: boolean) {
    const materiau = createStandardMaterial()
    materiau.diffuseColor = [couleur[0] * luminosite, couleur[1] * luminosite, couleur[2] * luminosite]
    materiau.emissiveColor = [couleur[0] * emission, couleur[1] * emission, couleur[2] * emission]
    materiau.specularColor = brillant ? [0.1, 0.16, 0.18] : [0.02, 0.04, 0.05]
    materiau.specularPower = 24
    materiau.backFaceCulling = false
    return materiau
}

export function creerEau(moteur: EngineContext, scene: SceneContext, options: OptionsEau): void {
    const colonnes = SUBDIVISIONS_EAU + 1
    const nombreSommets = colonnes * colonnes
    const positions = new Float32Array(nombreSommets * 3)
    const normales = new Float32Array(nombreSommets * 3)
    const uvs = new Float32Array(nombreSommets * 2)
    const indices = new Uint32Array(SUBDIVISIONS_EAU * SUBDIVISIONS_EAU * 6)

    // Même disposition que createGround : la ligne 0 est en haut de l'écran (z maximal).
    for (let rangee = 0; rangee < colonnes; rangee++) {
        for (let colonne = 0; colonne < colonnes; colonne++) {
            const sommet = rangee * colonnes + colonne
            positions[sommet * 3] = -options.taille / 2 + (colonne / SUBDIVISIONS_EAU) * options.taille
            positions[sommet * 3 + 2] = -options.taille / 2 + (1 - rangee / SUBDIVISIONS_EAU) * options.taille
            uvs[sommet * 2] = colonne / SUBDIVISIONS_EAU
            uvs[sommet * 2 + 1] = 1 - rangee / SUBDIVISIONS_EAU
        }
    }
    let indice = 0
    for (let rangee = 0; rangee < SUBDIVISIONS_EAU; rangee++) {
        for (let colonne = 0; colonne < SUBDIVISIONS_EAU; colonne++) {
            const hautGauche = rangee * colonnes + colonne
            const hautDroite = hautGauche + 1
            const basGauche = (rangee + 1) * colonnes + colonne
            const basDroite = basGauche + 1
            indices[indice++] = basDroite
            indices[indice++] = hautDroite
            indices[indice++] = hautGauche
            indices[indice++] = basGauche
            indices[indice++] = basDroite
            indices[indice++] = hautGauche
        }
    }

    // Parois du bloc d'eau : quatre rubans verticaux le long des bords. Leur arête haute reprend
    // exactement les sommets de bord de la surface, donc elle monte et descend avec elle.
    const demi = options.taille / 2
    const profondeurTotale = options.niveau - options.fond
    const basTranche = options.niveau - profondeurTotale * PART_TRANCHE_CLAIRE
    const cotes = [
        { point: (k: number): [number, number] => [-demi + (k / SUBDIVISIONS_EAU) * options.taille, -demi], normale: [0, -1] },
        { point: (k: number): [number, number] => [demi, -demi + (k / SUBDIVISIONS_EAU) * options.taille], normale: [1, 0] },
        { point: (k: number): [number, number] => [demi - (k / SUBDIVISIONS_EAU) * options.taille, demi], normale: [0, 1] },
        { point: (k: number): [number, number] => [-demi, demi - (k / SUBDIVISIONS_EAU) * options.taille], normale: [-1, 0] },
    ] as const
    const sommetsParCote = colonnes * 2
    const positionsParois = new Float32Array(cotes.length * sommetsParCote * 3)
    const normalesParois = new Float32Array(cotes.length * sommetsParCote * 3)
    const uvsParois = new Float32Array(cotes.length * sommetsParCote * 2)
    const indicesParois = new Uint32Array(cotes.length * SUBDIVISIONS_EAU * 6)
    let indiceParoi = 0
    cotes.forEach((cote, numero) => {
        const base = numero * sommetsParCote
        for (let k = 0; k < colonnes; k++) {
            const [x, z] = cote.point(k)
            // Sommet haut (animé) puis sommet bas (fixe, en bas de la tranche claire).
            for (let bord = 0; bord < 2; bord++) {
                const sommet = base + k * 2 + bord
                positionsParois[sommet * 3] = x
                positionsParois[sommet * 3 + 1] = bord === 0 ? options.niveau : basTranche
                positionsParois[sommet * 3 + 2] = z
                normalesParois[sommet * 3] = cote.normale[0]
                normalesParois[sommet * 3 + 2] = cote.normale[1]
                uvsParois[sommet * 2] = k / SUBDIVISIONS_EAU
                uvsParois[sommet * 2 + 1] = bord
            }
        }
        for (let k = 0; k < SUBDIVISIONS_EAU; k++) {
            const hautA = base + k * 2
            const basA = hautA + 1
            const hautB = hautA + 2
            const basB = hautA + 3
            indicesParois[indiceParoi++] = hautA
            indicesParois[indiceParoi++] = basA
            indicesParois[indiceParoi++] = hautB
            indicesParois[indiceParoi++] = hautB
            indicesParois[indiceParoi++] = basA
            indicesParois[indiceParoi++] = basB
        }
    })

    let temps = 0
    const calculer = () => {
        for (let sommet = 0; sommet < nombreSommets; sommet++) {
            const x = positions[sommet * 3]!
            const z = positions[sommet * 3 + 2]!
            const { hauteur, penteX, penteZ } = surfaceEau(x, z, temps)
            positions[sommet * 3 + 1] = options.niveau + hauteur
            // Normale = (-dh/dx, 1, -dh/dz), normalisée.
            const longueur = Math.hypot(penteX, 1, penteZ)
            normales[sommet * 3] = -penteX / longueur
            normales[sommet * 3 + 1] = 1 / longueur
            normales[sommet * 3 + 2] = -penteZ / longueur
        }
        for (let sommet = 0; sommet < cotes.length * colonnes; sommet++) {
            const indiceHaut = sommet * 2
            positionsParois[indiceHaut * 3 + 1] = options.niveau +
                surfaceEau(positionsParois[indiceHaut * 3]!, positionsParois[indiceHaut * 3 + 2]!, temps).hauteur
        }
    }
    calculer()

    // Surface
    const eau = createMeshFromData(moteur, 'eau_profonde', positions, normales, indices, uvs)
    eau.material = materiauEau(options.couleur, 1, 0.25, true)
    addToScene(scene, eau)

    // Tranche claire des parois (animée) : l'épaisseur de l'eau vue de côté
    const parois = createMeshFromData(moteur, 'eau_parois', positionsParois, normalesParois, indicesParois, uvsParois)
    parois.material = materiauEau(options.couleur, 0.85, 0.3, false)
    addToScene(scene, parois)

    // Eau profonde : un bloc plein, plus sombre, jusqu'au fond. Son dessus est sous la surface, donc invisible d'en haut.
    const profond = createBox(moteur, {
        width: options.taille,
        height: basTranche - options.fond,
        depth: options.taille,
    })
    profond.material = materiauEau(options.couleur, 0.5, 0.1, false)
    profond.position.set(0, (basTranche + options.fond) / 2, 0)
    addToScene(scene, profond)

    onBeforeRender(scene, (deltaMs) => {
        temps += Math.min(deltaMs, 50) / 1000
        calculer()
        updateMeshPositions(moteur, eau, positions)
        updateMeshNormals(moteur, eau, normales)
        updateMeshPositions(moteur, parois, positionsParois)
    })
}

// ---------------------------------------------------------------------------------------------
// Effets de tir
// ---------------------------------------------------------------------------------------------

interface Boulet {
    maillage: Mesh
    actif: boolean
    age: number
    depart: Vec3
    cible: Vec3
    resultat: ResultatImpact
    surImpact: () => void
}

interface Explosion {
    actif: boolean
    age: number
    x: number
    z: number
    echelle: number
    boule: Mesh
    materiauBoule: StandardMaterialProps
    noyau: Mesh
    materiauNoyau: StandardMaterialProps
    debris: Mesh[]
    vitesses: Vec3[]
}

interface Anneau {
    delai: number
    intensite: number
    vague: Mesh
    materiauVague: StandardMaterialProps
    ecume: Mesh
    materiauEcume: StandardMaterialProps
}

interface Onde {
    actif: boolean
    age: number
    x: number
    z: number
    anneaux: Anneau[]
    jet: Mesh
    materiauJet: StandardMaterialProps
    gouttes: Mesh[]
    vitesses: Vec3[]
}

interface Bouffee {
    maillage: Mesh
    materiau: StandardMaterialProps
    decalage: number
}

interface Feu {
    actif: boolean
    cle: string
    x: number
    z: number
    phase: number
    flammeExterieure: Mesh
    flammeInterieure: Mesh
    bouffees: Bouffee[]
}

interface Tache {
    reste: number
    action: () => void
}

export async function creerEffets(moteur: EngineContext, scene: SceneContext): Promise<Effets> {
    let temps = 0
    const taches: Tache[] = []

    // --- Boulets -------------------------------------------------------------------------------
    const materielBoulet = await creerMateriau([0.1, 0.1, 0.12], [0.04, 0.04, 0.05])
    const boulets: Boulet[] = Array.from({ length: NOMBRE_BOULETS }, () => ({
        maillage: ajouter(scene, createSphere(moteur, { diameter: 0.22, segments: 10 }), materielBoulet),
        actif: false,
        age: 0,
        depart: [0, 0, 0],
        cible: [0, 0, 0],
        resultat: 'rate',
        surImpact: () => {},
    }))

    // --- Explosions ----------------------------------------------------------------------------
    const materielDebris = await creerMateriau([0.12, 0.1, 0.09], [0.15, 0.05, 0.0])
    const explosions: Explosion[] = []
    for (let index = 0; index < NOMBRE_EXPLOSIONS; index++) {
        const materiauBoule = await creerMateriau([1, 0.45, 0.05], [1, 0.38, 0.04], 0.9, true)
        const materiauNoyau = await creerMateriau([1, 0.95, 0.6], [1, 0.9, 0.5], 0.95, true)
        explosions.push({
            actif: false,
            age: 0,
            x: 0,
            z: 0,
            echelle: 1,
            boule: ajouter(scene, createSphere(moteur, { diameter: 1, segments: 12 }), materiauBoule),
            materiauBoule,
            noyau: ajouter(scene, createSphere(moteur, { diameter: 1, segments: 10 }), materiauNoyau),
            materiauNoyau,
            debris: Array.from({ length: 7 }, () => ajouter(scene, createSphere(moteur, { diameter: 0.09, segments: 5 }), materielDebris)),
            vitesses: Array.from({ length: 7 }, () => [0, 0, 0] as Vec3),
        })
    }

    // --- Ondes de choc (tir raté) --------------------------------------------------------------
    const materielGoutte = await creerMateriau([0.85, 0.95, 1], [0.35, 0.45, 0.5])
    const ondes: Onde[] = []
    for (let index = 0; index < NOMBRE_ONDES; index++) {
        const anneaux: Anneau[] = []
        for (const [delai, intensite] of [[0, 1], [0.22, 0.65]] as const) {
            const materiauVague = await creerMateriau([0.2, 0.75, 0.85], [0.08, 0.3, 0.38], 0.5, true)
            const materiauEcume = await creerMateriau([1, 1, 1], [0.55, 0.6, 0.62], 0.85, true)
            anneaux.push({
                delai,
                intensite,
                vague: ajouter(scene, createTorus(moteur, { diameter: 1, thickness: 0.14, tessellation: 40 }), materiauVague),
                materiauVague,
                ecume: ajouter(scene, createTorus(moteur, { diameter: 1, thickness: 0.05, tessellation: 40 }), materiauEcume),
                materiauEcume,
            })
        }
        const materiauJet = await creerMateriau([0.8, 0.93, 1], [0.35, 0.5, 0.55], 0.8, true)
        ondes.push({
            actif: false,
            age: 0,
            x: 0,
            z: 0,
            anneaux,
            jet: ajouter(scene, createCylinder(moteur, { height: 1, diameterBottom: 0.3, diameterTop: 0.06, tessellation: 12 }), materiauJet),
            materiauJet,
            gouttes: Array.from({ length: 6 }, () => ajouter(scene, createSphere(moteur, { diameter: 0.07, segments: 5 }), materielGoutte)),
            vitesses: Array.from({ length: 6 }, () => [0, 0, 0] as Vec3),
        })
    }

    // --- Feu et fumée (un emplacement par case en feu) -----------------------------------------
    const materielFlammeExterieure = await creerMateriau([1, 0.4, 0.05], [1, 0.35, 0.04], 0.88)
    const materielFlammeInterieure = await creerMateriau([1, 0.9, 0.35], [1, 0.8, 0.25], 0.92)
    const feux: Feu[] = []
    const feuxParCase = new Map<string, Feu>()
    for (let index = 0; index < NOMBRE_FEUX; index++) {
        const bouffees: Bouffee[] = []
        for (let numero = 0; numero < BOUFFEES_PAR_FEU; numero++) {
            const materiau = await creerMateriau([0.16, 0.16, 0.18], [0.02, 0.02, 0.025], 0.5, true)
            bouffees.push({
                maillage: ajouter(scene, createSphere(moteur, { diameter: 1, segments: 8 }), materiau),
                materiau,
                decalage: numero / BOUFFEES_PAR_FEU,
            })
        }
        feux.push({
            actif: false,
            cle: '',
            x: 0,
            z: 0,
            phase: hasard(0, Math.PI * 2),
            flammeExterieure: ajouter(scene, createCylinder(moteur, { height: 0.55, diameterBottom: 0.36, diameterTop: 0, tessellation: 10 }), materielFlammeExterieure),
            flammeInterieure: ajouter(scene, createCylinder(moteur, { height: 0.38, diameterBottom: 0.2, diameterTop: 0, tessellation: 8 }), materielFlammeInterieure),
            bouffees,
        })
    }

    // --- Marques permanentes par case : écume (tir raté) et trace de brûlure (tir touché) ------
    const materielEcume = await creerMateriau([0.95, 0.98, 1], [0.5, 0.55, 0.58], 0.92)
    const materielMousse = await creerMateriau([0.7, 0.9, 0.95], [0.2, 0.3, 0.33], 0.4)
    const materielBrulure = await creerMateriau([0.06, 0.05, 0.05], [0.1, 0.03, 0.0])
    const ecumes: ReturnType<typeof createTransformNode>[][] = []
    const brulures: Mesh[][] = []
    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        ecumes.push([])
        brulures.push([])
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
            const { x, z } = caseVersMonde({ colonne, ligne })

            const groupe = createTransformNode(`ecume_${colonne}_${ligne}`, x, 0, z)
            const anneauExterieur = createTorus(moteur, { diameter: 0.66, thickness: 0.07, tessellation: 24 })
            anneauExterieur.material = materielEcume
            anneauExterieur.position.set(0, 0.03, 0)
            const anneauInterieur = createTorus(moteur, { diameter: 0.34, thickness: 0.05, tessellation: 20 })
            anneauInterieur.material = materielEcume
            anneauInterieur.position.set(0.04, 0.03, -0.03)
            const nappe = createCylinder(moteur, { height: 0.012, diameter: 0.62, tessellation: 24 })
            nappe.material = materielMousse
            nappe.position.set(0, 0.012, 0)
            groupe.children.push(anneauExterieur, anneauInterieur, nappe)
            addToScene(scene, groupe)
            setSubtreeVisible(groupe, false)
            ecumes[ligne]!.push(groupe)

            const brulure = ajouter(scene, createCylinder(moteur, { height: 0.02, diameter: 0.64, tessellation: 20 }), materielBrulure)
            brulure.position.set(x, 0.02, z)
            brulures[ligne]!.push(brulure)
        }
    }

    // --- Mise en route des effets --------------------------------------------------------------
    const lancerExplosion = (x: number, z: number, echelle: number) => {
        const explosion = explosions.find((candidate) => !candidate.actif) ?? explosions[0]!
        explosion.actif = true
        explosion.age = 0
        explosion.x = x
        explosion.z = z
        explosion.echelle = echelle
        explosion.vitesses.forEach((vitesse) => {
            const angle = hasard(0, Math.PI * 2)
            const vitesseHorizontale = hasard(0.8, 1.9) * echelle
            vitesse[0] = Math.cos(angle) * vitesseHorizontale
            vitesse[1] = hasard(2.2, 3.6)
            vitesse[2] = Math.sin(angle) * vitesseHorizontale
        })
        montrer(explosion.boule, true)
        montrer(explosion.noyau, true)
        explosion.debris.forEach((maillage) => montrer(maillage, true))
    }

    const lancerOnde = (x: number, z: number) => {
        const onde = ondes.find((candidate) => !candidate.actif) ?? ondes[0]!
        onde.actif = true
        onde.age = 0
        onde.x = x
        onde.z = z
        onde.vitesses.forEach((vitesse) => {
            const angle = hasard(0, Math.PI * 2)
            const vitesseHorizontale = hasard(0.35, 0.9)
            vitesse[0] = Math.cos(angle) * vitesseHorizontale
            vitesse[1] = hasard(2.0, 3.0)
            vitesse[2] = Math.sin(angle) * vitesseHorizontale
        })
        montrer(onde.jet, true)
        onde.gouttes.forEach((maillage) => montrer(maillage, true))
    }

    const traiterImpact = (boulet: Boulet) => {
        const [x, , z] = boulet.cible
        if (boulet.resultat === 'rate') {
            lancerOnde(x, z)
            taches.push({ reste: 0.4, action: boulet.surImpact })
        } else {
            lancerExplosion(x, z, boulet.resultat === 'coule' ? 1.5 : 1)
            taches.push({ reste: 0.12, action: boulet.surImpact })
        }
    }

    // --- Animation, appelée avant chaque image -------------------------------------------------
    const avancer = (dt: number) => {
        temps += dt

        for (let index = taches.length - 1; index >= 0; index--) {
            const tache = taches[index]!
            tache.reste -= dt
            if (tache.reste <= 0) {
                taches.splice(index, 1)
                tache.action()
            }
        }

        for (const boulet of boulets) {
            if (!boulet.actif) continue
            boulet.age += dt
            const avancement = borner(boulet.age / DUREE_VOL)
            boulet.maillage.position.set(
                melange(boulet.depart[0], boulet.cible[0], avancement),
                melange(boulet.depart[1], boulet.cible[1], avancement) + 1.3 * Math.sin(Math.PI * avancement),
                melange(boulet.depart[2], boulet.cible[2], avancement),
            )
            if (avancement >= 1) {
                boulet.actif = false
                montrer(boulet.maillage, false)
                traiterImpact(boulet)
            }
        }

        for (const explosion of explosions) {
            if (!explosion.actif) continue
            explosion.age += dt
            if (explosion.age >= DUREE_EXPLOSION) {
                explosion.actif = false
                montrer(explosion.boule, false)
                montrer(explosion.noyau, false)
                explosion.debris.forEach((maillage) => montrer(maillage, false))
                continue
            }
            const avancementBoule = borner(explosion.age / 0.7)
            const tailleBoule = (0.25 + 1.2 * Math.pow(avancementBoule, 0.6)) * explosion.echelle
            explosion.boule.scaling.set(tailleBoule, tailleBoule, tailleBoule)
            explosion.boule.position.set(explosion.x, 0.3 + 0.45 * avancementBoule, explosion.z)
            explosion.materiauBoule.alpha = 0.9 * Math.pow(1 - avancementBoule, 1.2)
            if (avancementBoule >= 1) montrer(explosion.boule, false)

            const avancementNoyau = borner(explosion.age / 0.28)
            const tailleNoyau = (0.15 + 0.6 * (1 - avancementNoyau)) * explosion.echelle
            explosion.noyau.scaling.set(tailleNoyau, tailleNoyau, tailleNoyau)
            explosion.noyau.position.set(explosion.x, 0.3, explosion.z)
            explosion.materiauNoyau.alpha = 0.95 * (1 - avancementNoyau)
            if (avancementNoyau >= 1) montrer(explosion.noyau, false)

            explosion.debris.forEach((maillage, index) => {
                const vitesse = explosion.vitesses[index]!
                const hauteur = 0.3 + vitesse[1] * explosion.age - 5 * explosion.age * explosion.age
                if (hauteur < 0.02) {
                    montrer(maillage, false)
                    return
                }
                maillage.position.set(explosion.x + vitesse[0] * explosion.age, hauteur, explosion.z + vitesse[2] * explosion.age)
            })
        }

        for (const onde of ondes) {
            if (!onde.actif) continue
            onde.age += dt
            let encoreVisible = onde.age < 0.7
            for (const anneau of onde.anneaux) {
                const avancement = (onde.age - anneau.delai) / DUREE_ONDE
                if (avancement < 0 || avancement >= 1) {
                    montrer(anneau.vague, false)
                    montrer(anneau.ecume, false)
                    continue
                }
                encoreVisible = true
                // La vague s'étale en ralentissant ; sa crête (écume blanche) la précède et s'efface plus tard.
                const etalement = 1 - Math.pow(1 - avancement, 2)
                const diametre = 0.35 + 2.6 * etalement * anneau.intensite
                const bosse = 0.04 * Math.sin(Math.PI * avancement) * anneau.intensite
                montrer(anneau.vague, true)
                anneau.vague.scaling.set(diametre, 1, diametre)
                anneau.vague.position.set(onde.x, 0.025 + bosse, onde.z)
                anneau.materiauVague.alpha = 0.5 * (1 - avancement) * anneau.intensite
                montrer(anneau.ecume, true)
                anneau.ecume.scaling.set(diametre, 1, diametre)
                anneau.ecume.position.set(onde.x, 0.07 + bosse, onde.z)
                anneau.materiauEcume.alpha = 0.85 * Math.pow(1 - avancement, 1.5) * anneau.intensite
            }

            const montee = borner(onde.age / 0.22)
            const descente = borner((onde.age - 0.22) / 0.4)
            if (descente >= 1) {
                montrer(onde.jet, false)
            } else {
                const hauteurJet = 0.9 * montee * (1 - descente)
                onde.jet.scaling.set(1, Math.max(hauteurJet, 0.001), 1)
                onde.jet.position.set(onde.x, hauteurJet / 2, onde.z)
                onde.materiauJet.alpha = 0.8 * (1 - descente)
            }
            onde.gouttes.forEach((maillage, index) => {
                const vitesse = onde.vitesses[index]!
                const hauteur = vitesse[1] * onde.age - 5 * onde.age * onde.age
                if (hauteur < 0 || onde.age > 1) {
                    montrer(maillage, false)
                    return
                }
                maillage.position.set(onde.x + vitesse[0] * onde.age, hauteur + 0.05, onde.z + vitesse[2] * onde.age)
            })
            if (!encoreVisible && descente >= 1) onde.actif = false
        }

        for (const feu of feux) {
            if (!feu.actif) continue
            const scintillement = 1 + 0.22 * Math.sin(temps * 11 + feu.phase) + 0.12 * Math.sin(temps * 17 + feu.phase * 2)
            const balancement = 0.06 * Math.sin(temps * 7 + feu.phase)
            feu.flammeExterieure.scaling.set(1 + 0.08 * Math.sin(temps * 13 + feu.phase), scintillement, 1)
            feu.flammeExterieure.position.set(feu.x + balancement, HAUTEUR_FEU + 0.27 * scintillement, feu.z)
            const scintillementInterieur = 1 + 0.3 * Math.sin(temps * 15 + feu.phase * 3)
            feu.flammeInterieure.scaling.set(1, scintillementInterieur, 1)
            feu.flammeInterieure.position.set(feu.x - balancement * 0.5, HAUTEUR_FEU + 0.19 * scintillementInterieur, feu.z)
            for (const bouffee of feu.bouffees) {
                const avancement = (temps / 2.6 + bouffee.decalage + feu.phase) % 1
                const taille = 0.18 + 0.4 * avancement
                bouffee.maillage.scaling.set(taille, taille, taille)
                bouffee.maillage.position.set(
                    feu.x + 0.22 * avancement + 0.05 * Math.sin(avancement * 9 + feu.phase),
                    HAUTEUR_FEU + 0.55 + 1.5 * avancement,
                    feu.z + 0.12 * avancement,
                )
                // Apparition rapide, disparition lente.
                bouffee.materiau.alpha = 0.55 * Math.pow(1 - avancement, 1.2) * Math.min(1, avancement * 6)
            }
        }
    }

    onBeforeRender(scene, (deltaMs) => avancer(Math.min(deltaMs, 50) / 1000))

    return {
        dureeVol: DUREE_VOL,
        tirer(colonne, ligne, resultat, surImpact) {
            const boulet = boulets.find((candidat) => !candidat.actif) ?? boulets[0]!
            const { x, z } = caseVersMonde({ colonne, ligne })
            boulet.actif = true
            boulet.age = 0
            boulet.resultat = resultat
            boulet.surImpact = surImpact
            boulet.cible = [x, 0.1, z]
            boulet.depart = [x - 2.6 * TAILLE_CASE, 5.5, z + 2.2 * TAILLE_CASE]
            boulet.maillage.position.set(...boulet.depart)
            montrer(boulet.maillage, true)
        },
        definirFeu(colonne, ligne, actif) {
            const cle = `${colonne},${ligne}`
            const existant = feuxParCase.get(cle)
            if (actif === (existant !== undefined)) return
            if (actif) {
                const libre = feux.find((candidat) => !candidat.actif)
                if (!libre) return
                const { x, z } = caseVersMonde({ colonne, ligne })
                libre.actif = true
                libre.cle = cle
                libre.x = x
                libre.z = z
                feuxParCase.set(cle, libre)
                montrer(libre.flammeExterieure, true)
                montrer(libre.flammeInterieure, true)
                libre.bouffees.forEach((bouffee) => montrer(bouffee.maillage, true))
            } else if (existant) {
                existant.actif = false
                feuxParCase.delete(cle)
                montrer(existant.flammeExterieure, false)
                montrer(existant.flammeInterieure, false)
                existant.bouffees.forEach((bouffee) => montrer(bouffee.maillage, false))
            }
        },
        definirEcume(colonne, ligne, actif) {
            setSubtreeVisible(ecumes[ligne]![colonne]!, actif)
        },
        definirTraceBrulure(colonne, ligne, actif) {
            montrer(brulures[ligne]![colonne]!, actif)
        },
        planifier(delai, action) {
            taches.push({ reste: delai, action })
        },
    }
}
