// Outils : catalogue, arsenal (poissons, stock, recharges) et sonar. Logique pure, partagée par le joueur
// et par l'IA : les deux camps jouent avec exactement les mêmes règles.
//
// Chaque outil a SA règle :
// - le sonar et le drone coûtent le tour (on n'a pas tiré) : ils sont puissants, donc chers et à recharge lente ;
// - la bouée leurre et le brouilleur sont gratuits en tour (on peut tirer ensuite) : ce sont des défenses discrètes.
// Un outil utilisé doit ensuite recharger pendant un nombre de tours avant de resservir.

import type { Bateau, CoordCase } from './types.ts'
import { casesBateau } from './rules.ts'

export type IdentifiantOutil = 'sonar' | 'brouilleur' | 'bouee' | 'drone'

export interface DefinitionOutil {
    identifiant: IdentifiantOutil
    nom: string
    prix: number
    /** Tours à attendre avant de pouvoir réutiliser l'outil. */
    recharge: number
    /** Vrai si l'utiliser remplace le tir du tour. */
    coutTour: boolean
    description: string
    /** Où l'utiliser, en une phrase : affiché quand l'outil est en main. */
    usage: string
    /** Aperçu (image low poly), relatif à la racine du site. Absent ou introuvable : pictogramme de secours. */
    image: string
    modele?: string
    echelle?: number
}

/** Poissons reçus au début de chaque tour, pour les deux camps : un revenu fixe, qui ne dépend d'aucun résultat. */
export const REVENU_PAR_TOUR = 10
/** On ne garde qu'un exemplaire de chaque outil à la fois : il faut le rechargeur avant d'en racheter un. */
export const STOCK_MAX = 1
/** Durée d'une bouée leurre, en tours adverses. */
export const DUREE_BOUEE = 4

export const CATALOGUE_OUTILS: readonly DefinitionOutil[] = [
    {
        identifiant: 'sonar', nom: 'Sonar 3 × 3', prix: 150, recharge: 4, coutTour: true,
        description: 'Révèle les cases exactes des navires dans une zone de 3 × 3.',
        usage: 'Cliquez la zone à scanner sur la grille ennemie. Cela coûte votre tour.',
        image: 'images/outils/sonar.png',
    },
    {
        identifiant: 'brouilleur', nom: 'Brouilleur', prix: 40, recharge: 5, coutTour: false,
        description: 'Le prochain sonar adverse ne renvoie rien.',
        usage: 'Activation immédiate : le prochain sonar adverse sera brouillé.',
        image: 'images/outils/brouilleur.png', modele: 'brouilleur.glb', echelle: 1.4,
    },
    {
        identifiant: 'bouee', nom: 'Bouée leurre', prix: 20, recharge: 3, coutTour: false,
        description: 'Un faux navire pour le sonar adverse, pendant 4 tours.',
        usage: 'Cliquez une case libre de votre grille pour y poser la bouée.',
        image: 'images/outils/bouee.png', modele: 'bouee-leurre.glb', echelle: 0.2,
    },
    {
        identifiant: 'drone', nom: 'Drone de réparation', prix: 100, recharge: 5, coutTour: true,
        description: 'Quatre drones réparent toutes les cases touchées d’un navire et les protègent d’un tir.',
        usage: 'Cliquez une case touchée d’un de vos navires pour le réparer. Cela coûte votre tour.',
        image: 'images/outils/drone.png', modele: 'drone.glb', echelle: 0.35,
    },
]

export const definitionOutil = (identifiant: IdentifiantOutil): DefinitionOutil =>
    CATALOGUE_OUTILS.find((outil) => outil.identifiant === identifiant)!

export type InventaireOutils = Record<IdentifiantOutil, number>

export const creerInventaire = (): InventaireOutils => ({ sonar: 0, brouilleur: 0, bouee: 0, drone: 0 })
export const creerRecharges = (): InventaireOutils => ({ sonar: 0, brouilleur: 0, bouee: 0, drone: 0 })

/** Tout ce qu'un camp possède : solde, stock, recharges et outils actifs sur sa propre grille. */
export interface Arsenal {
    poissons: number
    inventaire: InventaireOutils
    /** Tours restants avant réutilisation, par outil (0 = prêt). */
    recharges: InventaireOutils
    /** Bouées posées sur sa grille, avec leur durée restante en tours adverses. */
    bouees: { caseGrille: CoordCase, toursRestants: number }[]
    brouilleurActif: boolean
    /** Cases protégées par un bouclier jusqu'au prochain tir adverse. */
    boucliers: CoordCase[]
}

export const creerArsenal = (): Arsenal => ({
    poissons: 0,
    inventaire: creerInventaire(),
    recharges: creerRecharges(),
    bouees: [],
    brouilleurActif: false,
    boucliers: [],
})

const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

