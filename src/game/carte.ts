// Format d'une carte (décor de la mer + cases bloquées). Aucune dépendance à Vue ni à BabylonLite :
// ce fichier sert à l'éditeur, au jeu, et pourra être réécrit côté serveur (PHP) pour valider les coups.
//
// Dossier d'une carte, à copier dans public/cartes/<nom>/ :
//   carte.json          ce format
//   objets/<fichier>    un .glb par objet de type 'modele' (champ `fichier`)

import { TAILLE_GRILLE, type CoordCase } from './types.ts'

export const VERSION_CARTE = 1
export const ECHELLE_MIN = 0.000001

export type TypeObjet = 'ile' | 'rocher' | 'bouee' | 'modele'

/** Taille de base d'un .glb importé : sa plus grande dimension horizontale vaut ce nombre de cases à l'échelle 1. */
export const CASES_MODELE_BASE = 3

export interface ObjetCarte {
    identifiant: string
    type: TypeObjet
    /** Type 'modele' seulement : nom du fichier dans objets/. */
    fichier?: string
    /** Position libre sur le plan de la mer, en unités de case (0, 0 = centre de la grille). */
    x: number
    z: number
    /** Degrés, sens horaire vu de dessus. */
    rotation: number
    echelle: number
}

export interface ReglagesCarte {
    eauTeinte: number // 0 à 360
    eauLuminosite: number // 0 à 1
    cielTeinte: number
    cielLuminosite: number
    soleilAzimut: number // degrés, 0 à 360
    soleilHauteur: number // degrés au-dessus de l'horizon, 5 à 90
    soleilIntensite: number // 0 à 2
}

export interface CarteJeu {
    version: number
    nom: string
    reglages: ReglagesCarte
    objets: ObjetCarte[]
    /** Cases peintes à la main : aucun bateau ne s'y place, aucun tir n'y va. */
    casesBloquees: CoordCase[]
}

export const REGLAGES_PAR_DEFAUT: Readonly<ReglagesCarte> = {
    eauTeinte: 195,
    eauLuminosite: 0.22,
    cielTeinte: 215,
    cielLuminosite: 0.14,
    soleilAzimut: 120,
    soleilHauteur: 55,
    soleilIntensite: 0.9,
}

export function creerCarteVide(nom = 'ma-carte'): CarteJeu {
    return { version: VERSION_CARTE, nom, reglages: { ...REGLAGES_PAR_DEFAUT }, objets: [], casesBloquees: [] }
}

export const cleCase = (caseGrille: CoordCase): string => `${caseGrille.colonne},${caseGrille.ligne}`

export function ensembleBloque(carte: Pick<CarteJeu, 'casesBloquees'>): Set<string> {
    return new Set(carte.casesBloquees.map(cleCase))
}

/** Nom sûr pour un dossier ou un fichier : minuscules, chiffres, tiret. */
export function nomSur(texte: string, secours: string): string {
    const nom = texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return nom || secours
}

/** Teinte (0-360), saturation et luminosité (0-1) vers RGB (0-1). */
export function hslVersRgb(teinte: number, saturation: number, luminosite: number): [number, number, number] {
    const chroma = (1 - Math.abs(2 * luminosite - 1)) * saturation
    const sexte = (((teinte % 360) + 360) % 360) / 60
    const milieu = chroma * (1 - Math.abs((sexte % 2) - 1))
    const [r, g, b] =
        sexte < 1 ? [chroma, milieu, 0]
        : sexte < 2 ? [milieu, chroma, 0]
        : sexte < 3 ? [0, chroma, milieu]
        : sexte < 4 ? [0, milieu, chroma]
        : sexte < 5 ? [milieu, 0, chroma]
        : [chroma, 0, milieu]
    const decalage = luminosite - chroma / 2
    return [r! + decalage, g! + decalage, b! + decalage]
}

const estNombre = (valeur: unknown): valeur is number => typeof valeur === 'number' && Number.isFinite(valeur)
const borner = (valeur: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, valeur))

/** Valide un JSON lu depuis un fichier. Lève une Error lisible si le fichier n'est pas une carte. */
export function lireCarte(texte: string): CarteJeu {
    let brut: unknown
    try {
        brut = JSON.parse(texte)
    } catch {
        throw new Error('carte.json illisible (JSON invalide).')
    }
    if (typeof brut !== 'object' || brut === null) throw new Error('carte.json : objet attendu.')
    const donnees = brut as Record<string, unknown>
    if (donnees.version !== VERSION_CARTE) throw new Error(`carte.json : version ${String(donnees.version)} non gérée (attendu ${VERSION_CARTE}).`)

    const reglagesBruts = (donnees.reglages ?? {}) as Record<string, unknown>
    const reglages: ReglagesCarte = { ...REGLAGES_PAR_DEFAUT }
    for (const cle of Object.keys(REGLAGES_PAR_DEFAUT) as (keyof ReglagesCarte)[]) {
        const valeur = reglagesBruts[cle]
        if (estNombre(valeur)) reglages[cle] = valeur
    }

    const types: readonly TypeObjet[] = ['ile', 'rocher', 'bouee', 'modele']
    const objets: ObjetCarte[] = []
    for (const [index, objetBrut] of (Array.isArray(donnees.objets) ? donnees.objets : []).entries()) {
        const objet = objetBrut as Record<string, unknown>
        if (!types.includes(objet.type as TypeObjet)) throw new Error(`Objet ${index} : type « ${String(objet.type)} » inconnu.`)
        if (!estNombre(objet.x) || !estNombre(objet.z)) throw new Error(`Objet ${index} : position illisible.`)
        if (objet.type === 'modele' && typeof objet.fichier !== 'string') throw new Error(`Objet ${index} : fichier .glb manquant.`)
        objets.push({
            identifiant: typeof objet.identifiant === 'string' ? objet.identifiant : `objet-${index + 1}`,
            type: objet.type as TypeObjet,
            fichier: typeof objet.fichier === 'string' ? objet.fichier : undefined,
            x: objet.x,
            z: objet.z,
            rotation: estNombre(objet.rotation) ? objet.rotation : 0,
            echelle: estNombre(objet.echelle) ? Math.max(ECHELLE_MIN, objet.echelle) : 1,
        })
    }

    const casesBloquees: CoordCase[] = []
    const dejaVues = new Set<string>()
    for (const caseBrute of Array.isArray(donnees.casesBloquees) ? donnees.casesBloquees : []) {
        const caseGrille = caseBrute as Record<string, unknown>
        if (!estNombre(caseGrille.colonne) || !estNombre(caseGrille.ligne)) continue
        const colonne = Math.trunc(caseGrille.colonne)
        const ligne = Math.trunc(caseGrille.ligne)
        if (colonne < 0 || colonne >= TAILLE_GRILLE || ligne < 0 || ligne >= TAILLE_GRILLE) continue
        const cle = cleCase({ colonne, ligne })
        if (dejaVues.has(cle)) continue
        dejaVues.add(cle)
        casesBloquees.push({ colonne, ligne })
    }

    return { version: VERSION_CARTE, nom: typeof donnees.nom === 'string' ? donnees.nom : 'carte-importee', reglages, objets, casesBloquees }
}
