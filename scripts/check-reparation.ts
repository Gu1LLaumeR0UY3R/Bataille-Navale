// Vérification sans navigateur : réparation par drones et bouclier.
//   pnpm check:reparation
import { evaluerReparation, retirerTir, retirerTirs, tirBloque } from '../src/game/reparation.ts'

const croiseur = { identifiant: 'croiseur', nom: 'Croiseur', longueur: 3, colonne: 2, ligne: 2, horizontal: true }
const flotte = [croiseur]
const erreur = (texte: string): never => { throw new Error(texte) }

// Aucune touche : rien à réparer.
if (evaluerReparation(flotte, [], { colonne: 2, ligne: 2 }).ok) erreur('Réparation acceptée sans aucun tir.')

// Un tir à l'eau n'est pas une touche.
const raté = evaluerReparation(flotte, [{ colonne: 0, ligne: 0 }], { colonne: 0, ligne: 0 })
if (raté.ok || raté.raison !== 'pas-touchee') erreur('Un tir à l\'eau a été accepté comme réparable.')

// Une touche sur un navire à flot : réparable.
const touche = evaluerReparation(flotte, [{ colonne: 2, ligne: 2 }], { colonne: 2, ligne: 2 })
if (!touche.ok) erreur('Une case touchée d\'un navire à flot a été refusée.')

// Les drones réparent tout le navire : toutes ses cases touchées, et seulement les siennes.
const deux = [{ colonne: 2, ligne: 2 }, { colonne: 3, ligne: 2 }, { colonne: 9, ligne: 9 }]
const navire = evaluerReparation(flotte, deux, { colonne: 3, ligne: 2 })
if (!navire.ok) throw new Error('Un navire touché à flot a été refusé.')
if (navire.casesReparees.length !== 2) erreur('La réparation doit couvrir toutes les cases touchées du navire.')
const restants = retirerTirs(deux, navire.casesReparees)
if (restants.length !== 1 || restants[0]!.colonne !== 9) erreur('retirerTirs a retiré un tir étranger au navire.')

// Navire entièrement touché = coulé : plus de réparation.
const tous = [{ colonne: 2, ligne: 2 }, { colonne: 3, ligne: 2 }, { colonne: 4, ligne: 2 }]
const coule = evaluerReparation(flotte, tous, { colonne: 3, ligne: 2 })
if (coule.ok || coule.raison !== 'bateau-coule') erreur('Un navire coulé a été jugé réparable.')

// Après réparation, la case n'est plus touchée.
const apres = retirerTir(tous, { colonne: 3, ligne: 2 })
if (apres.length !== 2 || apres.some((t) => t.colonne === 3)) erreur('La case réparée est restée dans les tirs.')

// Le bouclier ne couvre que la case réparée.
if (!tirBloque([{ colonne: 3, ligne: 2 }], { colonne: 3, ligne: 2 })) erreur('Le bouclier ne bloque pas la case réparée.')
if (tirBloque([{ colonne: 3, ligne: 2 }], { colonne: 2, ligne: 2 })) erreur('Le bouclier bloque une case voisine.')
if (tirBloque([], { colonne: 3, ligne: 2 })) erreur('Un tir est bloqué sans bouclier.')

console.log('OK : réparation (touche, eau, coulé), retrait du tir et bouclier.')
