// L'IA et les outils : à chaque tour, elle peut acheter, poser des défenses gratuites, puis choisir
// UNE action principale (sonar, drone ou tir). Son comportement dépend du niveau :
//   easy   : n'utilise (presque) jamais d'outils ;
//   medium : en achète et en utilise de temps en temps, sans méthode ;
//   hard   : sonar dès qu'elle peut, drones pour sauver un navire menacé, leurres et brouilleur contre un joueur
//            qui scanne. Elle joue avec exactement les mêmes règles et les mêmes prix que le joueur.
// Elle ne triche pas : elle ne connaît de l'adversaire que ce qu'il a fait au grand jour (ses sonars lancés).

import type { Difficulte, IA } from './ai.ts'
import {
    acheter, consommer, definitionOutil, peutAcheter, peutUtiliser, poserBouee,
    type Arsenal, type IdentifiantOutil,
} from './outils.ts'
import { casesBateau } from './rules.ts'
import { TAILLE_GRILLE, type Bateau, type CoordCase } from './types.ts'

export type ActionPrincipale =
    | { type: 'sonar', centre: CoordCase }
    | { type: 'drone', caseGrille: CoordCase }
    | { type: 'tir' }

export type ActionGratuite =
    | { type: 'bouee', caseGrille: CoordCase }
    | { type: 'brouilleur' }

export interface PlanTour {
    /** Outils achetés ce tour (déjà déduits de l'arsenal) : invisibles pour l'adversaire. */
    achats: IdentifiantOutil[]
    /** Défenses posées sans coûter le tour (déjà appliquées à l'arsenal). */
    gratuites: ActionGratuite[]
    /** Ce que fait l'IA ce tour-ci (l'outil principal est déjà consommé de l'arsenal). */
    principale: ActionPrincipale
}

export interface ContexteTourIA {
    niveau: Difficulte
    /** L'arsenal de l'IA : le plan le modifie (achats, outils consommés). */
    arsenal: Arsenal
    ia: IA
    mesBateaux: readonly Bateau[]
    /** Tirs reçus sur sa flotte. */
    tirsRecus: readonly CoordCase[]
    /** Combien de sonars l'adversaire a lancés (visible : il en reçoit le résultat). */
    sonarsAdverses: number
    /** Numéro du tour de l'IA, à partir de 1. */
    tour: number
    hasard: () => number
    /** Outils qu'elle a le droit d'acheter (tous par défaut) : sert aux simulations d'équilibrage. */
    autorises?: readonly IdentifiantOutil[]
}

interface Profil {
    sonar: { achat: number, usage: number, tourMin: number }
    drone: { achat: number, usage: number }
    bouee: { achat: number, ayantEteScannee: boolean }
    brouilleur: { achat: number, sonarsAdversesMin: number }
}

const PROFILS: Record<Difficulte, Profil> = {
    easy: {
        sonar: { achat: 0, usage: 0, tourMin: 99 },
        drone: { achat: 0, usage: 0 },
        bouee: { achat: 0.03, ayantEteScannee: false },
        brouilleur: { achat: 0, sonarsAdversesMin: 99 },
    },
    medium: {
        sonar: { achat: 0.45, usage: 0.6, tourMin: 6 },
        drone: { achat: 0.35, usage: 0.5 },
        bouee: { achat: 0.2, ayantEteScannee: false },
        brouilleur: { achat: 0.15, sonarsAdversesMin: 2 },
    },
    hard: {
        sonar: { achat: 1, usage: 1, tourMin: 3 },
        drone: { achat: 1, usage: 1 },
        bouee: { achat: 1, ayantEteScannee: true },
        brouilleur: { achat: 1, sonarsAdversesMin: 1 },
    },
}

const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

interface NavireAbime { bateau: Bateau, touches: CoordCase[] }

/** Navires touchés mais pas coulés, le plus menacé en premier. */
function naviresAbimes(bateaux: readonly Bateau[], tirs: readonly CoordCase[]): NavireAbime[] {
    const abimes: NavireAbime[] = []
    for (const bateau of bateaux) {
        const cases = casesBateau(bateau)
        const touches = cases.filter((caseBateau) => tirs.some((tir) => memeCase(tir, caseBateau)))
        if (touches.length > 0 && touches.length < cases.length) abimes.push({ bateau, touches })
    }
    return abimes.sort((a, b) => b.touches.length / b.bateau.longueur - a.touches.length / a.bateau.longueur)
}

