// IA de l'adversaire : trois niveaux de difficulté. Aucune dépendance à Vue ni à BabylonLite.
//
//   easy   : tire au hasard sur une case jamais visée.
//   medium : « chasse / cible ». Chasse en damier ; dès qu'un bateau est touché,
//            vise les cases voisines jusqu'à le couler.
//   hard   : carte de probabilités. Pour chaque bateau encore à flot, compte toutes les
//            positions possibles compatibles avec les tirs déjà faits, puis tire sur
//            la case qui revient le plus souvent. Poursuit les touches en priorité.

import { FLOTTE, TAILLE_GRILLE, type Bateau, type CoordCase, type ResultatTir } from './types.ts'
import { casesBateau } from './rules.ts'

export type Difficulte = 'easy' | 'medium' | 'hard'

export const DIFFICULTES: readonly { valeur: Difficulte, libelle: string }[] = [
    { valeur: 'easy', libelle: 'Easy' },
    { valeur: 'medium', libelle: 'Medium' },
    { valeur: 'hard', libelle: 'Hard' },
]

export interface IA {
    /** Choisit la prochaine case à viser (jamais une case déjà visée). */
    choisirTir(): CoordCase
    /** À appeler après chaque tir. `bateauCoule` est requis quand le résultat est « coule ». */
    enregistrerResultat(tir: CoordCase, resultat: ResultatTir, bateauCoule?: Bateau): void
}

type EtatTir = 'rate' | 'touche' | 'coule'
type Hasard = () => number

const cle = (caseGrille: CoordCase) => `${caseGrille.colonne},${caseGrille.ligne}`

/** Ce que l'IA sait de la grille adverse, uniquement à partir des résultats de ses tirs. */
interface Connaissance {
    etats: Map<string, EtatTir>
    longueursRestantes: number[]
}

function toutesLesCases(): CoordCase[] {
    const cases: CoordCase[] = []
    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) cases.push({ colonne, ligne })
    }
    return cases
}

const casesLibres = (connaissance: Connaissance) =>
    toutesLesCases().filter((caseGrille) => !connaissance.etats.has(cle(caseGrille)))

/** Cases touchées dont le bateau n'est pas encore coulé. */
const touchesNonResolues = (connaissance: Connaissance) =>
    toutesLesCases().filter((caseGrille) => connaissance.etats.get(cle(caseGrille)) === 'touche')

function choisirAuHasard<T>(liste: readonly T[], hasard: Hasard): T {
    return liste[Math.floor(hasard() * liste.length)]!
}

// --- Easy -------------------------------------------------------------------------

function tirFacile(connaissance: Connaissance, hasard: Hasard): CoordCase {
    return choisirAuHasard(casesLibres(connaissance), hasard)
}

// --- Medium -----------------------------------------------------------------------

function tirMoyen(connaissance: Connaissance, hasard: Hasard): CoordCase {
    // Cible : une case voisine (haut, bas, gauche, droite) d'une touche non résolue.
    const voisines = new Map<string, CoordCase>()
    for (const touche of touchesNonResolues(connaissance)) {
        const voisins: CoordCase[] = [
            { colonne: touche.colonne - 1, ligne: touche.ligne },
            { colonne: touche.colonne + 1, ligne: touche.ligne },
            { colonne: touche.colonne, ligne: touche.ligne - 1 },
            { colonne: touche.colonne, ligne: touche.ligne + 1 },
        ]
        for (const voisin of voisins) {
            const dansGrille = voisin.colonne >= 0 && voisin.colonne < TAILLE_GRILLE &&
                voisin.ligne >= 0 && voisin.ligne < TAILLE_GRILLE
            if (dansGrille && !connaissance.etats.has(cle(voisin))) voisines.set(cle(voisin), voisin)
        }
    }
    if (voisines.size > 0) return choisirAuHasard([...voisines.values()], hasard)

    // Chasse : en damier, car tout bateau (longueur ≥ 2) occupe au moins une case de chaque couleur.
    const libres = casesLibres(connaissance)
    const damier = libres.filter((caseGrille) => (caseGrille.colonne + caseGrille.ligne) % 2 === 0)
    return choisirAuHasard(damier.length > 0 ? damier : libres, hasard)
}

