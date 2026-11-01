// Simulation d'équilibrage (informative, non bloquante) : que valent les outils ?
// Des duels complets, avec les vraies règles et les vrais prix du catalogue, entre deux IA de même niveau.
// La première reçoit des outils (tous, ou seulement certains), la seconde non. Un score > 50 % veut dire que
// les outils donnent un avantage ; 50 % : ils n'apportent rien.
//   pnpm simu:outils
import type { Difficulte } from '../src/game/ai.ts'
import { jouerDuel } from '../src/game/duel.ts'
import { CATALOGUE_OUTILS, type IdentifiantOutil } from '../src/game/outils.ts'

const N = 600
type Outils = boolean | readonly IdentifiantOutil[]

function victoires(niveauA: Difficulte, outilsA: Outils, niveauB: Difficulte, outilsB: Outils) {
    let gagnees = 0
    let tours = 0
    let sonars = 0
    let drones = 0
    for (let i = 0; i < N; i++) {
        const resultat = jouerDuel({ niveauA, niveauB, outilsA, outilsB, premier: i % 2 ? 'A' : 'B' })
        if (resultat.vainqueur === 'A') gagnees++
        tours += (resultat.toursA + resultat.toursB) / 2
        sonars += resultat.usagesA.sonar
        drones += resultat.usagesA.drone
    }
    return `${String(Math.round((gagnees / N) * 100)).padStart(3)} %   ${(tours / N).toFixed(1)} tours   sonar ${(sonars / N).toFixed(1)}  drone ${(drones / N).toFixed(1)} par partie`
}

console.log('Catalogue : ' + CATALOGUE_OUTILS.map((o) => `${o.nom} ${o.prix} poissons (recharge ${o.recharge})`).join(' · '))
console.log(`\nVictoires du camp équipé, ${N} duels par ligne, niveau Hard contre Hard sans outil :`)
console.log('  tous les outils   :', victoires('hard', true, 'hard', false))
console.log('  sonar seul        :', victoires('hard', ['sonar'], 'hard', false))
console.log('  drone seul        :', victoires('hard', ['drone'], 'hard', false))
console.log('\nLes défenses valent-elles quelque chose ? Tous les outils contre sonar + drone seulement :')
console.log('  Hard              :', victoires('hard', true, 'hard', ['sonar', 'drone']))
console.log('\nPar niveau, tous les outils contre le même niveau sans outil :')
for (const niveau of ['easy', 'medium', 'hard'] as Difficulte[]) console.log(`  ${niveau.padEnd(7)}           :`, victoires(niveau, true, niveau, false))
