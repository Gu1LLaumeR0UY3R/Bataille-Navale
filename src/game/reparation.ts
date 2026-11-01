// Réparation par drones et immunité de la case réparée. Logique pure : aucune dépendance à Vue ni à la 3D.
//
// Règles :
// - les drones réparent un NAVIRE touché mais ENCORE À FLOT : toutes ses cases touchées redeviennent saines
//   (un navire dont toutes les cases ont été touchées est coulé : plus de réparation possible) ;
// - chaque case réparée reçoit un bouclier pendant un tour adverse : un tir sur l'une d'elles est bloqué et
//   l'adversaire perd son tour ;
// - après ce tour, les boucliers disparaissent et les cases redeviennent des cases de navire comme les autres.

import type { Bateau, CoordCase } from './types.ts'
import { bateauSurCase, casesBateau } from './rules.ts'

export type RaisonRefus = 'pas-touchee' | 'bateau-coule'

export type DiagnosticReparation =
    | { ok: true, bateau: Bateau, /** Les cases touchées du navire : celles que les drones réparent. */ casesReparees: CoordCase[] }
    | { ok: false, raison: RaisonRefus }

const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

/** Peut-on réparer cette case ? `tirs` = tous les tirs reçus par la flotte. */
export function evaluerReparation(
    bateaux: readonly Bateau[],
    tirs: readonly CoordCase[],
    caseGrille: CoordCase,
): DiagnosticReparation {
    const bateau = bateauSurCase(bateaux, caseGrille)
    if (!bateau || !tirs.some((tir) => memeCase(tir, caseGrille))) return { ok: false, raison: 'pas-touchee' }
    const cases = casesBateau(bateau)
    const touchees = cases.filter((caseBateau) => tirs.some((tir) => memeCase(tir, caseBateau)))
    return touchees.length === cases.length ? { ok: false, raison: 'bateau-coule' } : { ok: true, bateau, casesReparees: touchees }
}

/** Les tirs reçus une fois la case réparée : c'est comme si elle n'avait jamais été touchée. */
export function retirerTir(tirs: readonly CoordCase[], caseGrille: CoordCase): CoordCase[] {
    return tirs.filter((tir) => !memeCase(tir, caseGrille))
}

/** Les tirs reçus une fois toutes ces cases réparées. */
export function retirerTirs(tirs: readonly CoordCase[], cases: readonly CoordCase[]): CoordCase[] {
    return tirs.filter((tir) => !cases.some((caseReparee) => memeCase(tir, caseReparee)))
}

/** Un tir sur une de ces cases est-il bloqué par un bouclier ? */
export function tirBloque(boucliers: readonly CoordCase[], tir: CoordCase): boolean {
    return boucliers.some((bouclier) => memeCase(bouclier, tir))
}

export const messagesRefusReparation: Record<RaisonRefus, string> = {
    'pas-touchee': 'Les drones ne réparent qu’un navire touché : visez une de ses cases touchées.',
    'bateau-coule': 'Ce navire est coulé : les drones arrivent trop tard.',
}
