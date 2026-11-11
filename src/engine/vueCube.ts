// Cube de vue : calcule la rotation CSS d'un cube-monde tel que le verrait une caméra orbitale (alpha, beta).
// Convention BabylonLite : repère main gauche (x droite, y haut, z devant), caméra en
// (cos α · sin β, cos β, sin α · sin β) autour de la cible. Le cube CSS est en repère (x droite, y bas, z vers l'œil).
// Les faces sont placées dans le cube avec la même correspondance (x, −y, −z), vérifiée pour chaque vue enregistrée.

type Vec3 = [number, number, number]

const croix = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norme = (v: Vec3): Vec3 => {
    const longueur = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / longueur, v[1] / longueur, v[2] / longueur]
}

export type FaceCube = 'avant' | 'arriere' | 'droite' | 'gauche' | 'dessus'

const NORMALES: Record<FaceCube, Vec3> = {
    avant: [0, 0, -1],
    arriere: [0, 0, 1],
    droite: [1, 0, 0],
    gauche: [-1, 0, 0],
    dessus: [0, 1, 0],
}

export function rotationCube(alpha: number, beta: number): { transformation: string, faceVisee: FaceCube } {
    const sinBeta = Math.sin(beta)
    const position: Vec3 = [Math.cos(alpha) * sinBeta, Math.cos(beta), Math.sin(alpha) * sinBeta]
    const devant: Vec3 = [-position[0], -position[1], -position[2]]
    const droite = norme(croix([0, 1, 0], devant))
    const hautCamera = croix(devant, droite)
    // Écran CSS : x vers la droite, y vers le bas, z vers l'œil.
    const ecran: Vec3[] = [droite, [-hautCamera[0], -hautCamera[1], -hautCamera[2]], [-devant[0], -devant[1], -devant[2]]]
    // Le cube CSS est exprimé en (x, −y, −z) du monde : T = M · diag(1, −1, −1).
    const t = ecran.map((ligne) => [ligne[0], -ligne[1], -ligne[2]])
    const transformation = `matrix3d(${t[0]![0]},${t[1]![0]},${t[2]![0]},0,${t[0]![1]},${t[1]![1]},${t[2]![1]},0,${t[0]![2]},${t[1]![2]},${t[2]![2]},0,0,0,0,1)`
    // La face la plus tournée vers l'œil est celle de la vue courante.
    let faceVisee: FaceCube = 'avant'
    let meilleure = -Infinity
    for (const [nom, n] of Object.entries(NORMALES) as [FaceCube, Vec3][]) {
        const versLOeil = ecran[2]![0]! * n[0] + ecran[2]![1]! * n[1] + ecran[2]![2]! * n[2]
        if (versLOeil > meilleure) {
            meilleure = versLOeil
            faceVisee = nom
        }
    }
    return { transformation, faceVisee }
}
