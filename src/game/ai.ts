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
import { casesZoneSonar } from './outils.ts'

export type Difficulte = 'easy' | 'medium' | 'hard'

export const DIFFICULTES: readonly { valeur: Difficulte, libelle: string }[] = [
    { valeur: 'easy', libelle: 'Easy' },
    { valeur: 'medium', libelle: 'Medium' },
    { valeur: 'hard', libelle: 'Hard' },
]

export interface IA {
    /**
     * Choisit la prochaine case à viser (jamais une case déjà visée, sauf une case réparée).
     * Medium et Hard évitent les cases protégées par un bouclier ; Easy ne les voit pas.
     */
    choisirTir(): CoordCase
    /** À appeler après chaque tir. `bateauCoule` est requis quand le résultat est « coule ». */
    enregistrerResultat(tir: CoordCase, resultat: ResultatTir, bateauCoule?: Bateau): void
    /**
     * Une case que l'IA avait touchée vient d'être réparée (et protégée pour un tour). Elle redevient
     * une case à viser : sans cet appel, l'IA croirait l'avoir déjà tirée et n'y reviendrait jamais.
     * Elle sait qu'un navire s'y trouve, donc elle reste un indice fort.
     */
    signalerReparation(caseGrille: CoordCase): void
    /** Son tir vient d'être bloqué par un bouclier : un navire s'y trouve, elle pourra retirer plus tard. */
    signalerBouclier(caseGrille: CoordCase): void
    /** Centre de la zone 3 × 3 la plus prometteuse à scanner au sonar. */
    choisirZoneSonar(): CoordCase
    /**
     * Résultat d'un sonar : `contacts` sont les cases où il a affiché un navire (vrai ou faux : un leurre
     * est indiscernable). Elles deviennent des cibles prioritaires ; les autres cases de la zone, que le
     * sonar dit vides, deviennent peu probables sans être exclues (un leurre peut mentir).
     */
    enregistrerSonar(centre: CoordCase, contacts: readonly CoordCase[]): void
}

type EtatTir = 'rate' | 'touche' | 'coule'
type Hasard = () => number

const cle = (caseGrille: CoordCase) => `${caseGrille.colonne},${caseGrille.ligne}`

/** Ce que l'IA sait de la grille adverse, uniquement à partir des résultats de ses tirs. */
interface Connaissance {
    etats: Map<string, EtatTir>
    longueursRestantes: number[]
    /** Cases touchées puis réparées : un navire s'y trouve, mais on peut de nouveau les viser. */
    rejouables: Set<string>
    /** Cases protégées par un bouclier pendant ce tour : Medium et Hard ne les visent pas. */
    protegees: Set<string>
    /** Cases où un sonar a affiché un navire : cibles prioritaires. */
    contacts: Set<string>
    /** Cases que un sonar a affichées vides : peu probables, mais jamais exclues (un leurre peut mentir). */
    vides: Set<string>
}

function toutesLesCases(): CoordCase[] {
    const cases: CoordCase[] = []
    for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
        for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) cases.push({ colonne, ligne })
    }
    return cases
}

const casesLibres = (connaissance: Connaissance) =>
    toutesLesCases().filter((caseGrille) =>
        !connaissance.etats.has(cle(caseGrille)) || connaissance.rejouables.has(cle(caseGrille)))

