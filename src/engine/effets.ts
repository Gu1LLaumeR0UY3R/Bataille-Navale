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
    enableStandardVertexColors,
    loadTexture2D,
    onBeforeRender,
    setStandardOpacityTexture,
    setSubtreeVisible,
    updateMeshColors,
    updateMeshNormals,
    updateMeshPositions,
    updateMeshUvs,
    type EngineContext,
    type Mesh,
    type SceneContext,
    type StandardMaterialProps,
    type Texture2D,
} from '@babylonjs/lite'
import { TAILLE_GRILLE, type Couleur } from '../game/types.ts'
import { TAILLE_CASE, caseVersMonde } from './boardGeometry.ts'
import { AGITATION_DEFAUT, ecumeCrete, hauteurVague } from './vagues.ts'

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
/** Durée totale d'une éclaboussure : gerbe, gouttes puis écume qui se défait. */
const DUREE_ECLABOUSSURE = 2
const GOUTTES_PAR_ONDE = 22
const DENTELLES_PAR_ONDE = 16
const GRAVITE_GOUTTES = 7
/** Plaques d'écume qui restent sur une case où un tir est tombé à l'eau. */
const PLAQUES_ECUME_PAR_CASE = 7
const NOMBRE_BOULETS = 3
const NOMBRE_EXPLOSIONS = 3
const NOMBRE_ONDES = 4
/** Un bateau a au plus 5 cases, la flotte 17 : on garde un peu de marge. */
const NOMBRE_FEUX = TAILLE_GRILLE * 2
const BOUFFEES_PAR_FEU = 3
const HAUTEUR_FEU = 0.32

const borner = (valeur: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, valeur))
const lisser = (valeur: number) => {
    const t = borner(valeur)
    return t * t * (3 - 2 * t)
}
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
    /** Hauteur du fond : l'eau forme un bloc entre le fond et la surface. */
    fond: number
    /** Opacité de la surface et des parois (0 = invisible, 1 = opaque). L'eau est translucide : on voit le fond. */
    opacite?: { surface: number, parois: number }
    /**
     * Eau trouble en profondeur : des strates translucides empilées entre la surface et le fond. Ce qui est
     * près de la surface reste net ; plus on descend, plus le regard traverse de strates et plus c'est voilé.
     */
    strates?: { nombre: number, opacite: number, couleurFond: Couleur }
    /** Agitation de la mer : 0 = calme, 1 = tempête (hauteur, chaos et écume des crêtes). */
    agitation?: number
}

/** Finesse du maillage de l'eau : assez fin pour que les petites vagues et les impacts se voient. */
const SUBDIVISIONS_EAU = 88
/** Nombre de fois que la texture d'écume se répète sur la surface de l'eau (plus grand = motif plus fin). */
const REPETITION_ECUME = 3.2
const OPACITE_SURCOUCHE_ECUME = 0.9
/** Part d'écume en couleur de sommet conservée sous la texture : un voile léger, pour que l'écume ne flotte pas. */
const ECUME_SURFACE_AVEC_TEXTURE = 0.3

/** Un boulet qui entre dans l'eau : la surface réagit pendant `DUREE_IMPACT_EAU` secondes. */
interface ImpactEau {
    x: number
    z: number
    age: number
    force: number
}

const DUREE_IMPACT_EAU = 3.4
const IMPACTS_EAU_MAX = 6
/** Vitesse de propagation du front d'onde (unités du monde par seconde). */
const VITESSE_ONDE = 1.5
/** Nombre d'onde : 2π / longueur d'onde (≈ 0,9 de la case). */
const NOMBRE_D_ONDE = 7
const impactsParScene = new WeakMap<SceneContext, ImpactEau[]>()

const impactsDeLaScene = (scene: SceneContext): ImpactEau[] => {
    let impacts = impactsParScene.get(scene)
    if (!impacts) {
        impacts = []
        impactsParScene.set(scene, impacts)
    }
    return impacts
}

/** Fait réagir la surface de l'eau à un impact en (x, z). `force` : 1 = boulet normal. */
function ajouterImpactEau(scene: SceneContext, x: number, z: number, force = 1) {
    const impacts = impactsDeLaScene(scene)
    impacts.push({ x, z, age: 0, force })
    if (impacts.length > IMPACTS_EAU_MAX) impacts.shift()
}

