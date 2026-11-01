// Vérification sans navigateur : l'IA et les cases réparées.
//   pnpm check:ai-reparation
import { creerIA, type Difficulte } from '../src/game/ai.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const cible = { colonne: 4, ligne: 4 }
const memeCase = (a: { colonne: number, ligne: number }, b: { colonne: number, ligne: number }) =>
    a.colonne === b.colonne && a.ligne === b.ligne

/** L'IA touche `cible`, puis cette case est réparée. On regarde ses deux tirs suivants. */
function essai(difficulte: Difficulte) {
    const ia = creerIA(difficulte)
    ia.enregistrerResultat(cible, 'touche')
    ia.signalerReparation(cible)
    const premier = ia.choisirTir()
    ia.enregistrerResultat(premier, 'rate')
    const second = ia.choisirTir()
    return { premier, second }
}

// Medium et Hard voient le bouclier : jamais de tir dessus pendant ce tour.
for (const difficulte of ['medium', 'hard'] as const) {
    for (let i = 0; i < 300; i++) {
        if (memeCase(essai(difficulte).premier, cible)) erreur(`${difficulte} a tiré sur une case protégée.`)
    }
}

// Hard sait qu'un navire se trouve là : il y revient dès que le bouclier tombe.
for (let i = 0; i < 300; i++) {
    if (!memeCase(essai('hard').second, cible)) erreur('Hard n\'est pas revenu sur la case réparée.')
}

// Medium y revient aussi (parmi les cases voisines et la case réparée).
let retoursMedium = 0
for (let i = 0; i < 600; i++) if (memeCase(essai('medium').second, cible)) retoursMedium++
if (retoursMedium < 60) erreur(`Medium revient trop rarement sur la case réparée (${retoursMedium}/600).`)

// Easy ne voit pas le bouclier : il lui arrive de tirer dessus (et de perdre son tour).
let tirsSurBouclier = 0
for (let i = 0; i < 4000; i++) if (memeCase(essai('easy').premier, cible)) tirsSurBouclier++
if (tirsSurBouclier === 0) erreur('Easy ne tire jamais sur une case réparée : il aurait oublié cette case.')

// Sans l'appel de réparation, l'IA ne reviendrait jamais sur sa touche (c'est le problème d'origine).
const oublieuse = creerIA('hard')
oublieuse.enregistrerResultat(cible, 'touche')
for (let i = 0; i < 99; i++) {
    const tir = oublieuse.choisirTir()
    if (memeCase(tir, cible)) erreur('Une case touchée a été visée deux fois sans réparation.')
    oublieuse.enregistrerResultat(tir, 'rate')
}

// Un tir bloqué par un bouclier laisse la case rejouable.
const bloquee = creerIA('hard')
bloquee.signalerBouclier(cible)
let revue = false
for (let i = 0; i < 4 && !revue; i++) {
    const tir = bloquee.choisirTir()
    if (memeCase(tir, cible)) revue = true
    else bloquee.enregistrerResultat(tir, 'rate')
}
if (!revue) erreur('La case bloquée n\'est pas redevenue une cible.')

console.log(`OK : IA et cases réparées (medium revient ${retoursMedium}/600, easy tombe sur le bouclier ${tirsSurBouclier}/4000).`)
