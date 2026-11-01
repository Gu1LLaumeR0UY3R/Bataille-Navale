// Vérification sans navigateur : bilan de fin de partie.
//   pnpm check:stats
import { calculerStats, compterNaviresCoules, compterTouches, formaterDuree, rangDeFin } from '../src/game/stats.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const croiseur = { identifiant: 'croiseur', nom: 'Croiseur', longueur: 3, colonne: 1, ligne: 1, horizontal: true }
const torpilleur = { identifiant: 'torpilleur', nom: 'Torpilleur', longueur: 2, colonne: 6, ligne: 6, horizontal: false }
const flotte = [croiseur, torpilleur]

// Tirs : 2 touches sur le croiseur, 1 à l'eau, torpilleur entièrement touché.
const tirs = [
    { colonne: 1, ligne: 1 }, { colonne: 2, ligne: 1 }, { colonne: 9, ligne: 9 },
    { colonne: 6, ligne: 6 }, { colonne: 6, ligne: 7 },
]
if (compterTouches(flotte, tirs) !== 4) erreur('Mauvais compte de touches.')
if (compterNaviresCoules(flotte, tirs) !== 1) erreur('Le torpilleur devrait être le seul navire coulé.')

const stats = calculerStats(tirs, flotte, [{ colonne: 0, ligne: 0 }], flotte, {
    outilsUtilises: 2, boucliersBloques: 1, poissonsGagnes: 60, poissonsDepenses: 25, dureeMs: 432000,
})
if (stats.tirs !== 5 || stats.touches !== 4) erreur('Tirs ou touches incorrects.')
if (Math.abs(stats.precision - 0.8) > 1e-9) erreur('Précision incorrecte.')
if (stats.tours !== 7) erreur('Un outil utilisé doit compter comme un tour.')
if (stats.naviresCoules !== 1 || stats.naviresPerdus !== 0 || stats.naviresTotal !== 2) erreur('Compte de navires incorrect.')
if (calculerStats([], flotte, [], flotte, { outilsUtilises: 0, boucliersBloques: 0, poissonsGagnes: 0, poissonsDepenses: 0, dureeMs: 0 }).precision !== 0) {
    erreur('Sans tir, la précision doit valoir 0 (pas NaN).')
}

if (formaterDuree(432000) !== '7 min 12 s' || formaterDuree(48000) !== '48 s' || formaterDuree(60000) !== '1 min 00 s') erreur('Durée mal formatée.')
if (rangDeFin(true, 30).titre !== 'Amiral de la flotte' || rangDeFin(true, 50).titre !== 'Capitaine émérite') erreur('Mauvais rang de victoire.')
if (rangDeFin(true, 90).titre !== 'Marin tenace' || rangDeFin(false, 20).titre !== 'Naufragé courageux') erreur('Mauvais rang.')
console.log('OK : bilan de partie (touches, navires coulés, précision, durée, rang).')