/**
 * Hauteur ajoutée à la surface par les impacts, à la distance r du point d'entrée et à l'âge a.
 * Un boulet qui entre dans l'eau déforme la mer en quatre temps, tous calculés ici :
 *   1. un CRATÈRE se creuse à l'entrée et se comble vite :           −P · e^(−r²/s²) · e^(−a/τ)
 *   2. un BOURRELET (la couronne) est repoussé et s'écarte :           C · e^(−a/τc) · e^(−((r − Rc(a))/w(a))²)
 *      avec Rc(a) = R0 + V·a^0,65 (il ralentit) et w(a) qui s'élargit
 *   3. une COLONNE centrale jaillit puis retombe (effet Worthington) : H · sin(π·φ(a)) · e^(−r²/s²)
 *   4. des ONDULATIONS s'éloignent à la vitesse c et s'amortissent :  A · e^(−a/τ) · e^(−r/L) · cos(k·(r − c·a)) · E(r, a)
 *      (E vaut 1 derrière le front d'onde et chute à 0 devant : l'eau ne bouge pas avant que l'onde arrive)
 */
function hauteurImpacts(x: number, z: number, impacts: readonly ImpactEau[]): number {
    let somme = 0
    for (const impact of impacts) {
        const r = Math.hypot(x - impact.x, z - impact.z)
        const a = impact.age
        const cratere = -0.2 * Math.exp(-(r * r) / 0.07) * Math.exp(-a / 0.2)
        const rayonCouronne = 0.22 + 0.95 * Math.pow(a, 0.65)
        const largeurCouronne = 0.12 + 0.1 * a
        const ecart = (r - rayonCouronne) / largeurCouronne
        const couronne = 0.2 * Math.exp(-a / 0.45) * Math.exp(-ecart * ecart)
        const phaseColonne = Math.min(1, Math.max(0, (a - 0.1) / 0.55))
        const colonne = 0.34 * Math.sin(Math.PI * phaseColonne) * Math.exp(-(r * r) / 0.05)
        const devantLeFront = r - (VITESSE_ONDE * a + 0.35)
        const enveloppe = devantLeFront <= 0 ? 1 : Math.exp(-(devantLeFront * devantLeFront) / 0.06)
        const ondes = 0.07 * Math.exp(-a / 1.1) * Math.exp(-r / 1.3) * Math.cos(NOMBRE_D_ONDE * (r - VITESSE_ONDE * a)) * enveloppe
        somme += impact.force * (cratere + couronne + colonne + ondes)
    }
    return somme
}

/** Part de la profondeur occupée par la tranche claire (près de la surface) des parois. */
const PART_TRANCHE_CLAIRE = 0.4

function materiauEau(couleur: Couleur, luminosite: number, emission: number, brillant: boolean, alpha = 1) {
    const materiau = createStandardMaterial()
    // alpha < 1 dès la création : sinon BabylonLite rend le matériau comme opaque.
    materiau.alpha = alpha
    materiau.diffuseColor = [couleur[0] * luminosite, couleur[1] * luminosite, couleur[2] * luminosite]
    materiau.emissiveColor = [couleur[0] * emission, couleur[1] * emission, couleur[2] * emission]
    materiau.specularColor = brillant ? [0.1, 0.16, 0.18] : [0.02, 0.04, 0.05]
    materiau.specularPower = 24
    materiau.backFaceCulling = false
    return materiau
}

