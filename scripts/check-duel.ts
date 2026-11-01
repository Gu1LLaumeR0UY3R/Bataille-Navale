// Vérification sans navigateur : des parties complètes IA contre IA, avec outils, vont au bout et restent équilibrées.
//   pnpm check:duel
import type { Difficulte } from '../src/game/ai.ts'
import { jouerDuel } from '../src/game/duel.ts'
import type { IdentifiantOutil } from '../src/game/outils.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const N = 400
const part = (niveau: Difficulte, outilsA: boolean | readonly IdentifiantOutil[], outilsB: boolean | readonly IdentifiantOutil[]) => {
    let gagnees = 0
    let usages = 0
    for (let i = 0; i < N; i++) {
        const resultat = jouerDuel({ niveauA: niveau, niveauB: niveau, outilsA, outilsB, premier: i % 2 ? 'A' : 'B' })
        if (resultat.vainqueur === 'A') gagnees++
        usages += resultat.usagesA.sonar + resultat.usagesA.drone
    }
    return { victoires: gagnees / N, usages: usages / N }
}

// 1. Toutes les parties se terminent, quels que soient les niveaux et les outils (aucun blocage, aucune erreur).
for (const niveau of ['easy', 'medium', 'hard'] as Difficulte[]) {
    for (let i = 0; i < 60; i++) jouerDuel({ niveauA: niveau, niveauB: 'hard', outilsA: true, outilsB: true, premier: i % 2 ? 'A' : 'B' })
}

// 2. Les outils comptent : Hard équipé bat nettement Hard sans outil, sonar et drone y contribuent chacun.
const tous = part('hard', true, false)
const sonar = part('hard', ['sonar'], false)
const drone = part('hard', ['drone'], false)
if (tous.victoires < 0.56) erreur(`Les outils n'apportent plus d'avantage à Hard (${Math.round(tous.victoires * 100)} %).`)
if (sonar.victoires < 0.55) erreur(`Le sonar n'apporte plus d'avantage (${Math.round(sonar.victoires * 100)} %).`)
if (drone.victoires < 0.52) erreur(`Les drones n'apportent plus d'avantage (${Math.round(drone.victoires * 100)} %).`)
// 3. Mais aucun ne gagne à tous les coups : le jeu reste disputé.
if (tous.victoires > 0.85) erreur(`Les outils sont trop forts (${Math.round(tous.victoires * 100)} %).`)

// 4. Deux camps équipés à l'identique : aucun avantage structurel pour celui qui joue en premier ou en second.
const miroir = part('hard', true, true)
if (miroir.victoires < 0.42 || miroir.victoires > 0.58) erreur(`Duel miroir déséquilibré (${Math.round(miroir.victoires * 100)} %).`)

// 5. Easy n'utilise (presque) pas ses outils.
if (part('easy', true, false).usages > 0.05) erreur('Easy utilise trop son sonar ou ses drones.')

console.log(`OK : parties complètes ; Hard équipé gagne ${Math.round(tous.victoires * 100)} % (sonar seul ${Math.round(sonar.victoires * 100)} %, drone seul ${Math.round(drone.victoires * 100)} %), miroir ${Math.round(miroir.victoires * 100)} %.`)