/** Cases que l'on peut viser sans gaspiller le tour sur un bouclier visible. */
const casesVisables = (connaissance: Connaissance) => {
    const libres = casesLibres(connaissance)
    const sansBouclier = libres.filter((caseGrille) => !connaissance.protegees.has(cle(caseGrille)))
    const base = sansBouclier.length > 0 ? sansBouclier : libres
    // Un sonar a dit ces cases vides : on les garde pour la fin, sans jamais les interdire.
    const sansVides = base.filter((caseGrille) => !connaissance.vides.has(cle(caseGrille)))
    return sansVides.length > 0 ? sansVides : base
}

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
    // Une case réparée est une cible évidente : on sait qu'un navire y est.
    for (const caseGrille of casesVisables(connaissance)) {
        if (connaissance.rejouables.has(cle(caseGrille))) voisines.set(cle(caseGrille), caseGrille)
    }
    for (const bouclier of connaissance.protegees) voisines.delete(bouclier)
    if (voisines.size > 0) return choisirAuHasard([...voisines.values()], hasard)

    // Chasse : en damier, car tout bateau (longueur ≥ 2) occupe au moins une case de chaque couleur.
    const libres = casesVisables(connaissance)
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
                    let valeur = 1 + nbTouches * 10
                    // Un sonar a dit ces cases vides : les positions qui les traversent sont bien moins vraisemblables.
                    for (const caseGrille of cases) {
                        if (connaissance.vides.has(cle(caseGrille))) valeur *= 0.1
                    }
                    for (const caseGrille of cases) {
                        const visable = !connaissance.etats.has(cle(caseGrille)) || connaissance.rejouables.has(cle(caseGrille))
                        if (visable) poids[caseGrille.ligne]![caseGrille.colonne]! += valeur
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
        for (const caseGrille of casesVisables(connaissance)) {
            const valeur = poids[caseGrille.ligne]![caseGrille.colonne]!
            if (valeur > meilleurPoids) { meilleurPoids = valeur; meilleures = [caseGrille] }
            else if (valeur === meilleurPoids && valeur > 0) meilleures.push(caseGrille)
        }
        if (meilleures.length > 0) return choisirAuHasard(meilleures, hasard)
    }
    return choisirAuHasard(casesVisables(connaissance), hasard) // secours : ne devrait pas arriver
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
        rejouables: new Set(),
        protegees: new Set(),
        contacts: new Set(),
        vides: new Set(),
    }
    const strategie = STRATEGIES[difficulte]

    return {
        choisirTir() {
            // Un contact de sonar est une case de navire quasi certaine : on y tire d'abord (sauf bouclier visible).
            const contactsVisables = casesLibres(connaissance).filter((caseGrille) =>
                connaissance.contacts.has(cle(caseGrille)) && !connaissance.protegees.has(cle(caseGrille)))
            const tir = contactsVisables.length > 0 ? choisirAuHasard(contactsVisables, hasard) : strategie(connaissance, hasard)
            // Un bouclier ne dure qu'un tour adverse : après ce tir, plus aucune case n'est protégée.
            connaissance.protegees.clear()
            return tir
        },
        signalerReparation(caseGrille) {
            // Easy ne remarque pas les boucliers : il ne les évite pas.
            connaissance.etats.set(cle(caseGrille), 'touche')
            connaissance.rejouables.add(cle(caseGrille))
            if (difficulte !== 'easy') connaissance.protegees.add(cle(caseGrille))
        },
        choisirZoneSonar() {
            const poids = cartePoids(connaissance, false)
            let meilleur: CoordCase = { colonne: 4, ligne: 4 }
            let meilleurTotal = -1
            for (let ligne = 0; ligne < TAILLE_GRILLE; ligne++) {
                for (let colonne = 0; colonne < TAILLE_GRILLE; colonne++) {
                    let total = 0
                    for (let dl = -1; dl <= 1; dl++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const c = colonne + dc
                            const l = ligne + dl
                            if (c < 0 || c >= TAILLE_GRILLE || l < 0 || l >= TAILLE_GRILLE) continue
                            if (!connaissance.etats.has(cle({ colonne: c, ligne: l }))) total += poids?.[l]?.[c] ?? 0
                        }
                    }
                    total += hasard() * 1e-6 // départage les égalités
                    if (total > meilleurTotal) { meilleurTotal = total; meilleur = { colonne, ligne } }
                }
            }
            return meilleur
        },
        enregistrerSonar(centre, contacts) {
            const cleContacts = new Set(contacts.map(cle))
            for (const caseGrille of casesZoneSonar(centre, TAILLE_GRILLE)) {
                const k = cle(caseGrille)
                if (connaissance.etats.has(k) && !connaissance.rejouables.has(k)) continue // déjà connue
                if (cleContacts.has(k)) {
                    connaissance.contacts.add(k)
                    connaissance.vides.delete(k)
                } else {
                    connaissance.vides.add(k)
                }
            }
        },
        signalerBouclier(caseGrille) {
            connaissance.etats.set(cle(caseGrille), 'touche')
            connaissance.rejouables.add(cle(caseGrille))
        },
        enregistrerResultat(tir, resultat, bateauCoule) {
            connaissance.rejouables.delete(cle(tir))
            connaissance.contacts.delete(cle(tir))
            connaissance.vides.delete(cle(tir))
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
