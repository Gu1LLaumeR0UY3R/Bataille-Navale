// Bilan d'une partie. Logique pure : calculé à partir des tirs et des flottes, rien n'est stocké en double.
import type { Bateau, CoordCase } from './types.ts'
import { bateauSurCase, casesBateau } from './rules.ts'

const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

/** Nombre de tirs qui ont touché un navire. */
export function compterTouches(bateaux: readonly Bateau[], tirs: readonly CoordCase[]): number {
    return tirs.filter((tir) => bateauSurCase(bateaux, tir)).length
}

/** Nombre de navires dont toutes les cases ont été touchées. */
export function compterNaviresCoules(bateaux: readonly Bateau[], tirs: readonly CoordCase[]): number {
    return bateaux.filter((bateau) => casesBateau(bateau).every((caseBateau) => tirs.some((tir) => memeCase(tir, caseBateau)))).length
}

export interface CompteursPartie {
    /** Nombre d'outils utilisés par le joueur (chaque usage coûte un tour). */
    outilsUtilises: number
    boucliersBloques: number
    poissonsGagnes: number
    poissonsDepenses: number
    /** Durée de la partie, en millisecondes. */
    dureeMs: number
}

export interface StatsPartie extends CompteursPartie {
    tirs: number
    touches: number
    /** Part des tirs qui ont touché, de 0 à 1. */
    precision: number
    naviresCoules: number
    naviresPerdus: number
    naviresTotal: number
    /** Tours joués : un tir ou un usage d'outil. */
    tours: number
}

export function calculerStats(
    tirsJoueur: readonly CoordCase[],
    bateauxAdverses: readonly Bateau[],
    tirsAdversaire: readonly CoordCase[],
    mesBateaux: readonly Bateau[],
    compteurs: CompteursPartie,
): StatsPartie {
    const touches = compterTouches(bateauxAdverses, tirsJoueur)
    return {
        ...compteurs,
        tirs: tirsJoueur.length,
        touches,
        precision: tirsJoueur.length > 0 ? touches / tirsJoueur.length : 0,
        naviresCoules: compterNaviresCoules(bateauxAdverses, tirsJoueur),
        naviresPerdus: compterNaviresCoules(mesBateaux, tirsAdversaire),
        naviresTotal: bateauxAdverses.length,
        tours: tirsJoueur.length + compteurs.outilsUtilises,
    }
}

export type RangFin = { titre: string, devise: string }

/** Titre honorifique : on récompense une victoire rapide, on console une défaite. */
export function rangDeFin(victoire: boolean, tirs: number): RangFin {
    if (!victoire) return { titre: 'Naufragé courageux', devise: 'La mer a gagné cette fois. Elle aime les revanches.' }
    if (tirs <= 38) return { titre: 'Amiral de la flotte', devise: 'Une victoire éclair. L’ennemi n’a rien vu venir.' }
    if (tirs <= 55) return { titre: 'Capitaine émérite', devise: 'Un beau tableau de chasse, mené avec sang-froid.' }
    return { titre: 'Marin tenace', devise: 'Il a fallu du temps, mais le dernier navire est au fond.' }
}

/** « 7 min 12 s » ou « 48 s ». */
export function formaterDuree(dureeMs: number): string {
    const secondes = Math.max(0, Math.round(dureeMs / 1000))
    const minutes = Math.floor(secondes / 60)
    return minutes > 0 ? `${minutes} min ${String(secondes % 60).padStart(2, '0')} s` : `${secondes} s`
}
