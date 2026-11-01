// Vérification sans navigateur : l'IA exploite les résultats d'un sonar.
//   pnpm check:ai-sonar
import { creerIA, type Difficulte } from '../src/game/ai.ts'
import { casesZoneSonar } from '../src/game/outils.ts'

const erreur = (texte: string): never => { throw new Error(texte) }
const memeCase = (a: { colonne: number, ligne: number }, b: { colonne: number, ligne: number }) =>
    a.colonne === b.colonne && a.ligne === b.ligne
const centre = { colonne: 4, ligne: 4 }
const zone = casesZoneSonar(centre)

for (const niveau of ['medium', 'hard'] as Difficulte[]) {
    // Zone dite vide : pas de tir dedans tant qu'il reste d'autres cases.
    const ia = creerIA(niveau)
    ia.enregistrerSonar(centre, [])
    for (let i = 0; i < 80; i++) {
        const tir = ia.choisirTir()
        if (zone.some((c) => memeCase(c, tir))) erreur(`${niveau} a tiré dans une zone que le sonar disait vide (tir ${i + 1}).`)
        ia.enregistrerResultat(tir, 'rate')
    }

    // Contacts : ils sont visés en premier, tous, avant toute autre case.
    const contacts = [{ colonne: 3, ligne: 4 }, { colonne: 5, ligne: 5 }]
    const iaContacts = creerIA(niveau)
    iaContacts.enregistrerSonar(centre, contacts)
    const premiers = [iaContacts.choisirTir()]
    iaContacts.enregistrerResultat(premiers[0]!, 'touche')
    premiers.push(iaContacts.choisirTir())
    if (!contacts.every((c) => premiers.some((p) => memeCase(p, c)))) erreur(`${niveau} n'a pas visé d'abord les contacts du sonar.`)

    // Un leurre peut mentir : si le sonar disait « vide » à tort, l'IA finit quand même par tirer là (pas de blocage).
    const iaMenteur = creerIA(niveau)
    iaMenteur.enregistrerSonar(centre, [])
    let tirsDansZone = 0
    for (let i = 0; i < 100; i++) {
        const tir = iaMenteur.choisirTir()
        if (zone.some((c) => memeCase(c, tir))) tirsDansZone++
        iaMenteur.enregistrerResultat(tir, 'rate')
    }
    if (tirsDansZone !== zone.length) erreur(`${niveau} : les cases « vides » doivent rester jouables (${tirsDansZone}/${zone.length}).`)
}

// Le centre conseillé est toujours dans la grille.
const ia = creerIA('hard')
for (let i = 0; i < 6; i++) {
    const c = ia.choisirZoneSonar()
    if (c.colonne < 0 || c.colonne > 9 || c.ligne < 0 || c.ligne > 9) erreur('Centre de sonar hors grille.')
    ia.enregistrerSonar(c, [])
}
console.log('OK : sonar (contacts visés d\'abord, cases vides évitées sans blocage).')