export async function creerEau(moteur: EngineContext, scene: SceneContext, options: OptionsEau): Promise<void> {
    // Couleurs par sommet : la surface se teinte en blanc là où la houle déferle (écume des crêtes).
    enableStandardVertexColors()
    const agitation = options.agitation ?? AGITATION_DEFAUT
    const opacite = options.opacite ?? { surface: 1, parois: 1 }
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
    // Eau opaque : seule la tranche du haut est visible (le bloc profond cache le reste).
    // Eau translucide : les parois descendent jusqu'au sable, on voit le fond de profil.
    const basTranche = options.niveau - profondeurTotale * (opacite.surface >= 1 ? PART_TRANCHE_CLAIRE : 1)
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

    const impacts = impactsDeLaScene(scene)
    const hauteurs = new Float32Array(nombreSommets)
    const pas = options.taille / SUBDIVISIONS_EAU
    // Couleur par sommet : teinte de l'eau (la matière est blanche, la couleur passe ici) et opacité.
    // alpha < 1 dès la création : sinon BabylonLite rend le matériau comme opaque.
    const alphaMateriau = opacite.surface >= 1 ? 1 : 0.99
    const alphaEau = opacite.surface / alphaMateriau
    const COULEUR_ECUME: Couleur = [0.92, 0.97, 1]
    const OPACITE_ECUME = 0.8
    const couleurs = new Float32Array(nombreSommets * 4)
    /** Écume des crêtes en chaque sommet (0 à 1) : sert de masque à la texture d'écume. */
    const masqueEcume = new Float32Array(nombreSommets)
    /** Part de blanc appliquée directement à l'eau : réduite quand la texture d'écume prend le relais. */
    let partEcumeSurface = 1
    let temps = 0
    const calculer = () => {
        for (let sommet = 0; sommet < nombreSommets; sommet++) {
            const x = positions[sommet * 3]!
            const z = positions[sommet * 3 + 2]!
            const houle = hauteurVague(x, z, temps, agitation)
            hauteurs[sommet] = houle + (impacts.length > 0 ? hauteurImpacts(x, z, impacts) : 0)
            positions[sommet * 3 + 1] = options.niveau + hauteurs[sommet]!
            const ecume = ecumeCrete(houle, x, z, temps, agitation)
            masqueEcume[sommet] = ecume
            const blanc = ecume * partEcumeSurface
            couleurs[sommet * 4] = options.couleur[0] + (COULEUR_ECUME[0] - options.couleur[0]) * blanc
            couleurs[sommet * 4 + 1] = options.couleur[1] + (COULEUR_ECUME[1] - options.couleur[1]) * blanc
            couleurs[sommet * 4 + 2] = options.couleur[2] + (COULEUR_ECUME[2] - options.couleur[2]) * blanc
            couleurs[sommet * 4 + 3] = alphaEau + (OPACITE_ECUME - alphaEau) * blanc
        }
        // Normales : pente de la surface, lue sur les points voisins du maillage (ligne 0 = z maximal).
        for (let rangee = 0; rangee < colonnes; rangee++) {
            const haut = Math.max(rangee - 1, 0)
            const bas = Math.min(rangee + 1, colonnes - 1)
            for (let colonne = 0; colonne < colonnes; colonne++) {
                const gauche = Math.max(colonne - 1, 0)
                const droite = Math.min(colonne + 1, colonnes - 1)
                const penteX = (hauteurs[rangee * colonnes + droite]! - hauteurs[rangee * colonnes + gauche]!) / ((droite - gauche) * pas)
                const penteZ = (hauteurs[haut * colonnes + colonne]! - hauteurs[bas * colonnes + colonne]!) / ((bas - haut) * pas)
                const sommet = rangee * colonnes + colonne
                const longueur = Math.hypot(penteX, 1, penteZ)
                normales[sommet * 3] = -penteX / longueur
                normales[sommet * 3 + 1] = 1 / longueur
                normales[sommet * 3 + 2] = -penteZ / longueur
            }
        }
        for (let sommet = 0; sommet < cotes.length * colonnes; sommet++) {
            const indiceHaut = sommet * 2
            const x = positionsParois[indiceHaut * 3]!
            const z = positionsParois[indiceHaut * 3 + 2]!
            positionsParois[indiceHaut * 3 + 1] = options.niveau + hauteurVague(x, z, temps, agitation) + hauteurImpacts(x, z, impacts)
        }
    }
    calculer()

    // Surface
    const eau = createMeshFromData(moteur, 'eau_profonde', positions, normales, indices, uvs, undefined, undefined, couleurs)
    const materiauSurface = materiauEau(options.couleur, 1, 0.25, true, alphaMateriau)
    materiauSurface.diffuseColor = [1, 1, 1] // la teinte vient des couleurs par sommet
    eau.material = materiauSurface
    // Sans ce drapeau, Lite ignore l'opacité par sommet : l'eau serait rendue presque opaque (donc sombre).
    eau.hasVertexAlpha = true
    addToScene(scene, eau)

    // Tranche claire des parois (animée) : l'épaisseur de l'eau vue de côté
    const parois = createMeshFromData(moteur, 'eau_parois', positionsParois, normalesParois, indicesParois, uvsParois)
    parois.material = materiauEau(options.couleur, 0.85, 0.3, false, opacite.parois)
    addToScene(scene, parois)

    // Strates de turbidité : de fines dalles translucides, de plus en plus sombres vers le fond.
    if (options.strates && opacite.surface < 1) {
        const { nombre, opacite: opaciteStrate, couleurFond } = options.strates
        for (let rang = 1; rang <= nombre; rang++) {
            const part = rang / (nombre + 1) // 0 = surface, 1 = fond
            const teinte = options.couleur.map((composante, i) => composante + (couleurFond[i]! - composante) * part) as Couleur
            const strate = createBox(moteur, { width: options.taille, height: 0.01, depth: options.taille })
            strate.material = materiauEau(teinte, 0.8, 0.12, false, opaciteStrate)
            // Les strates sont plus serrées vers le fond : le voile s'épaissit avec la profondeur.
            strate.position.set(0, options.niveau - profondeurTotale * Math.pow(part, 0.8), 0)
            addToScene(scene, strate)
        }
    }

    // Eau profonde : un bloc plein, plus sombre, jusqu'au fond. Il n'existe que si l'eau est opaque :
    // translucide, il cacherait le sable, les cailloux et les algues.
    if (opacite.surface >= 1) {
        const profond = createBox(moteur, {
            width: options.taille,
            height: basTranche - options.fond,
            depth: options.taille,
        })
        profond.material = materiauEau(options.couleur, 0.5, 0.1, false)
        profond.position.set(0, (basTranche + options.fond) / 2, 0)
        addToScene(scene, profond)
    }

    // Écume des crêtes : une texture de dentelle (public/images/ecume/ecume-crete.png) posée juste au-dessus de
    // l'eau, qui épouse les vagues et dérive lentement. Les crêtes (masqueEcume) règlent où elle apparaît ;
    // la texture donne le détail fin. Sans le fichier, l'eau garde simplement son écume en couleurs de sommets.
    let surcouche: {
        maillage: Mesh
        positions: Float32Array
        couleurs: Float32Array
        uvs: Float32Array
    } | null = null
    try {
        const texture = await loadTexture2D(moteur, `${import.meta.env.BASE_URL}images/ecume/ecume-crete.png`)
        const positionsEcume = Float32Array.from(positions)
        const couleursEcume = new Float32Array(nombreSommets * 4).fill(1)
        const uvsEcume = new Float32Array(uvs.length)
        const maillage = createMeshFromData(moteur, 'eau_ecume_cretes', positionsEcume, normales, indices, uvsEcume, undefined, undefined, couleursEcume)
        const materiauEcume = createStandardMaterial()
        materiauEcume.alpha = 0.99
        materiauEcume.diffuseColor = [1, 1, 1]
        materiauEcume.emissiveColor = [0.55, 0.6, 0.62]
        materiauEcume.specularColor = [0, 0, 0]
        materiauEcume.backFaceCulling = false
        setStandardOpacityTexture(materiauEcume, texture)
        materiauEcume.opacityLevel = 1
        maillage.material = materiauEcume
        maillage.hasVertexAlpha = true
        addToScene(scene, maillage)
        surcouche = { maillage, positions: positionsEcume, couleurs: couleursEcume, uvs: uvsEcume }
        partEcumeSurface = ECUME_SURFACE_AVEC_TEXTURE
    } catch {
        surcouche = null
    }

    onBeforeRender(scene, (deltaMs) => {
        const dt = Math.min(deltaMs, 50) / 1000
        temps += dt
        for (let index = impacts.length - 1; index >= 0; index--) {
            impacts[index]!.age += dt
            if (impacts[index]!.age > DUREE_IMPACT_EAU) impacts.splice(index, 1)
        }
        calculer()
        updateMeshPositions(moteur, eau, positions)
        updateMeshNormals(moteur, eau, normales)
        updateMeshColors(moteur, eau, couleurs)
        updateMeshPositions(moteur, parois, positionsParois)
        if (surcouche) {
            const derive = [temps * 0.012, temps * 0.007]
            for (let sommet = 0; sommet < nombreSommets; sommet++) {
                surcouche.positions[sommet * 3] = positions[sommet * 3]!
                surcouche.positions[sommet * 3 + 1] = positions[sommet * 3 + 1]! + 0.015
                surcouche.positions[sommet * 3 + 2] = positions[sommet * 3 + 2]!
                surcouche.couleurs[sommet * 4 + 3] = Math.min(1, masqueEcume[sommet]! * 1.4) * OPACITE_SURCOUCHE_ECUME
                surcouche.uvs[sommet * 2] = uvs[sommet * 2]! * REPETITION_ECUME + derive[0]!
                surcouche.uvs[sommet * 2 + 1] = uvs[sommet * 2 + 1]! * REPETITION_ECUME + derive[1]!
            }
            updateMeshPositions(moteur, surcouche.maillage, surcouche.positions)
            updateMeshNormals(moteur, surcouche.maillage, normales)
            updateMeshColors(moteur, surcouche.maillage, surcouche.couleurs)
            updateMeshUvs(moteur, surcouche.maillage, surcouche.uvs)
        }
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
    tailles: number[]
    /** Écume en dentelle : de petites plaques blanches qui suivent la vague puis se défont. */
    dentelle: { maillage: Mesh, angle: number, facteur: number, taille: number }[]
    materiauDentelle: StandardMaterialProps
    /** Écume de l'impact (texture PNG posée sur l'eau), si la texture est disponible. */
    plan: PlanEcume | null
}

/** Un carré subdivisé posé sur l'eau, qui épouse les vagues, avec la texture d'écume. */
interface PlanEcume {
    maillage: Mesh
    positions: Float32Array
    couleurs: Float32Array
    /** Décalages (x, z) de chaque sommet dans le carré unité, de −0,5 à 0,5. */
    local: Float32Array
    x: number
    z: number
    angle: number
    taille: number
    alpha: number
    age: number
    actif: boolean
    couleursAJour: boolean
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

export interface OptionsEffets {
    /** Agitation de la mer de la carte (la même que celle de l'eau). */
    agitation?: number
    /** Hauteur moyenne de l'eau : les éclaboussures et l'écume y sont posées. */
    niveauEau?: number
}

export async function creerEffets(moteur: EngineContext, scene: SceneContext, options: OptionsEffets = {}): Promise<Effets> {
    let temps = 0
    const taches: Tache[] = []
    const agitation = options.agitation ?? AGITATION_DEFAUT
    const niveauEau = options.niveauEau ?? 0
    const impactsEau = impactsDeLaScene(scene)
    enableStandardVertexColors()

    // --- Écume d'impact : la texture PNG, posée sur l'eau -------------------------------------
    // Sans le fichier, on garde l'ancienne écume faite de petites plaques.
    let textureImpact: Texture2D | null = null
    try {
        textureImpact = await loadTexture2D(moteur, `${import.meta.env.BASE_URL}images/ecume/ecume-impact.png`)
    } catch {
        textureImpact = null
    }
    const materiauPlanEcume = (() => {
        if (!textureImpact) return null
        const materiau = createStandardMaterial()
        materiau.alpha = 0.99
        materiau.diffuseColor = [1, 1, 1]
        materiau.emissiveColor = [0.62, 0.66, 0.68]
        materiau.specularColor = [0, 0, 0]
        materiau.backFaceCulling = false
        setStandardOpacityTexture(materiau, textureImpact)
        materiau.opacityLevel = 1
        return materiau
    })()
    const creerPlanEcume = (nom: string, divisions: number): PlanEcume | null => {
        if (!materiauPlanEcume) return null
        const colonnes = divisions + 1
        const nombre = colonnes * colonnes
        const positions = new Float32Array(nombre * 3)
        const normales = new Float32Array(nombre * 3)
        const uvs = new Float32Array(nombre * 2)
        const local = new Float32Array(nombre * 2)
        const couleurs = new Float32Array(nombre * 4).fill(1)
        const indices = new Uint32Array(divisions * divisions * 6)
        for (let rangee = 0; rangee < colonnes; rangee++) {
            for (let colonne = 0; colonne < colonnes; colonne++) {
                const sommet = rangee * colonnes + colonne
                local[sommet * 2] = colonne / divisions - 0.5
                local[sommet * 2 + 1] = rangee / divisions - 0.5
                uvs[sommet * 2] = colonne / divisions
                uvs[sommet * 2 + 1] = 1 - rangee / divisions
                normales[sommet * 3 + 1] = 1
            }
        }
        let cible = 0
        for (let rangee = 0; rangee < divisions; rangee++) {
            for (let colonne = 0; colonne < divisions; colonne++) {
                const a = rangee * colonnes + colonne
                const b = a + 1
                const c = a + colonnes
                const d = c + 1
                indices.set([a, c, b, b, c, d], cible)
                cible += 6
            }
        }
        const maillage = createMeshFromData(moteur, nom, positions, normales, indices, uvs, undefined, undefined, couleurs)
        maillage.material = materiauPlanEcume
        maillage.hasVertexAlpha = true
        addToScene(scene, maillage)
        setSubtreeVisible(maillage, false)
        return { maillage, positions, couleurs, local, x: 0, z: 0, angle: 0, taille: 1, alpha: 0, age: 0, actif: false, couleursAJour: false }
    }
    /** Recalcule le carré : il suit la surface de l'eau (vagues + déformation de l'impact). */
    const poserPlanSurLEau = (plan: PlanEcume) => {
        const cosinus = Math.cos(plan.angle)
        const sinus = Math.sin(plan.angle)
        const nombre = plan.local.length / 2
        for (let sommet = 0; sommet < nombre; sommet++) {
            const lx = plan.local[sommet * 2]! * plan.taille
            const lz = plan.local[sommet * 2 + 1]! * plan.taille
            const x = plan.x + lx * cosinus - lz * sinus
            const z = plan.z + lx * sinus + lz * cosinus
            plan.positions[sommet * 3] = x
            plan.positions[sommet * 3 + 1] = niveauEau + hauteurVague(x, z, temps, agitation) + hauteurImpacts(x, z, impactsEau) + 0.02
            plan.positions[sommet * 3 + 2] = z
            if (!plan.couleursAJour) plan.couleurs[sommet * 4 + 3] = plan.alpha
        }
        updateMeshPositions(moteur, plan.maillage, plan.positions)
        if (!plan.couleursAJour) {
            updateMeshColors(moteur, plan.maillage, plan.couleurs)
            plan.couleursAJour = true
        }
    }
    const regler = (plan: PlanEcume, alpha: number, taille: number) => {
        if (Math.abs(alpha - plan.alpha) > 0.004) plan.couleursAJour = false
        plan.alpha = alpha
        plan.taille = taille
    }

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
        const materiauDentelle = await creerMateriau([1, 1, 1], [0.6, 0.65, 0.66], 0.85, true)
        ondes.push({
            actif: false,
            age: 0,
            x: 0,
            z: 0,
            anneaux,
            jet: ajouter(scene, createCylinder(moteur, { height: 1, diameterBottom: 0.3, diameterTop: 0.06, tessellation: 12 }), materiauJet),
            materiauJet,
            gouttes: Array.from({ length: GOUTTES_PAR_ONDE }, () => ajouter(scene, createSphere(moteur, { diameter: 0.07, segments: 5 }), materielGoutte)),
            vitesses: Array.from({ length: GOUTTES_PAR_ONDE }, () => [0, 0, 0] as Vec3),
            tailles: Array.from({ length: GOUTTES_PAR_ONDE }, () => 1),
            dentelle: Array.from({ length: DENTELLES_PAR_ONDE }, () => ({
                maillage: ajouter(scene, createCylinder(moteur, { height: 0.012, diameter: 1, tessellation: 9 }), materiauDentelle),
                angle: 0,
                facteur: 1,
                taille: 0.15,
            })),
            materiauDentelle,
            plan: creerPlanEcume(`ecume_impact_${index}`, 10),
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
    const ecumes: (ReturnType<typeof createTransformNode> | undefined)[][] = []
    /** Avec la texture : une feuille d'écume par case, posée sur l'eau, qui reste toute la partie. */
    const planCases: (PlanEcume | null)[][] = []
    const brulures: Mesh[][] = []
    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        ecumes.push([])
        planCases.push([])
        brulures.push([])
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
            const { x, z } = caseVersMonde({ colonne, ligne })

            const plan = creerPlanEcume(`ecume_case_${colonne}_${ligne}`, 6)
            planCases[ligne]!.push(plan)
            if (plan) {
                plan.x = x
                plan.z = z
                plan.angle = ((colonne * 53 + ligne * 97) % 360) * (Math.PI / 180) // un motif orienté différemment par case
            }
            const groupe = plan ? undefined : createTransformNode(`ecume_${colonne}_${ligne}`, x, 0, z)
            // Écume en dentelle : un voile turquoise pâle et des plaques blanches irrégulières posées en couronne,
            // avec des trous entre elles (comme l'écume d'une mer agitée vue de haut). Chaque case a son motif,
            // fixé par sa position pour qu'il ne change pas d'un affichage à l'autre.
            if (groupe) {
                const nappe = createCylinder(moteur, { height: 0.012, diameter: 0.7, tessellation: 20 })
                nappe.material = materielMousse
                nappe.position.set(0, 0.012, 0)
                groupe.children.push(nappe)
                const graine = (colonne * 7 + ligne * 13 + 3) % 17
                const pseudoHasard = (rang: number) => {
                    const valeur = Math.sin((graine + 1) * 12.9898 + rang * 78.233) * 43758.5453
                    return valeur - Math.floor(valeur)
                }
                for (let plaque = 0; plaque < PLAQUES_ECUME_PAR_CASE; plaque++) {
                    const angle = (plaque / PLAQUES_ECUME_PAR_CASE) * Math.PI * 2 + pseudoHasard(plaque) * 0.9
                    const rayon = 0.16 + pseudoHasard(plaque + 20) * 0.2
                    const taille = 0.13 + pseudoHasard(plaque + 40) * 0.13
                    const morceau = createCylinder(moteur, { height: 0.016, diameter: taille, tessellation: 9 })
                    morceau.material = materielEcume
                    morceau.scaling.set(1, 1, 0.7 + pseudoHasard(plaque + 60) * 0.5)
                    morceau.position.set(Math.cos(angle) * rayon, 0.028, Math.sin(angle) * rayon)
                    groupe.children.push(morceau)
                }
                addToScene(scene, groupe)
                setSubtreeVisible(groupe, false)
            }
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
        // Couronne : des gouttes jaillissent en gerbe, plus ou moins fines et rapides.
        onde.vitesses.forEach((vitesse, index) => {
            const angle = hasard(0, Math.PI * 2)
            const vitesseHorizontale = hasard(0.3, 1.15)
            vitesse[0] = Math.cos(angle) * vitesseHorizontale
            vitesse[1] = hasard(1.9, 3.6)
            vitesse[2] = Math.sin(angle) * vitesseHorizontale
            onde.tailles[index] = hasard(0.5, 1.5)
        })
        onde.dentelle.forEach((plaque) => {
            plaque.angle = hasard(0, Math.PI * 2)
            plaque.facteur = hasard(0.45, 1)
            plaque.taille = hasard(0.1, 0.24)
        })
        montrer(onde.jet, true)
        onde.gouttes.forEach((maillage) => montrer(maillage, true))
        if (onde.plan) {
            // L'écume PNG remplace les plaques et les anneaux : elle part du point d'impact et s'étale.
            onde.plan.x = x
            onde.plan.z = z
            onde.plan.angle = hasard(0, Math.PI * 2)
            onde.plan.age = 0
            onde.plan.actif = true
            onde.plan.couleursAJour = false
            regler(onde.plan, 0, 0.6)
            montrer(onde.plan.maillage, true)
        } else {
            onde.dentelle.forEach((plaque) => montrer(plaque.maillage, true))
        }
        ajouterImpactEau(scene, x, z)
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
            let encoreVisible = onde.age < DUREE_ECLABOUSSURE
            for (const anneau of onde.anneaux) {
                const avancement = (onde.age - anneau.delai) / DUREE_ONDE
                if (onde.plan || avancement < 0 || avancement >= 1) {
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

            // Gerbe centrale : elle jaillit vite, s'amincit au sommet (le haut se détache en gouttes), retombe.
            const montee = borner(onde.age / 0.2)
            const descente = borner((onde.age - 0.2) / 0.5)
            if (descente >= 1) {
                montrer(onde.jet, false)
            } else {
                const hauteurJet = 1.25 * Math.pow(montee, 0.7) * (1 - descente * descente)
                const largeur = 1 - 0.55 * descente
                onde.jet.scaling.set(largeur, Math.max(hauteurJet, 0.001), largeur)
                onde.jet.position.set(onde.x, niveauEau + hauteurJet / 2, onde.z)
                onde.materiauJet.alpha = 0.75 * (1 - descente)
            }
            // Gouttes : trajectoire balistique (gravité), elles rétrécissent un peu avant de toucher l'eau.
            onde.gouttes.forEach((maillage, index) => {
                const vitesse = onde.vitesses[index]!
                const hauteur = vitesse[1] * onde.age - 0.5 * GRAVITE_GOUTTES * onde.age * onde.age
                if (hauteur < 0 || onde.age > 1.3) {
                    montrer(maillage, false)
                    return
                }
                const taille = onde.tailles[index]! * (hauteur < 0.12 ? 0.4 + 3.3 * hauteur : 1)
                maillage.scaling.set(taille, taille, taille)
                maillage.position.set(onde.x + vitesse[0] * onde.age, niveauEau + hauteur + 0.04, onde.z + vitesse[2] * onde.age)
            })
            // Écume en dentelle : les plaques suivent le front de l'onde, restent à la surface puis se défont.
            const vieDentelle = borner(onde.age / DUREE_ECLABOUSSURE)
            onde.materiauDentelle.alpha = 0.85 * Math.pow(1 - vieDentelle, 1.6) * borner(onde.age * 8)
            onde.dentelle.forEach((plaque) => {
                const rayon = (0.2 + 1.35 * (1 - Math.pow(1 - borner(onde.age / 1.1), 2))) * plaque.facteur
                const taille = plaque.taille * (0.6 + 0.9 * borner(onde.age / 0.8)) * (1 - 0.5 * vieDentelle)
                plaque.maillage.scaling.set(taille, 1, taille * 0.78)
                plaque.maillage.position.set(onde.x + Math.cos(plaque.angle) * rayon, 0.045, onde.z + Math.sin(plaque.angle) * rayon)
            })
            if (onde.plan) {
                // Écume PNG : elle grandit vite (le souffle de l'impact), puis reste et se dissout doucement.
                const etalement = 1 - Math.pow(1 - borner(onde.age / 0.9), 2)
                const apparition = borner(onde.age / 0.12)
                const dissolution = 1 - lisser((onde.age - 0.9) / (DUREE_ECLABOUSSURE - 0.9))
                regler(onde.plan, 0.95 * apparition * dissolution, 0.7 + 1.5 * etalement)
                poserPlanSurLEau(onde.plan)
            }
            if (!encoreVisible) {
                if (onde.plan) {
                    onde.plan.actif = false
                    montrer(onde.plan.maillage, false)
                }
                onde.actif = false
                montrer(onde.jet, false)
                onde.gouttes.forEach((maillage) => montrer(maillage, false))
                onde.dentelle.forEach((plaque) => montrer(plaque.maillage, false))
            }
        }

        // Écume restée sur les cases où un tir est tombé à l'eau : elle apparaît puis suit les vagues.
        for (const rangee of planCases) {
            for (const plan of rangee) {
                if (!plan || !plan.actif) continue
                plan.age += dt
                const arrivee = borner(plan.age / 0.6)
                regler(plan, 0.82 * lisser(arrivee * 1.4), (0.62 + 0.44 * (1 - Math.pow(1 - arrivee, 2))) * TAILLE_CASE)
                poserPlanSurLEau(plan)
            }
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
            const plan = planCases[ligne]![colonne]
            if (plan) {
                if (actif && !plan.actif) plan.age = 0
                plan.actif = actif
                setSubtreeVisible(plan.maillage, actif)
                return
            }
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
