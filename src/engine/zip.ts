// Mini lecteur/écrivain de .zip, sans dépendance. Écriture : fichiers non compressés ("stored").
// Lecture : "stored" et "deflate" (via DecompressionStream, présent dans les navigateurs WebGPU).

export interface EntreeZip {
    chemin: string
    donnees: Uint8Array
}

const TABLE_CRC = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
})()

function crc32(donnees: Uint8Array): number {
    let crc = 0xffffffff
    for (const octet of donnees) crc = TABLE_CRC[(crc ^ octet) & 0xff]! ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

export function ecrireZip(entrees: readonly EntreeZip[]): Blob {
    const encodeur = new TextEncoder()
    const morceaux: Uint8Array[] = []
    const centrale: Uint8Array[] = []
    let decalage = 0

    for (const entree of entrees) {
        const nom = encodeur.encode(entree.chemin)
        const crc = crc32(entree.donnees)
        const taille = entree.donnees.length

        const local = new DataView(new ArrayBuffer(30))
        local.setUint32(0, 0x04034b50, true)
        local.setUint16(4, 20, true)
        local.setUint16(6, 0x0800, true) // noms en UTF-8
        local.setUint16(8, 0, true) // stored
        local.setUint32(14, crc, true)
        local.setUint32(18, taille, true)
        local.setUint32(22, taille, true)
        local.setUint16(26, nom.length, true)
        morceaux.push(new Uint8Array(local.buffer), nom, entree.donnees)

        const dossier = new DataView(new ArrayBuffer(46))
        dossier.setUint32(0, 0x02014b50, true)
        dossier.setUint16(4, 20, true)
        dossier.setUint16(6, 20, true)
        dossier.setUint16(8, 0x0800, true)
        dossier.setUint32(16, crc, true)
        dossier.setUint32(20, taille, true)
        dossier.setUint32(24, taille, true)
        dossier.setUint16(28, nom.length, true)
        dossier.setUint32(42, decalage, true)
        centrale.push(new Uint8Array(dossier.buffer), nom)

        decalage += 30 + nom.length + taille
    }

    const tailleCentrale = centrale.reduce((somme, morceau) => somme + morceau.length, 0)
    const fin = new DataView(new ArrayBuffer(22))
    fin.setUint32(0, 0x06054b50, true)
    fin.setUint16(8, entrees.length, true)
    fin.setUint16(10, entrees.length, true)
    fin.setUint32(12, tailleCentrale, true)
    fin.setUint32(16, decalage, true)

    return new Blob([...morceaux, ...centrale, new Uint8Array(fin.buffer)] as BlobPart[], { type: 'application/zip' })
}

async function decompresser(compresse: Uint8Array): Promise<Uint8Array> {
    const flux = new Blob([compresse as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(flux).arrayBuffer())
}

export async function lireZip(tampon: ArrayBuffer): Promise<EntreeZip[]> {
    const octets = new Uint8Array(tampon)
    const vue = new DataView(tampon)
    const decodeur = new TextDecoder()

    // Fin du répertoire central : on la cherche depuis la fin du fichier.
    let fin = -1
    for (let position = octets.length - 22; position >= Math.max(0, octets.length - 22 - 65535); position--) {
        if (vue.getUint32(position, true) === 0x06054b50) {
            fin = position
            break
        }
    }
    if (fin < 0) throw new Error("Ce fichier n'est pas un .zip valide.")

    const nombre = vue.getUint16(fin + 10, true)
    let position = vue.getUint32(fin + 16, true)
    const entrees: EntreeZip[] = []

    for (let index = 0; index < nombre; index++) {
        if (vue.getUint32(position, true) !== 0x02014b50) throw new Error('Répertoire du .zip corrompu.')
        const methode = vue.getUint16(position + 10, true)
        const tailleCompressee = vue.getUint32(position + 20, true)
        const longueurNom = vue.getUint16(position + 28, true)
        const longueurExtra = vue.getUint16(position + 30, true)
        const longueurCommentaire = vue.getUint16(position + 32, true)
        const positionLocale = vue.getUint32(position + 42, true)
        const chemin = decodeur.decode(octets.subarray(position + 46, position + 46 + longueurNom))
        position += 46 + longueurNom + longueurExtra + longueurCommentaire

        if (chemin.endsWith('/')) continue // dossier
        const debut = positionLocale + 30 + vue.getUint16(positionLocale + 26, true) + vue.getUint16(positionLocale + 28, true)
        const brut = octets.subarray(debut, debut + tailleCompressee)
        if (methode === 0) entrees.push({ chemin, donnees: brut.slice() })
        else if (methode === 8) entrees.push({ chemin, donnees: await decompresser(brut) })
        else throw new Error(`Méthode de compression ${methode} non gérée dans « ${chemin} ».`)
    }
    return entrees
}