/** Début du tour d'un camp : il reçoit son revenu et ses outils rechargent d'un tour. */
export function commencerTour(arsenal: Arsenal): void {
    arsenal.poissons += REVENU_PAR_TOUR
    for (const outil of CATALOGUE_OUTILS) {
        arsenal.recharges[outil.identifiant] = Math.max(0, arsenal.recharges[outil.identifiant] - 1)
    }
}

export const peutAcheter = (arsenal: Arsenal, outil: IdentifiantOutil): boolean =>
    arsenal.poissons >= definitionOutil(outil).prix && arsenal.inventaire[outil] < STOCK_MAX

/** Achète un exemplaire (ne coûte pas le tour). Renvoie faux si le solde est insuffisant. */
export function acheter(arsenal: Arsenal, outil: IdentifiantOutil): boolean {
    if (!peutAcheter(arsenal, outil)) return false
    arsenal.poissons -= definitionOutil(outil).prix
    arsenal.inventaire[outil] += 1
    return true
}

/** Peut-on utiliser l'outil maintenant ? En stock, rechargé, et pas déjà actif (brouilleur). */
export function peutUtiliser(arsenal: Arsenal, outil: IdentifiantOutil): boolean {
    if (arsenal.inventaire[outil] < 1 || arsenal.recharges[outil] > 0) return false
    return !(outil === 'brouilleur' && arsenal.brouilleurActif)
}

/** Consomme un exemplaire et lance la recharge. À appeler au moment où l'outil est réellement utilisé. */
export function consommer(arsenal: Arsenal, outil: IdentifiantOutil): boolean {
    if (!peutUtiliser(arsenal, outil)) return false
    arsenal.inventaire[outil] -= 1
    arsenal.recharges[outil] = definitionOutil(outil).recharge
    return true
}

export function poserBouee(arsenal: Arsenal, caseGrille: CoordCase): void {
    arsenal.bouees.push({ caseGrille, toursRestants: DUREE_BOUEE })
}

/** Fin d'un tour adverse : les bouées vieillissent. Les boucliers tombent après un TIR adverse (voir `apresTirAdverse`). */
export function apresTourAdverse(arsenal: Arsenal): void {
    arsenal.bouees = arsenal.bouees
        .map((bouee) => ({ ...bouee, toursRestants: bouee.toursRestants - 1 }))
        .filter((bouee) => bouee.toursRestants > 0)
}

/** L'adversaire vient de tirer (touché, raté ou bloqué) : l'immunité de la case réparée prend fin. */
export function apresTirAdverse(arsenal: Arsenal): void {
    arsenal.boucliers = []
}

// --- Sonar ---------------------------------------------------------------------------------------

export interface ResultatSonar {
    /**
     * `contacts` : au moins un navire détecté ; `rien` : zone vide ; `brouille` : le sonar a été brouillé ;
     * `leurre` : la zone contient une bouée, qui apparaît comme un faux navire (et masque les vrais).
     * Pour le scanneur, `contacts` et `leurre` se présentent pareil : un leurre est indiscernable d'un navire.
     */
    type: 'contacts' | 'rien' | 'brouille' | 'leurre'
    /** Cases où le sonar affiche un navire (vrai ou faux). */
    contacts: CoordCase[]
}

export const dansZoneSonar = (caseGrille: CoordCase, centre: CoordCase): boolean =>
    Math.abs(caseGrille.colonne - centre.colonne) <= 1 && Math.abs(caseGrille.ligne - centre.ligne) <= 1

/** Les cases de la zone 3 × 3 qui sont dans la grille. */
export function casesZoneSonar(centre: CoordCase, tailleGrille = 10): CoordCase[] {
    const cases: CoordCase[] = []
    for (let decalageLigne = -1; decalageLigne <= 1; decalageLigne++) {
        for (let decalageColonne = -1; decalageColonne <= 1; decalageColonne++) {
            const colonne = centre.colonne + decalageColonne
            const ligne = centre.ligne + decalageLigne
            if (colonne >= 0 && colonne < tailleGrille && ligne >= 0 && ligne < tailleGrille) cases.push({ colonne, ligne })
        }
    }
    return cases
}

/** Un sonar scanne la flotte `bateaux` (avec ses bouées et son éventuel brouilleur). */
export function resoudreSonar(
    bateaux: readonly Bateau[],
    centre: CoordCase,
    bouees: readonly CoordCase[],
    brouilleurActif: boolean,
): ResultatSonar {
    if (brouilleurActif) return { type: 'brouille', contacts: [] }
    const faux = bouees.filter((bouee) => dansZoneSonar(bouee, centre))
    if (faux.length > 0) return { type: 'leurre', contacts: faux }
    const contacts = casesZoneSonar(centre).filter((caseGrille) =>
        bateaux.some((bateau) => casesBateau(bateau).some((caseBateau) => memeCase(caseBateau, caseGrille))))
    return { type: contacts.length > 0 ? 'contacts' : 'rien', contacts }
}
