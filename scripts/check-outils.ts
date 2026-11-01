// Vérification sans navigateur : arsenal, recharges et sonar.
//   pnpm check:outils
import {
    acheter, apresTirAdverse, apresTourAdverse, CATALOGUE_OUTILS, commencerTour, consommer, creerArsenal,
    definitionOutil, DUREE_BOUEE, peutUtiliser, poserBouee, REVENU_PAR_TOUR, resoudreSonar,
} from '../src/game/outils.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const flotte = [{ identifiant: 'torpilleur', nom: 'Torpilleur', longueur: 2, colonne: 4, ligne: 4, horizontal: true }]

// Revenu fixe, achats refusés quand c'est trop cher.
const arsenal = creerArsenal()
commencerTour(arsenal)
if (arsenal.poissons !== REVENU_PAR_TOUR) erreur('Le revenu par tour est incorrect.')
if (acheter(arsenal, 'sonar')) erreur('Un achat trop cher a été accepté.')
arsenal.poissons = definitionOutil('sonar').prix
if (!acheter(arsenal, 'sonar') || arsenal.poissons !== 0 || arsenal.inventaire.sonar !== 1) erreur('Achat sonar incorrect.')
arsenal.poissons = 1000
if (acheter(arsenal, 'sonar') || arsenal.inventaire.sonar !== 1) erreur('Un deuxième exemplaire a été acheté alors que le stock est plein.')
arsenal.poissons = 0

// Recharge : après usage, l'outil est indisponible pendant `recharge` tours, même s'il en reste en stock.
arsenal.inventaire.sonar = 2
if (!consommer(arsenal, 'sonar') || arsenal.inventaire.sonar !== 1) erreur('Le sonar n\'a pas été consommé.')
if (peutUtiliser(arsenal, 'sonar')) erreur('Le sonar est utilisable pendant sa recharge.')
for (let tour = 0; tour < definitionOutil('sonar').recharge - 1; tour++) {
    commencerTour(arsenal)
    if (peutUtiliser(arsenal, 'sonar')) erreur('Le sonar a rechargé trop vite.')
}
commencerTour(arsenal)
if (!peutUtiliser(arsenal, 'sonar')) erreur('Le sonar n\'a pas rechargé à temps.')

// Règles propres à chaque outil : sonar et drone coûtent le tour, bouée et brouilleur non.
const coutTour = Object.fromEntries(CATALOGUE_OUTILS.map((o) => [o.identifiant, o.coutTour]))
if (!coutTour.sonar || !coutTour.drone || coutTour.bouee || coutTour.brouilleur) erreur('Mauvaise règle de coût en tour.')
// Les outils qui font gagner des tours sont les plus chers, et les plus lents à recharger.
if (!(definitionOutil('sonar').prix > definitionOutil('bouee').prix)) erreur('Le sonar doit coûter plus cher que la bouée.')

// Brouilleur : un seul actif à la fois.
arsenal.inventaire.brouilleur = 2
arsenal.brouilleurActif = true
if (peutUtiliser(arsenal, 'brouilleur')) erreur('Deux brouilleurs actifs en même temps.')

// Bouées : vieillissent à chaque tour adverse ; boucliers : tombent après un TIR adverse seulement.
poserBouee(arsenal, { colonne: 1, ligne: 1 })
arsenal.boucliers = [{ colonne: 2, ligne: 2 }]
for (let tour = 0; tour < DUREE_BOUEE; tour++) apresTourAdverse(arsenal)
if (arsenal.bouees.length !== 0) erreur('La bouée n\'a pas expiré.')
if (arsenal.boucliers.length !== 1) erreur('Le bouclier est tombé sans tir adverse.')
apresTirAdverse(arsenal)
if (arsenal.boucliers.length !== 0) erreur('Le bouclier est resté après le tir adverse.')

// Sonar : cases exactes, zone vide, leurre et brouillage.
const exact = resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [], false)
if (exact.type !== 'contacts' || exact.contacts.length !== 2) erreur('Le sonar doit révéler les 2 cases du torpilleur.')
const bord = resoudreSonar(flotte, { colonne: 6, ligne: 4 }, [], false)
if (bord.type !== 'contacts' || bord.contacts.length !== 1) erreur('Le sonar doit révéler seulement les cases de la zone.')
if (resoudreSonar(flotte, { colonne: 0, ligne: 0 }, [], false).type !== 'rien') erreur('Le sonar a signalé à tort un navire.')
const leurre = resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [{ colonne: 5, ligne: 4 }], false)
if (leurre.type !== 'leurre' || leurre.contacts.length !== 1 || leurre.contacts[0]!.colonne !== 5) erreur('Le leurre doit remplacer les vrais navires.')
if (resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [], true).type !== 'brouille') erreur('Le brouilleur n\'a pas bloqué le sonar.')
const coin = resoudreSonar([{ ...flotte[0]!, colonne: 0, ligne: 0 }], { colonne: 0, ligne: 0 }, [], false)
if (coin.contacts.length !== 2) erreur('Le sonar en coin de grille est faux.')

console.log('OK : arsenal, recharges, règles par outil, sonar exact, leurre et brouilleur.')
