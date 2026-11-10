// Vagues : hauteur de l'eau en un point (x, z) à l'instant t, sans rien dépendre de Lite.
// Les dalles, marqueurs, bateaux, surbrillances ET le maillage de l'eau appellent TOUS cette même fonction :
// tout monte et descend ensemble, sans décalage.
//
// La houle n'est pas une sinusoïde : c'est la somme de six trains d'ondes de longueurs et de directions
// différentes, dont les phases sont déformées par un « bruit » lent (le motif ne se répète jamais à l'œil),
// avec des crêtes plus pointues que les creux, et une force qui varie par rafales.
// L'agitation (0 = calme plat, 1 = tempête) règle la hauteur, le chaos et la quantité d'écume.

interface Composante {
    /** Poids relatif dans la houle (les grandes vagues dominent). */
    poids: number
    /** Distance entre deux crêtes, en cases. */
    longueur: number
    /** Direction de propagation (angle dans le plan x, z, en radians). */
    angle: number
    /** Décalage de phase de départ. */
    phase: number
}

const COMPOSANTES: readonly Composante[] = [
    { poids: 1.0, longueur: 7.5, angle: 0.35, phase: 0.0 },
    { poids: 0.7, longueur: 5.2, angle: -0.5, phase: 1.7 },
    { poids: 0.5, longueur: 3.6, angle: 1.1, phase: 4.1 },
    { poids: 0.38, longueur: 2.6, angle: -1.2, phase: 2.3 },
    { poids: 0.26, longueur: 1.9, angle: 0.2, phase: 5.2 },
    { poids: 0.18, longueur: 1.5, angle: 2.0, phase: 0.9 },
]
const POIDS_TOTAL = COMPOSANTES.reduce((somme, c) => somme + c.poids, 0)
/** Gravité « de jeu » : plus faible que la vraie, pour que la houle avance lentement. ω² = g·k. */
const GRAVITE_JEU = 1.2

const PRECALCUL = COMPOSANTES.map((c) => {
    const k = (2 * Math.PI) / c.longueur
    return { kx: k * Math.cos(c.angle), kz: k * Math.sin(c.angle), omega: Math.sqrt(GRAVITE_JEU * k), amplitude: c.poids / POIDS_TOTAL, phase: c.phase }
})

export const AGITATION_DEFAUT = 0.25
const borner = (valeur: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, valeur))
const lisse = (valeur: number) => {
    const t = borner(valeur)
    return t * t * (3 - 2 * t)
}

/** Hauteur typique d'une grande vague (en unités du monde) pour une agitation donnée. */
export function amplitudeHoule(agitation: number): number {
    return 0.055 + 0.3 * Math.pow(borner(agitation), 1.3)
}

/** Hauteur de l'eau en (x, z) à l'instant `temps` (secondes). */
export function hauteurVague(x: number, z: number, temps: number, agitation = AGITATION_DEFAUT): number {
    const agit = borner(agitation)
    const amplitude = amplitudeHoule(agit)
    // Déformation lente du repère : les crêtes ondulent au lieu d'être des lignes droites.
    const deformation = 0.4 + 1.1 * agit
    const gx = x + deformation * Math.sin(0.37 * z + 0.21 * temps)
    const gz = z + deformation * Math.sin(0.31 * x - 0.17 * temps)
    // Plus l'agitation monte, plus les crêtes sont pointues et les creux larges.
    const pointu = 0.35 + 0.65 * agit
    let hauteur = 0
    for (let i = 0; i < PRECALCUL.length; i++) {
        const onde = PRECALCUL[i]!
        const sinus = Math.sin(onde.kx * gx + onde.kz * gz - onde.omega * temps + onde.phase)
        const u = (1 + sinus) / 2
        const forme = sinus * (1 - pointu) + pointu * 2 * (u * u - 0.375)
        const rafale = 0.8 + 0.2 * Math.sin(0.11 * temps * (i + 1.7) + i * 2.1)
        hauteur += onde.amplitude * rafale * forme
    }
    return amplitude * hauteur
}

/** Pente de la surface en (x, z) : dérivées de la hauteur selon x et selon z (différences finies). */
export function penteVague(x: number, z: number, temps: number, agitation = AGITATION_DEFAUT): { x: number, z: number } {
    const e = 0.05
    return {
        x: (hauteurVague(x + e, z, temps, agitation) - hauteurVague(x - e, z, temps, agitation)) / (2 * e),
        z: (hauteurVague(x, z + e, temps, agitation) - hauteurVague(x, z - e, temps, agitation)) / (2 * e),
    }
}

/**
 * Écume sur les crêtes, de 0 (aucune) à 1 (blanc). Elle apparaît quand la vague dépasse un seuil de hauteur
 * (plus bas quand la mer est agitée) et se déchire en dentelle, comme sur une mer qui déferle.
 * `hauteur` est la valeur déjà calculée par `hauteurVague` au même point.
 */
export function ecumeCrete(hauteur: number, x: number, z: number, temps: number, agitation = AGITATION_DEFAUT): number {
    const agit = borner(agitation)
    const intensite = lisse((agit - 0.1) / 0.45)
    if (intensite <= 0) return 0
    const relative = hauteur / amplitudeHoule(agit)
    const seuil = 0.58 - 0.3 * agit
    // Transition large : l'écume se fond progressivement dans l'eau, sans bord net (qui se verrait en « pixels »).
    const crete = lisse((relative - seuil) / 0.38)
    if (crete <= 0) return 0
    // Trous doux dans l'écume : deux motifs lents, plus larges que le maillage de l'eau.
    const dentelle = 0.78 + 0.22 * Math.sin(2.3 * x + 1.1 * temps + Math.sin(1.3 * z)) * Math.sin(1.9 * z - 0.9 * temps + Math.sin(1.1 * x))
    return borner(crete * crete * dentelle * intensite * 3.4)
}
