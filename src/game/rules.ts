import { TAILLE_GRILLE, type CoordCase, type EtatCase, type Bateau, type ModeleBateau, type ResultatTir } from './types.ts'

/** Les cases occupées par un bateau. */
export function casesBateau(bateau: Pick<Bateau, 'colonne' | 'ligne' | 'longueur' | 'horizontal'>): CoordCase[] {
    const cases: CoordCase[] = []
    for (let index = 0; index < bateau.longueur; index++) {
        cases.push(bateau.horizontal
            ? { colonne: bateau.colonne + index, ligne: bateau.ligne }
            : { colonne: bateau.colonne, ligne: bateau.ligne + index })
    }
    return cases
}

// Vérif que les coordonnées de la case passée en paramètre
// sont dans la grille
export function estDansGrille(caseGrille: CoordCase): boolean {
    return caseGrille.colonne >= 0 && caseGrille.colonne < TAILLE_GRILLE &&
        caseGrille.ligne >= 0 && caseGrille.ligne < TAILLE_GRILLE
}

/** Un bateau peut-il être posé ici ? (dans la grille, sans chevaucher les autres) */
export function peutPlacer(bateau: Pick<Bateau, 'colonne' | 'ligne' | 'longueur' | 'horizontal'>, autres: readonly Bateau[]): boolean {
    const cases = casesBateau(bateau)

    // "every" : une méthode de la classe Array qui retourne vrai si 
    // toutes les valeurs contenues dans Array passent le test donné en paramètre 
    if (!cases.every(estDansGrille)) return false
    const casesOccupees = new Set(autres.flatMap(casesBateau).map((caseGrille) => `${caseGrille.colonne},${caseGrille.ligne}`))
    return cases.every((caseGrille) => !casesOccupees.has(`${caseGrille.colonne},${caseGrille.ligne}`))
}

export function creerGrilleVide(): EtatCase[][] {
    return Array.from({ length: TAILLE_GRILLE }, () => Array<EtatCase>(TAILLE_GRILLE).fill('eau'))
}

/** Grille « vue par son propriétaire » : on y voit ses bateaux. */
export function grilleDepuisBateaux(bateaux: readonly Bateau[]): EtatCase[][] {
    const grille = creerGrilleVide()
    for (const bateau of bateaux) {
        for (const caseGrille of casesBateau(bateau)) grille[caseGrille.ligne]![caseGrille.colonne] = 'bateau'
    }
    return grille
}

/**
 * Résout un tir. Version locale, utile pour la démo : dans le vrai jeu,
 * c'est le SERVEUR qui calcule le résultat (le client ne connaît jamais la flotte adverse).
 */
export function resoudreTir(bateaux: readonly Bateau[], tirsPrecedents: readonly CoordCase[], tir: CoordCase): ResultatTir {
    const cible = bateaux.find((bateau) =>
        casesBateau(bateau).some((caseGrille) => caseGrille.colonne === tir.colonne && caseGrille.ligne === tir.ligne))
    if (!cible) return 'rate'
    const tousLesTirs = [...tirsPrecedents, tir]
    const coule = casesBateau(cible).every((caseGrille) =>
        tousLesTirs.some((tirPrecedent) => tirPrecedent.colonne === caseGrille.colonne && tirPrecedent.ligne === caseGrille.ligne))
    return coule ? 'coule' : 'touche'
}

/** Un bateau est coulé quand toutes ses cases ont été touchées. */
function estCoule(bateau: Bateau, tirs: readonly CoordCase[]): boolean {
    return casesBateau(bateau).every((caseGrille) =>
        tirs.some((tir) => tir.colonne === caseGrille.colonne && tir.ligne === caseGrille.ligne))
}

export function tousCoules(bateaux: readonly Bateau[], tirs: readonly CoordCase[]): boolean {
    return bateaux.length > 0 && bateaux.every((bateau) => estCoule(bateau, tirs))
}

/**
 * Grille à afficher à partir d'une flotte et des tirs reçus.
 * - revealShips = true  : la grille d'un joueur, qui voit ses propres bateaux ;
 * - revealShips = false : la grille adverse, où l'on ne voit que le résultat des tirs.
 * (Dans le vrai jeu, la grille adverse sera construite à partir des réponses du serveur.)
 */
export function grilleAvecTirs(bateaux: readonly Bateau[], tirs: readonly CoordCase[], revelerBateaux: boolean): EtatCase[][] {
    const grille = revelerBateaux ? grilleDepuisBateaux(bateaux) : creerGrilleVide()
    const casesBateaux = new Set(bateaux.flatMap(casesBateau).map((caseGrille) => `${caseGrille.colonne},${caseGrille.ligne}`))
    for (const tir of tirs) {
        grille[tir.ligne]![tir.colonne] = casesBateaux.has(`${tir.colonne},${tir.ligne}`) ? 'touche' : 'rate'
    }
    for (const bateau of bateaux) {
        if (estCoule(bateau, tirs)) {
            for (const caseGrille of casesBateau(bateau)) grille[caseGrille.ligne]![caseGrille.colonne] = 'coule'
        }
    }
    return grille
}

/** Place toute la flotte au hasard (pratique pour tester, et pour l'adversaire de la démo locale). */
export function placerFlotteAleatoirement(modeles: readonly ModeleBateau[]): Bateau[] {
    const bateaux: Bateau[] = []
    for (const modele of modeles) {
        for (let tentative = 0; tentative < 500; tentative++) {
            const horizontal = Math.random() < 0.5
            const candidat = {
                colonne: Math.floor(Math.random() * (TAILLE_GRILLE - (horizontal ? modele.longueur - 1 : 0))),
                ligne: Math.floor(Math.random() * (TAILLE_GRILLE - (horizontal ? 0 : modele.longueur - 1))),
                longueur: modele.longueur,
                horizontal,
            }
            if (peutPlacer(candidat, bateaux)) {
                bateaux.push({ ...modele, ...candidat })
                break
            }
        }
    }
    return bateaux
}
