// Scène de l'éditeur de cartes : mer, grille, objets posés, cases bloquées peintes, ciel et soleil.
// Comme boardScene.ts, ce module ne sait pas ce qu'est Vue : il reçoit une toile et renvoie une API.

import {
    addToScene,
    attachControl,
    computeMaxExtents,
    createArcRotateCamera,
    createBox,
    createCylinder,
    createDirectionalLight,
    createEngine,
    createGround,
    createHemisphericLight,
    createPickingRay,
    createSceneContext,
    createSphere,
    createStandardMaterial,
    createTransformNode,
    disposeEngine,
    disposeScene,
    getContainerMeshes,
    getEffectiveAspectRatio,
    getViewProjectionMatrix,
    loadGltf,
    pickMeshesWithRay,
    registerScene,
    removeFromScene,
    resizeEngine,
    setSubtreeVisible,
    startEngine,
    stopEngine,
    type ArcRotateCamera,
    type DirectionalLight,
    type EngineContext,
    type Mesh,
    type SceneContext,
    type SceneNode,
    type StandardMaterialProps,
    type TransformNode,
} from '@babylonjs/lite'
import { CASES_MODELE_BASE, ECHELLE_MIN, REGLAGES_PAR_DEFAUT, cleCase, hslVersRgb, type CarteJeu, type ObjetCarte, type ReglagesCarte, type TypeObjet } from '../game/carte.ts'
import { TAILLE_GRILLE, type CoordCase } from '../game/types.ts'
import { TAILLE_CASE, mondeVersCase } from './boardGeometry.ts'

export type Outil = 'selection' | 'poser' | 'peindre'

export interface EtatEditeur {
    outil: Outil
    /** Type à poser quand l'outil est 'poser'. */
    typeAPoser: TypeObjet
    selection: string | null
}

export interface EvenementsEditeur {
    /** La sélection ou un objet a changé (déplacement, rotation, échelle, ajout, suppression). */
    surChangement(): void
    surErreur(message: string): void
}

export interface ModeleImporte {
    /** Nom de fichier sûr, unique dans la carte. */
    fichier: string
    donnees: Uint8Array
}

export interface SceneEditeur {
    etat: EtatEditeur
    reglages: ReglagesCarte
    definirOutil(outil: Outil, typeAPoser?: TypeObjet): void
    appliquerReglages(): void
    objets(): readonly ObjetCarte[]
    objetSelectionne(): ObjetCarte | null
    majObjet(identifiant: string, changements: Partial<Pick<ObjetCarte, 'x' | 'z' | 'rotation' | 'echelle'>>): void
    supprimer(identifiant: string): void
    selectionner(identifiant: string | null): void
    casesBloquees(): CoordCase[]
    viderCasesBloquees(): void
    /** Ajoute un .glb importé et le pose au centre de la grille. */
    ajouterModele(modele: ModeleImporte): Promise<ObjetCarte>
    donneesModele(fichier: string): Uint8Array | undefined
    chargerCarte(carte: CarteJeu, modeles: ReadonlyMap<string, Uint8Array>): Promise<void>
    /** Carte courante, sans le nom (donné par l'interface). */
    exporter(nom: string): CarteJeu
    liberer(): void
}

interface ObjetScene {
    donnees: ObjetCarte
    pivot: TransformNode
    maillages: Mesh[]
    /** Facteur qui ramène le modèle à sa taille de base (1 pour les objets fabriqués ici). */
    echelleBase: number
}

const DEGRES_VERS_RADIANS = Math.PI / 180
const NIVEAU_MER = -0.05
const COTE_MER = TAILLE_GRILLE + 14
const LIMITE_POSE = TAILLE_GRILLE / 2 + 3

type Vec3 = [number, number, number]

function materiau(moteurCouleur: Vec3, emission: Vec3 = [0, 0, 0]): StandardMaterialProps {
    const matiere = createStandardMaterial()
    matiere.diffuseColor = moteurCouleur
    matiere.emissiveColor = emission
    return matiere
}

