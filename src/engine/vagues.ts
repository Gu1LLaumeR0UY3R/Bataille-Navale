// Vagues : hauteur de l'eau en un point (x, z) à l'instant t, sans rien dépendre de Lite.
// Somme de deux ondes sinusoïdales qui avancent dans des directions différentes.
// Les dalles, marqueurs, bateaux et surbrillances appellent TOUS cette même fonction :
// ils montent et descendent ensemble, sans décalage.

interface Onde {
    /** Hauteur maximale, en unités du monde (une case = 1). */
    amplitude: number
    /** Distance entre deux crêtes, en cases. */
    longueurOnde: number
    /** Vitesse de propagation, en radians par seconde. */
    pulsation: number
    /** Direction de propagation dans le plan (x, z). */
    direction: readonly [number, number]
}

const ONDES: readonly Onde[] = [
    { amplitude: 0.045, longueurOnde: 7, pulsation: 1.3, direction: [1, 0.35] },
    { amplitude: 0.02, longueurOnde: 3.7, pulsation: 1.9, direction: [-0.4, 1] },
]

// Pré-calcul : vecteur d'onde (kx, kz) de chaque onde.
const VECTEURS = ONDES.map((onde) => {
    const norme = Math.hypot(onde.direction[0], onde.direction[1])
    const k = (2 * Math.PI) / onde.longueurOnde
    return { kx: (k * onde.direction[0]) / norme, kz: (k * onde.direction[1]) / norme }
})

/** Hauteur de l'eau en (x, z) à l'instant `temps` (secondes). */
export function hauteurVague(x: number, z: number, temps: number): number {
    let hauteur = 0
    ONDES.forEach((onde, i) => {
        const { kx, kz } = VECTEURS[i]!
        hauteur += onde.amplitude * Math.sin(kx * x + kz * z - onde.pulsation * temps)
    })
    return hauteur
}

/** Pente de la surface en (x, z) : dérivées de la hauteur selon x et selon z. */
export function penteVague(x: number, z: number, temps: number): { x: number, z: number } {
    let penteX = 0
    let penteZ = 0
    ONDES.forEach((onde, i) => {
        const { kx, kz } = VECTEURS[i]!
        const cosinus = onde.amplitude * Math.cos(kx * x + kz * z - onde.pulsation * temps)
        penteX += cosinus * kx
        penteZ += cosinus * kz
    })
    return { x: penteX, z: penteZ }
}
