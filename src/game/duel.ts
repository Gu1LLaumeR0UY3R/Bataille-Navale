// Duel sans interface : deux camps jouent une partie complète avec les vraies règles (flottes, tirs, sonar,
// leurres, brouilleurs, drones, boucliers, recharges, revenus). Sert à vérifier que le jeu va au bout et à
// équilibrer les prix par simulation ; l'interface suit la même logique, animations en plus.

import { creerIA, type Difficulte, type IA } from './ai.ts'
import { planifierTour } from './iaOutils.ts'
import {
    apresTirAdverse, apresTourAdverse, commencerTour, creerArsenal, resoudreSonar,
    type Arsenal, type IdentifiantOutil,
} from './outils.ts'
import { evaluerReparation, retirerTirs, tirBloque } from './reparation.ts'
import { bateauSurCase, placerFlotteAleatoirement, resoudreTir, tousCoules } from './rules.ts'
import { FLOTTE, type Bateau, type CoordCase } from './types.ts'

export interface Camp {
    nom: string
    niveau: Difficulte
    avecOutils: boolean
    autorises?: readonly IdentifiantOutil[]
    ia: IA
    flotte: Bateau[]
    tirsRecus: CoordCase[]
    arsenal: Arsenal
    sonarsLances: number
    tours: number
    usages: Record<IdentifiantOutil | 'blocages', number>
}

export interface ResultatDuel {
    vainqueur: 'A' | 'B'
    /** Tours joués par chaque camp. */
    toursA: number
    toursB: number
    usagesA: Camp['usages']
    usagesB: Camp['usages']
}

function creerCamp(nom: string, niveau: Difficulte, outils: boolean | readonly IdentifiantOutil[], hasard: () => number): Camp {
    return {
        nom, niveau, avecOutils: outils !== false, autorises: Array.isArray(outils) ? outils : undefined, ia: creerIA(niveau, hasard), flotte: placerFlotteAleatoirement(FLOTTE),
        tirsRecus: [], arsenal: creerArsenal(), sonarsLances: 0, tours: 0,
        usages: { sonar: 0, brouilleur: 0, bouee: 0, drone: 0, blocages: 0 },
    }
}

/** Joue le tour de `camp` contre `adversaire`. Renvoie vrai si l'adversaire n'a plus de navire. */
export function jouerTour(camp: Camp, adversaire: Camp, hasard: () => number): boolean {
    camp.tours++
    commencerTour(camp.arsenal)
    const plan = camp.avecOutils
        ? planifierTour({
            niveau: camp.niveau, arsenal: camp.arsenal, ia: camp.ia, mesBateaux: camp.flotte, tirsRecus: camp.tirsRecus,
            sonarsAdverses: adversaire.sonarsLances, tour: camp.tours, hasard, autorises: camp.autorises,
        })
        : null
    for (const gratuite of plan?.gratuites ?? []) camp.usages[gratuite.type]++

    const principale = plan?.principale ?? { type: 'tir' as const }
    let aTire = false
    if (principale.type === 'sonar') {
        camp.usages.sonar++
        camp.sonarsLances++
        const resultat = resoudreSonar(adversaire.flotte, principale.centre, adversaire.arsenal.bouees.map((b) => b.caseGrille), adversaire.arsenal.brouilleurActif)
        if (resultat.type === 'brouille') adversaire.arsenal.brouilleurActif = false // le brouilleur est consommé
        else camp.ia.enregistrerSonar(principale.centre, resultat.contacts)
    } else if (principale.type === 'drone') {
        camp.usages.drone++
        const diagnostic = evaluerReparation(camp.flotte, camp.tirsRecus, principale.caseGrille)
        if (diagnostic.ok) {
            camp.tirsRecus = retirerTirs(camp.tirsRecus, diagnostic.casesReparees)
            camp.arsenal.boucliers = [...diagnostic.casesReparees]
            for (const caseReparee of diagnostic.casesReparees) adversaire.ia.signalerReparation(caseReparee)
        }
    } else {
        aTire = true
        const tir = camp.ia.choisirTir()
        if (tirBloque(adversaire.arsenal.boucliers, tir)) {
            camp.usages.blocages++
            camp.ia.signalerBouclier(tir)
        } else {
            const resultat = resoudreTir(adversaire.flotte, adversaire.tirsRecus, tir)
            adversaire.tirsRecus.push(tir)
            camp.ia.enregistrerResultat(tir, resultat, resultat === 'coule' ? bateauSurCase(adversaire.flotte, tir) : undefined)
        }
    }
    if (aTire) apresTirAdverse(adversaire.arsenal)
    apresTourAdverse(adversaire.arsenal)
    return tousCoules(adversaire.flotte, adversaire.tirsRecus)
}

export interface OptionsDuel {
    niveauA: Difficulte
    niveauB: Difficulte
    /** `true` : tous les outils ; `false` : aucun ; une liste : seulement ceux-là. */
    outilsA: boolean | readonly IdentifiantOutil[]
    outilsB: boolean | readonly IdentifiantOutil[]
    /** Qui joue en premier. */
    premier?: 'A' | 'B'
    hasard?: () => number
}

export function jouerDuel(options: OptionsDuel): ResultatDuel {
    const hasard = options.hasard ?? Math.random
    const a = creerCamp('A', options.niveauA, options.outilsA, hasard)
    const b = creerCamp('B', options.niveauB, options.outilsB, hasard)
    let courant = options.premier === 'B' ? b : a
    for (let garde = 0; garde < 600; garde++) {
        const adversaire = courant === a ? b : a
        if (jouerTour(courant, adversaire, hasard)) {
            return { vainqueur: courant === a ? 'A' : 'B', toursA: a.tours, toursB: b.tours, usagesA: a.usages, usagesB: b.usages }
        }
        courant = adversaire
    }
    throw new Error('Duel sans fin : aucun camp n\'a coulé la flotte adverse en 600 tours.')
}
