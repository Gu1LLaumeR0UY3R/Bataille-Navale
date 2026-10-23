import { acheterOutil, ajouterRevenu, creerInventaire, REVENU_PAR_TOUR, resoudreSonar } from '../src/game/outils.ts'

const flotte = [{ identifiant: 'torpilleur', nom: 'Torpilleur', longueur: 2, colonne: 4, ligne: 4, horizontal: true }]
const inventaire = creerInventaire()

if (ajouterRevenu(0) !== REVENU_PAR_TOUR) throw new Error('Le revenu par tour est incorrect.')
if (acheterOutil(14, inventaire, 'sonar') !== null) throw new Error('Un achat trop cher a été accepté.')
const achat = acheterOutil(15, inventaire, 'sonar')
if (!achat || achat.solde !== 0 || achat.inventaire.sonar !== 1) throw new Error('Achat sonar incorrect.')

const presence = resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [], false)
if (presence.type !== 'presence') throw new Error('Le sonar n’a pas détecté un navire dans sa zone.')

const absence = resoudreSonar(flotte, { colonne: 0, ligne: 0 }, [], false)
if (absence.type !== 'rien') throw new Error('Le sonar a signalé à tort un navire.')

const leurre = resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [{ colonne: 5, ligne: 4 }], false)
if (leurre.type !== 'leurre' || leurre.boueesRevelees.length !== 1) {
    throw new Error('La bouée leurre ne masque pas la présence des navires.')
}

const brouille = resoudreSonar(flotte, { colonne: 4, ligne: 4 }, [], true)
if (brouille.type !== 'brouille') throw new Error('Le brouilleur n’a pas bloqué le sonar.')

console.log('OK : revenu, achats, sonar, leurre et brouilleur.')