// --- Hard -------------------------------------------------------------------------

/**
 * Carte de probabilités : pour chaque case, combien de positions de bateaux la couvrent.
 * Si `exigerTouche`, on ne garde que les positions qui recouvrent une touche non résolue
 * (le bateau touché doit bien être quelque part).
 */
function cartePoids(connaissance: Connaissance, exigerTouche: boolean): number[][] | null {
    const poids = Array.from({ length: TAILLE_GRILLE }, () => Array<number>(TAILLE_GRILLE).fill(0))
    let positions = 0

    for (const longueur of connaissance.longueursRestantes) {
        for (const horizontal of [true, false]) {
            const dernierDepartColonne = TAILLE_GRILLE - (horizontal ? longueur : 1)
            const dernierDepartLigne = TAILLE_GRILLE - (horizontal ? 1 : longueur)
            for (let ligne = 0; ligne <= dernierDepartLigne; ligne++) {
                for (let colonne = 0; colonne <= dernierDepartColonne; colonne++) {
                    const cases = casesBateau({ colonne, ligne, longueur, horizontal })
                    let impossible = false
                    let nbTouches = 0
                    for (const caseGrille of cases) {
                        const etat = connaissance.etats.get(cle(caseGrille))
                        if (etat === 'rate' || etat === 'coule') { impossible = true; break }
                        if (etat === 'touche') nbTouches++
                    }
                    if (impossible || (exigerTouche && nbTouches === 0)) continue

                    positions++
                    // Une position qui couvre plusieurs touches est bien plus vraisemblable.
                    const valeur = 1 + nbTouches * 10
                    for (const caseGrille of cases) {
                        if (!connaissance.etats.has(cle(caseGrille))) poids[caseGrille.ligne]![caseGrille.colonne]! += valeur
                    }
                }
            }
        }
    }
    return positions > 0 ? poids : null
}

function tirDifficile(connaissance: Connaissance, hasard: Hasard): CoordCase {
    const poids =
        (touchesNonResolues(connaissance).length > 0 ? cartePoids(connaissance, true) : null) ??
        cartePoids(connaissance, false)

    if (poids) {
        let meilleurPoids = 0
        let meilleures: CoordCase[] = []
        for (const caseGrille of casesLibres(connaissance)) {
            const valeur = poids[caseGrille.ligne]![caseGrille.colonne]!
            if (valeur > meilleurPoids) { meilleurPoids = valeur; meilleures = [caseGrille] }
            else if (valeur === meilleurPoids && valeur > 0) meilleures.push(caseGrille)
        }
        if (meilleures.length > 0) return choisirAuHasard(meilleures, hasard)
    }
    return choisirAuHasard(casesLibres(connaissance), hasard) // secours : ne devrait pas arriver
}

// --- Fabrique ---------------------------------------------------------------------

const STRATEGIES: Record<Difficulte, (connaissance: Connaissance, hasard: Hasard) => CoordCase> = {
    easy: tirFacile,
    medium: tirMoyen,
    hard: tirDifficile,
}

/** `hasard` est injectable pour pouvoir tester l'IA de façon reproductible. */
export function creerIA(difficulte: Difficulte, hasard: Hasard = Math.random): IA {
    const connaissance: Connaissance = {
        etats: new Map(),
        longueursRestantes: FLOTTE.map((modele) => modele.longueur),
    }
    const strategie = STRATEGIES[difficulte]

    return {
        choisirTir: () => strategie(connaissance, hasard),
        enregistrerResultat(tir, resultat, bateauCoule) {
            if (resultat === 'coule' && bateauCoule) {
                for (const caseGrille of casesBateau(bateauCoule)) connaissance.etats.set(cle(caseGrille), 'coule')
                const index = connaissance.longueursRestantes.indexOf(bateauCoule.longueur)
                if (index >= 0) connaissance.longueursRestantes.splice(index, 1)
            } else {
                connaissance.etats.set(cle(tir), resultat === 'rate' ? 'rate' : 'touche')
            }
        },
    }
}
