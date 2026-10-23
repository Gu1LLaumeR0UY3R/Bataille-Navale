import type { Bateau, CoordCase } from './types.ts'
import { casesBateau } from './rules.ts'

export type IdentifiantOutil = 'sonar' | 'brouilleur' | 'bouee' | 'drone'

export interface DefinitionOutil {
    identifiant: IdentifiantOutil
    nom: string
    prix: number
    description: string
    modele?: string
    echelle?: number
}

export const REVENU_PAR_TOUR = 10

export const CATALOGUE_OUTILS: readonly DefinitionOutil[] = [
    { identifiant: 'sonar', nom: 'Sonar 3 × 3', prix: 15, description: 'Recherche une présence dans une zone ennemie.' },
    { identifiant: 'brouilleur', nom: 'Brouilleur', prix: 100, description: 'Bloque le prochain sonar adverse.', modele: 'brouilleur.glb', echelle: 1.4 },
    { identifiant: 'bouee', nom: 'Bouée leurre', prix: 10, description: 'Masque les navires au sonar pendant 2 tours.', modele: 'bouee-leurre.glb', echelle: 0.2 },
    { identifiant: 'drone', nom: 'Drone de réparation', prix: 40, description: 'Répare une case touchée. Réutilisable après 2 tours.', modele: 'drone.glb', echelle: 0.35 },
]

export type InventaireOutils = Record<IdentifiantOutil, number>

export function creerInventaire(): InventaireOutils {
    return { sonar: 0, brouilleur: 0, bouee: 0, drone: 0 }
}

export interface ResultatAchat {
    solde: number
    inventaire: InventaireOutils
}

export function acheterOutil(
    solde: number,
    inventaire: InventaireOutils,
    outil: IdentifiantOutil,
): ResultatAchat | null {
    const definition = CATALOGUE_OUTILS.find((item) => item.identifiant === outil)
    if (!definition || solde < definition.prix) return null
    return {
        solde: solde - definition.prix,
        inventaire: { ...inventaire, [outil]: inventaire[outil] + 1 },
    }
}

export function ajouterRevenu(solde: number): number {
    return solde + REVENU_PAR_TOUR
}

export interface ResultatSonar {
    type: 'brouille' | 'presence' | 'rien' | 'leurre'
    boueesRevelees: CoordCase[]
}

function dansZone(caseGrille: CoordCase, centre: CoordCase): boolean {
    return Math.abs(caseGrille.colonne - centre.colonne) <= 1 &&
        Math.abs(caseGrille.ligne - centre.ligne) <= 1
}

export function resoudreSonar(
    bateaux: readonly Bateau[],
    centre: CoordCase,
    bouees: readonly CoordCase[],
    brouilleurActif: boolean,
): ResultatSonar {
    if (brouilleurActif) return { type: 'brouille', boueesRevelees: [] }

    const boueesDansZone = bouees.filter((bouee) => dansZone(bouee, centre))
    if (boueesDansZone.length > 0) return { type: 'leurre', boueesRevelees: boueesDansZone }

    const presence = bateaux.some((bateau) =>
        casesBateau(bateau).some((caseGrille) => dansZone(caseGrille, centre)))
    return { type: presence ? 'presence' : 'rien', boueesRevelees: [] }
}
