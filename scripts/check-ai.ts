// Vérification sans navigateur : chaque IA joue N parties seule contre une flotte aléatoire.
// On contrôle qu'elle ne tire jamais deux fois au même endroit, qu'elle finit toujours,
// et que la difficulté est bien croissante (moins de tirs en moyenne = plus fort).
//   pnpm check:ai

import { creerIA, DIFFICULTES } from '../src/game/ai.ts'
import { bateauSurCase, placerFlotteAleatoirement, resoudreTir, tousCoules } from '../src/game/rules.ts'
import { FLOTTE, TAILLE_GRILLE, type CoordCase } from '../src/game/types.ts'

const PARTIES = 500
const moyennes: number[] = []

for (const { valeur, libelle } of DIFFICULTES) {
    let total = 0
    for (let partie = 0; partie < PARTIES; partie++) {
        const flotte = placerFlotteAleatoirement(FLOTTE)
        const ia = creerIA(valeur)
        const tirs: CoordCase[] = []
        while (!tousCoules(flotte, tirs)) {
            const tir = ia.choisirTir()
            if (tirs.some((t) => t.colonne === tir.colonne && t.ligne === tir.ligne)) {
                throw new Error(`${libelle} : tir en double en (${tir.colonne}, ${tir.ligne})`)
            }
            const resultat = resoudreTir(flotte, tirs, tir)
            tirs.push(tir)
            ia.enregistrerResultat(tir, resultat, resultat === 'coule' ? bateauSurCase(flotte, tir) : undefined)
            if (tirs.length > TAILLE_GRILLE * TAILLE_GRILLE) throw new Error(`${libelle} : partie sans fin`)
        }
        total += tirs.length
    }
    moyennes.push(total / PARTIES)
    console.log(`${libelle.padEnd(7)} ${(total / PARTIES).toFixed(1)} tirs en moyenne (${PARTIES} parties)`)
}

if (!(moyennes[0]! > moyennes[1]! && moyennes[1]! > moyennes[2]!)) {
    throw new Error('La difficulté n\'est pas croissante.')
}
console.log('OK : aucun tir en double, difficulté croissante.')