export async function creerSceneEditeur(toile: HTMLCanvasElement, evenements: EvenementsEditeur): Promise<SceneEditeur> {
    if (!('gpu' in navigator)) throw new Error('WebGPU non disponible dans ce navigateur.')

    const moteur: EngineContext = await createEngine(toile)
    const scene: SceneContext = createSceneContext(moteur)

    const camera: ArcRotateCamera = createArcRotateCamera(-Math.PI / 2, 0.95, 20, { x: 0, y: 0, z: 0 })
    scene.camera = camera

    const lumiereCiel = createHemisphericLight([0, 1, 0], 0.55)
    const soleil: DirectionalLight = createDirectionalLight([-0.4, -1, -0.3], 0.9)
    addToScene(scene, lumiereCiel)
    addToScene(scene, soleil)

    // Mer.
    const matiereMer = materiau([0.02, 0.3, 0.38])
    const mer = createGround(moteur, { width: COTE_MER, height: COTE_MER })
    mer.material = matiereMer
    mer.position.set(0, NIVEAU_MER, 0)
    addToScene(scene, mer)

    // Lignes de la grille : créées une fois, avant registerScene.
    const matiereLigne = materiau([0.55, 0.85, 0.9], [0.25, 0.4, 0.45])
    for (let indice = 0; indice <= TAILLE_GRILLE; indice++) {
        const decalage = (indice - TAILLE_GRILLE / 2) * TAILLE_CASE
        const verticale = createBox(moteur, { width: 0.02, height: 0.01, depth: TAILLE_GRILLE * TAILLE_CASE })
        verticale.material = matiereLigne
        verticale.position.set(decalage, 0.005, 0)
        addToScene(scene, verticale)
        const horizontale = createBox(moteur, { width: TAILLE_GRILLE * TAILLE_CASE, height: 0.01, depth: 0.02 })
        horizontale.material = matiereLigne
        horizontale.position.set(0, 0.005, decalage)
        addToScene(scene, horizontale)
    }

    // Cases bloquées : 100 dalles rouges, visibles ou non.
    const matiereBloquee = materiau([0.85, 0.15, 0.12], [0.45, 0.05, 0.04])
    const dallesBloquees: Mesh[][] = []
    const bloquees = new Set<string>()
    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        const rangee: Mesh[] = []
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
            const dalle = createBox(moteur, { width: 0.92, height: 0.04, depth: 0.92 })
            dalle.material = matiereBloquee
            dalle.position.set((colonne - (TAILLE_GRILLE - 1) / 2) * TAILLE_CASE, 0.03, ((TAILLE_GRILLE - 1) / 2 - ligne) * TAILLE_CASE)
            addToScene(scene, dalle)
            setSubtreeVisible(dalle, false)
            rangee.push(dalle)
        }
        dallesBloquees.push(rangee)
    }

    // Survol : case sous le pointeur en mode peinture.
    const survol = createBox(moteur, { width: 0.98, height: 0.03, depth: 0.98 })
    survol.material = materiau([0.95, 0.85, 0.2], [0.5, 0.45, 0.1])
    survol.position.set(0, 0.04, 0)
    addToScene(scene, survol)
    setSubtreeVisible(survol, false)

    await registerScene(scene)
    await startEngine(moteur)
    resizeEngine(moteur)
    const observateurTaille = new ResizeObserver(() => resizeEngine(moteur))
    observateurTaille.observe(toile)

    // ------------------------------------------------------------------ objets

    const objets = new Map<string, ObjetScene>()
    const maillageVersObjet = new Map<Mesh, string>()
    const modelesBruts = new Map<string, Uint8Array>()
    let compteur = 0

    function majPivot(objet: ObjetScene) {
        const { donnees, pivot } = objet
        const echelle = objet.echelleBase * donnees.echelle
        pivot.position.set(donnees.x * TAILLE_CASE, 0, donnees.z * TAILLE_CASE)
        pivot.rotation.set(0, donnees.rotation * DEGRES_VERS_RADIANS, 0)
        pivot.scaling.set(echelle, echelle, echelle)
    }

    function construireForme(type: Exclude<TypeObjet, 'modele'>): { pivot: TransformNode; maillages: Mesh[] } {
        const pivot = createTransformNode(`forme_${type}`)
        const maillages: Mesh[] = []
        const ajouter = (maillage: Mesh, x: number, y: number, z: number, matiere: StandardMaterialProps) => {
            maillage.material = matiere
            maillage.position.set(x, y, z)
            pivot.children.push(maillage)
            maillages.push(maillage)
        }
        if (type === 'ile') {
            ajouter(createCylinder(moteur, { height: 0.25, diameterTop: 2.2, diameterBottom: 2.8, tessellation: 24 }), 0, 0.05, 0, materiau([0.85, 0.77, 0.52]))
            ajouter(createCylinder(moteur, { height: 0.5, diameterTop: 1.1, diameterBottom: 1.9, tessellation: 20 }), 0.1, 0.4, 0, materiau([0.25, 0.55, 0.22]))
            ajouter(createCylinder(moteur, { height: 0.6, diameterTop: 0.1, diameterBottom: 0.6, tessellation: 14 }), 0.1, 0.95, 0, materiau([0.2, 0.45, 0.18]))
        } else if (type === 'rocher') {
            ajouter(createSphere(moteur, { diameterX: 1.4, diameterY: 0.9, diameterZ: 1.1, segments: 10 }), 0, 0.25, 0, materiau([0.42, 0.42, 0.45]))
            ajouter(createSphere(moteur, { diameterX: 0.8, diameterY: 0.6, diameterZ: 0.7, segments: 8 }), 0.55, 0.12, 0.3, materiau([0.5, 0.5, 0.52]))
        } else {
            ajouter(createCylinder(moteur, { height: 0.35, diameterTop: 0.35, diameterBottom: 0.55, tessellation: 16 }), 0, 0.1, 0, materiau([0.9, 0.15, 0.12]))
            ajouter(createCylinder(moteur, { height: 0.25, diameter: 0.4, tessellation: 16 }), 0, 0.4, 0, materiau([0.95, 0.95, 0.95]))
            ajouter(createSphere(moteur, { diameter: 0.18, segments: 8 }), 0, 0.62, 0, materiau([1, 0.85, 0.2], [0.6, 0.5, 0.1]))
        }
        return { pivot, maillages }
    }

    /** Charge un .glb, le centre, pose sa base sur y = 0 et mesure son facteur d'échelle de base. */
    async function construireModele(octets: Uint8Array): Promise<{ pivot: TransformNode; maillages: Mesh[]; echelleBase: number }> {
        const conteneur = await loadGltf(moteur, octets.slice().buffer as ArrayBuffer)
        const racine = conteneur.entities[0] as SceneNode | undefined
        if (!racine) throw new Error('Ce .glb ne contient aucune scène.')
        const maillages = getContainerMeshes(conteneur)
        const minimum = [Infinity, Infinity, Infinity]
        const maximum = [-Infinity, -Infinity, -Infinity]
        for (const etendue of computeMaxExtents(maillages)) {
            for (let axe = 0; axe < 3; axe++) {
                minimum[axe] = Math.min(minimum[axe]!, etendue.minimum[axe]!)
                maximum[axe] = Math.max(maximum[axe]!, etendue.maximum[axe]!)
            }
        }
        const taille = maximum.map((valeur, axe) => valeur - minimum[axe]!)
        if (!taille.every((valeur) => Number.isFinite(valeur) && valeur > 0)) throw new Error(`Dimensions du .glb illisibles : ${taille.join(', ')}`)
        racine.position.set(
            racine.position.x - (maximum[0]! + minimum[0]!) / 2,
            racine.position.y - minimum[1]!,
            racine.position.z - (maximum[2]! + minimum[2]!) / 2,
        )
        const pivot = createTransformNode('pivot_modele')
        pivot.children.push(racine)
        const echelleBase = (CASES_MODELE_BASE * TAILLE_CASE) / Math.max(taille[0]!, taille[2]!)
        return { pivot, maillages, echelleBase }
    }

    function enregistrerObjet(donnees: ObjetCarte, pivot: TransformNode, maillages: Mesh[], echelleBase: number) {
        const objet: ObjetScene = { donnees, pivot, maillages, echelleBase }
        majPivot(objet)
        addToScene(scene, pivot)
        objets.set(donnees.identifiant, objet)
        for (const maillage of maillages) maillageVersObjet.set(maillage, donnees.identifiant)
    }

    function nouvelIdentifiant(type: TypeObjet): string {
        let identifiant: string
        do identifiant = `${type}-${++compteur}`
        while (objets.has(identifiant))
        return identifiant
    }

    function poserForme(type: Exclude<TypeObjet, 'modele'>, x: number, z: number): ObjetCarte {
        const donnees: ObjetCarte = { identifiant: nouvelIdentifiant(type), type, x, z, rotation: 0, echelle: 1 }
        const { pivot, maillages } = construireForme(type)
        enregistrerObjet(donnees, pivot, maillages, 1)
        return donnees
    }

    function retirer(identifiant: string) {
        const objet = objets.get(identifiant)
        if (!objet) return
        for (const maillage of objet.maillages) maillageVersObjet.delete(maillage)
        removeFromScene(scene, objet.pivot)
        objets.delete(identifiant)
    }

    // ----------------------------------------------------------------- pointeur

    const etat: EtatEditeur = { outil: 'selection', typeAPoser: 'ile', selection: null }

    function rayon(evenement: PointerEvent) {
        const cadre = toile.getBoundingClientRect()
        const abscisse = evenement.clientX - cadre.left
        const ordonnee = evenement.clientY - cadre.top
        const rapport = getEffectiveAspectRatio(camera, cadre.width, cadre.height)
        return createPickingRay(abscisse, ordonnee, getViewProjectionMatrix(camera, rapport), cadre.width, cadre.height)
    }

    /** Point du plan de la mer (y = 0) sous le pointeur, en unités de case. Null si le rayon ne touche pas la mer. */
    function pointSurMer(evenement: PointerEvent): { x: number; z: number } | null {
        const vise = rayon(evenement)
        if (!vise || Math.abs(vise.direction[1]) < 1e-9) return null
        const distance = -vise.origin[1] / vise.direction[1]
        if (distance < 0) return null
        const x = (vise.origin[0] + distance * vise.direction[0]) / TAILLE_CASE
        const z = (vise.origin[2] + distance * vise.direction[2]) / TAILLE_CASE
        return { x: Math.max(-LIMITE_POSE, Math.min(LIMITE_POSE, x)), z: Math.max(-LIMITE_POSE, Math.min(LIMITE_POSE, z)) }
    }

    function caseSousPointeur(evenement: PointerEvent): CoordCase | null {
        const point = pointSurMer(evenement)
        return point ? mondeVersCase(point.x * TAILLE_CASE, point.z * TAILLE_CASE) : null
    }

    function objetSousPointeur(evenement: PointerEvent): string | null {
        const vise = rayon(evenement)
        if (!vise) return null
        const resultat = pickMeshesWithRay(maillageVersObjet.keys(), vise)
        return resultat.hit && resultat.pickedMesh ? (maillageVersObjet.get(resultat.pickedMesh as Mesh) ?? null) : null
    }

    function changerSelection(identifiant: string | null) {
        if (etat.selection === identifiant) return
        etat.selection = identifiant
        evenements.surChangement()
    }

    function appliquerCase(caseGrille: CoordCase, bloquer: boolean) {
        const cle = cleCase(caseGrille)
        if (bloquer === bloquees.has(cle)) return
        if (bloquer) bloquees.add(cle)
        else bloquees.delete(cle)
        setSubtreeVisible(dallesBloquees[caseGrille.ligne]![caseGrille.colonne]!, bloquer)
        evenements.surChangement()
    }

    function viderBloquees() {
        for (const cle of [...bloquees]) {
            const [colonne, ligne] = cle.split(',').map(Number)
            appliquerCase({ colonne: colonne!, ligne: ligne! }, false)
        }
    }

    let glissement: { identifiant: string; decalageX: number; decalageZ: number } | null = null
    let peinture: { bloquer: boolean } | null = null

    /**
     * Appelé par la caméra à chaque appui. Renvoie false quand l'éditeur prend le geste
     * (poser, sélectionner/déplacer, peindre) : la caméra ne tourne alors pas.
     */
    function priseEnCharge(evenement: PointerEvent): boolean {
        if (evenement.button !== 0) return true // clic droit / molette : toujours la caméra

        if (etat.outil === 'peindre') {
            const caseGrille = caseSousPointeur(evenement)
            if (!caseGrille) return true
            peinture = { bloquer: !bloquees.has(cleCase(caseGrille)) }
            appliquerCase(caseGrille, peinture.bloquer)
            return false
        }

        const point = pointSurMer(evenement)

        if (etat.outil === 'poser') {
            if (!point) return true
            if (etat.typeAPoser === 'modele') return true // les .glb passent par ajouterModele
            const objet = poserForme(etat.typeAPoser, point.x, point.z)
            changerSelection(objet.identifiant)
            evenements.surChangement()
            if (!evenement.shiftKey) etat.outil = 'selection'
            return false
        }

        const identifiant = objetSousPointeur(evenement)
        changerSelection(identifiant)
        if (!identifiant || !point) return identifiant === null
        const objet = objets.get(identifiant)!
        glissement = { identifiant, decalageX: objet.donnees.x - point.x, decalageZ: objet.donnees.z - point.z }
        return false
    }

    const detacher = attachControl(camera, toile, scene, { shouldHandlePointerDown: priseEnCharge })

    function enMouvement(evenement: PointerEvent) {
        if (peinture) {
            const caseGrille = caseSousPointeur(evenement)
            if (caseGrille) appliquerCase(caseGrille, peinture.bloquer)
            return
        }
        if (glissement) {
            const point = pointSurMer(evenement)
            const objet = objets.get(glissement.identifiant)
            if (!point || !objet) return
            objet.donnees.x = point.x + glissement.decalageX
            objet.donnees.z = point.z + glissement.decalageZ
            majPivot(objet)
            evenements.surChangement()
            return
        }
        if (etat.outil === 'peindre') {
            const caseGrille = caseSousPointeur(evenement)
            if (!caseGrille) {
                setSubtreeVisible(survol, false)
                return
            }
            survol.position.set((caseGrille.colonne - (TAILLE_GRILLE - 1) / 2) * TAILLE_CASE, 0.04, ((TAILLE_GRILLE - 1) / 2 - caseGrille.ligne) * TAILLE_CASE)
            setSubtreeVisible(survol, true)
        } else {
            setSubtreeVisible(survol, false)
        }
    }
    const finGeste = () => {
        glissement = null
        peinture = null
    }
    toile.addEventListener('pointermove', enMouvement)
    window.addEventListener('pointerup', finGeste)
    window.addEventListener('pointercancel', finGeste)

    // ----------------------------------------------------------- ciel et soleil

    const reglages: ReglagesCarte = { ...REGLAGES_PAR_DEFAUT }

    function appliquerReglages() {
        matiereMer.diffuseColor = hslVersRgb(reglages.eauTeinte, 0.55, reglages.eauLuminosite)
        const [r, g, b] = hslVersRgb(reglages.cielTeinte, 0.5, reglages.cielLuminosite)
        scene.clearColor = { r, g, b, a: 1 }
        lumiereCiel.diffuseColor = hslVersRgb(reglages.cielTeinte, 0.35, 0.75)
        const azimut = reglages.soleilAzimut * DEGRES_VERS_RADIANS
        const hauteur = reglages.soleilHauteur * DEGRES_VERS_RADIANS
        // Direction de la lumière : du soleil vers la scène.
        soleil.direction.set(-Math.cos(hauteur) * Math.sin(azimut), -Math.sin(hauteur), -Math.cos(hauteur) * Math.cos(azimut))
        soleil.intensity = reglages.soleilIntensite
    }
    appliquerReglages()

    // -------------------------------------------------------------------- API

    let estLiberee = false
    return {
        etat,
        reglages,
        definirOutil(outil, typeAPoser) {
            etat.outil = outil
            if (typeAPoser) etat.typeAPoser = typeAPoser
            if (outil !== 'peindre') setSubtreeVisible(survol, false)
            evenements.surChangement()
        },
        appliquerReglages,
        objets: () => [...objets.values()].map((objet) => objet.donnees),
        objetSelectionne: () => (etat.selection ? (objets.get(etat.selection)?.donnees ?? null) : null),
        majObjet(identifiant, changements) {
            const objet = objets.get(identifiant)
            if (!objet) return
            Object.assign(objet.donnees, changements)
            objet.donnees.rotation = ((objet.donnees.rotation % 360) + 360) % 360
            objet.donnees.echelle = Number.isFinite(objet.donnees.echelle)
                ? Math.max(ECHELLE_MIN, objet.donnees.echelle)
                : ECHELLE_MIN
            majPivot(objet)
            evenements.surChangement()
        },
        supprimer(identifiant) {
            retirer(identifiant)
            if (etat.selection === identifiant) etat.selection = null
            evenements.surChangement()
        },
        selectionner: changerSelection,
        casesBloquees: () => [...bloquees].map((cle) => {
            const [colonne, ligne] = cle.split(',').map(Number)
            return { colonne: colonne!, ligne: ligne! }
        }),
        viderCasesBloquees: viderBloquees,
        async ajouterModele(modele) {
            try {
                const { pivot, maillages, echelleBase } = await construireModele(modele.donnees)
                modelesBruts.set(modele.fichier, modele.donnees)
                const donnees: ObjetCarte = { identifiant: nouvelIdentifiant('modele'), type: 'modele', fichier: modele.fichier, x: 0, z: 0, rotation: 0, echelle: 1 }
                enregistrerObjet(donnees, pivot, maillages, echelleBase)
                changerSelection(donnees.identifiant)
                evenements.surChangement()
                return donnees
            } catch (erreur) {
                const detail = erreur instanceof Error ? erreur.message : String(erreur)
                throw new Error(`Import de « ${modele.fichier} » impossible : ${detail}`)
            }
        },
        donneesModele: (fichier) => modelesBruts.get(fichier),
        async chargerCarte(carte, modeles) {
            for (const identifiant of [...objets.keys()]) retirer(identifiant)
            modelesBruts.clear()
            etat.selection = null
            viderBloquees()
            Object.assign(reglages, carte.reglages)
            appliquerReglages()
            for (const caseGrille of carte.casesBloquees) appliquerCase(caseGrille, true)
            for (const objet of carte.objets) {
                try {
                    if (objet.type === 'modele') {
                        const octets = objet.fichier ? modeles.get(objet.fichier) : undefined
                        if (!octets) throw new Error(`fichier « ${objet.fichier} » absent du .zip`)
                        const { pivot, maillages, echelleBase } = await construireModele(octets)
                        modelesBruts.set(objet.fichier!, octets)
                        enregistrerObjet({ ...objet }, pivot, maillages, echelleBase)
                    } else {
                        const { pivot, maillages } = construireForme(objet.type)
                        enregistrerObjet({ ...objet }, pivot, maillages, 1)
                    }
                } catch (erreur) {
                    evenements.surErreur(`Objet « ${objet.identifiant} » ignoré : ${erreur instanceof Error ? erreur.message : String(erreur)}`)
                }
            }
            evenements.surChangement()
        },
        exporter(nom) {
            return {
                version: 1,
                nom,
                reglages: { ...reglages },
                objets: [...objets.values()].map(({ donnees }) => ({ ...donnees })),
                casesBloquees: [...bloquees].map((cle) => {
                    const [colonne, ligne] = cle.split(',').map(Number)
                    return { colonne: colonne!, ligne: ligne! }
                }),
            }
        },
        liberer() {
            if (estLiberee) return
            estLiberee = true
            toile.removeEventListener('pointermove', enMouvement)
            window.removeEventListener('pointerup', finGeste)
            window.removeEventListener('pointercancel', finGeste)
            detacher()
            observateurTaille.disconnect()
            stopEngine(moteur)
            disposeScene(scene)
            disposeEngine(moteur)
        },
    }
}
