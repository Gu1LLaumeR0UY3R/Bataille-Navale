// Types et constantes du jeu. Aucune dépendance à Vue ni à BabylonLite :
// ce fichier pourra être réécrit à l'identique côté serveur (PHP) pour valider les coups.

export const TAILLE_GRILLE = 10

/** État d'une case, tel qu'il est affiché dans une grille. */
export type EtatCase = 'eau' | 'bateau' | 'touche' | 'rate' | 'coule'

export interface CoordCase {
    colonne: number // colonne : 0 = gauche
    ligne: number // ligne   : 0 = haut de l'écran
}

export interface Bateau {
    identifiant: string
    nom: string
    longueur: number
    colonne: number // case de départ (extrémité gauche ou haute)
    ligne: number
    horizontal: boolean
}

export interface ModeleBateau {
    identifiant: string
    nom: string
    longueur: number
}

/** La flotte classique de la bataille navale. */
export const FLOTTE: readonly ModeleBateau[] = [
    { identifiant: 'porte_avions', nom: 'Porte-avions', longueur: 5 },
    { identifiant: 'croiseur', nom: 'Croiseur', longueur: 4 },
    { identifiant: 'contre_torpilleur', nom: 'Contre-torpilleur', longueur: 3 },
    { identifiant: 'sous_marin', nom: 'Sous-marin', longueur: 3 },
    { identifiant: 'torpilleur', nom: 'Torpilleur', longueur: 2 },
]

export type ResultatTir = 'rate' | 'touche' | 'coule'

export type Couleur = [number, number, number]