/** Case libre voisine d'un de ses navires, où une bouée attire le sonar adverse sur la bonne zone. */
function caseLeurre(ctx: ContexteTourIA): CoordCase | null {
    const occupees = ctx.mesBateaux.flatMap((bateau) => casesBateau(bateau))
    const candidates: CoordCase[] = []
    for (const occupee of occupees) {
        for (let dl = -1; dl <= 1; dl++) {
            for (let dc = -1; dc <= 1; dc++) {
                const caseGrille = { colonne: occupee.colonne + dc, ligne: occupee.ligne + dl }
                const dansGrille = caseGrille.colonne >= 0 && caseGrille.colonne < TAILLE_GRILLE &&
                    caseGrille.ligne >= 0 && caseGrille.ligne < TAILLE_GRILLE
                if (!dansGrille || occupees.some((o) => memeCase(o, caseGrille))) continue
                if (ctx.tirsRecus.some((t) => memeCase(t, caseGrille))) continue
                if (ctx.arsenal.bouees.some((b) => memeCase(b.caseGrille, caseGrille))) continue
                if (!candidates.some((c) => memeCase(c, caseGrille))) candidates.push(caseGrille)
            }
        }
    }
    return candidates.length > 0 ? candidates[Math.floor(ctx.hasard() * candidates.length)]! : null
}

export function planifierTour(ctx: ContexteTourIA): PlanTour {
    const profil = PROFILS[ctx.niveau]
    const { arsenal, hasard } = ctx
    const plan: PlanTour = { achats: [], gratuites: [], principale: { type: 'tir' } }
    const abimes = naviresAbimes(ctx.mesBateaux, ctx.tirsRecus)
    const acheterSi = (outil: IdentifiantOutil, probabilite: number) => {
        if (ctx.autorises && !ctx.autorises.includes(outil)) return
        if (probabilite > 0 && peutAcheter(arsenal, outil) && hasard() < probabilite && acheter(arsenal, outil)) plan.achats.push(outil)
    }

    // 1. Achats (ne coûtent pas le tour). Le sonar passe en premier : on met de côté de quoi le payer.
    const veutSonar = profil.sonar.achat > 0 && arsenal.inventaire.sonar < 1
    if (veutSonar) acheterSi('sonar', profil.sonar.achat)
    const reservePourSonar = veutSonar && arsenal.inventaire.sonar < 1 && ctx.tour < 25
    const resteApresAchat = (outil: IdentifiantOutil) =>
        !reservePourSonar || arsenal.poissons - definitionOutil(outil).prix >= definitionOutil('sonar').prix * 0.4

    if (abimes.length > 0 && arsenal.inventaire.drone < 1 && (ctx.niveau !== 'hard' || arsenal.inventaire.sonar >= 1 || ctx.tour >= 12 || abimes[0]!.touches.length >= abimes[0]!.bateau.longueur - 1)) {
        acheterSi('drone', profil.drone.achat)
    }
    const scannee = !profil.bouee.ayantEteScannee || ctx.sonarsAdverses >= 1
    if (scannee && arsenal.inventaire.bouee < 1 && arsenal.bouees.length < 2 && resteApresAchat('bouee')) acheterSi('bouee', profil.bouee.achat)
    if (ctx.sonarsAdverses >= profil.brouilleur.sonarsAdversesMin && arsenal.inventaire.brouilleur < 1 && !arsenal.brouilleurActif && resteApresAchat('brouilleur')) {
        acheterSi('brouilleur', profil.brouilleur.achat)
    }

    // 2. Défenses gratuites : posées tout de suite, avant de jouer.
    if (peutUtiliser(arsenal, 'bouee') && arsenal.bouees.length < 2 && (ctx.niveau === 'hard' || hasard() < 0.6)) {
        const caseGrille = caseLeurre(ctx)
        if (caseGrille && consommer(arsenal, 'bouee')) {
            poserBouee(arsenal, caseGrille)
            plan.gratuites.push({ type: 'bouee', caseGrille })
        }
    }
    if (peutUtiliser(arsenal, 'brouilleur') && consommer(arsenal, 'brouilleur')) {
        arsenal.brouilleurActif = true
        plan.gratuites.push({ type: 'brouilleur' })
    }

    // 3. Action principale : un drone pour sauver un navire menacé, sinon un sonar, sinon un tir.
    const menace = abimes[0]
    const urgent = !!menace && menace.touches.length >= menace.bateau.longueur - 1
    const droneUtile = !!menace && (urgent || menace.touches.length >= 2)
    if (droneUtile && peutUtiliser(arsenal, 'drone') && hasard() < profil.drone.usage) {
        const cible = menace.touches[Math.floor(hasard() * menace.touches.length)]!
        if (consommer(arsenal, 'drone')) {
            plan.principale = { type: 'drone', caseGrille: cible }
            return plan
        }
    }
    if (ctx.tour >= profil.sonar.tourMin && peutUtiliser(arsenal, 'sonar') && hasard() < profil.sonar.usage) {
        if (consommer(arsenal, 'sonar')) plan.principale = { type: 'sonar', centre: ctx.ia.choisirZoneSonar() }
    }
    return plan
}
