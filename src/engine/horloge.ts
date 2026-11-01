// Pas de temps des animations 3D (vagues, algues, drones, boucliers).
//
// - Jamais plus de 100 ms d'un coup : sur une machine lente ou après un changement d'onglet, l'animation
//   ralentit au lieu de sauter.
// - Pour les tests : `__gelerAnimation = true` fige tout ; pour avancer d'une demi-seconde, on écrit
//   `__pasAnimation = 0.5` puis on incrémente `__versionPas`. Chaque animation applique ce pas une fois
//   (elle retient la version qu'elle a vue), puis tout revient au gel. Sans ces variables, rien ne change.

interface ReglagesTest {
    __gelerAnimation?: boolean
    __pasAnimation?: number
    __versionPas?: number
}

const PAS_MAXIMUM_MS = 100

/** Crée l'horloge d'une animation : à appeler une fois, puis à chaque image avec le delta brut. */
export function creerHorloge(): (deltaMs: number) => number {
    let versionVue = 0
    return (deltaMs) => {
        const test = globalThis as ReglagesTest
        const version = test.__versionPas ?? 0
        if (test.__pasAnimation !== undefined && version !== versionVue) {
            versionVue = version
            return test.__pasAnimation * 1000
        }
        if (test.__gelerAnimation) return 0
        return Math.min(deltaMs, PAS_MAXIMUM_MS)
    }
}
