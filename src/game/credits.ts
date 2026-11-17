// Données de l'écran de crédits. Une ligne par œuvre utilisée : à tenir synchronisé avec CREDITS.md.
// Quand tu ajoutes un modèle, le tentacule du Kraken, le Man o' War ou une musique, ajoute simplement une entrée ici.

export type CategorieCredit = 'modele' | 'musique'

export interface Credit {
    categorie: CategorieCredit
    titre: string
    /** Auteur : `null` tant qu'il n'est pas renseigné (affiché « Auteur à préciser »). */
    auteur: string | null
    /** Page d'origine de l'œuvre. */
    source: string
    /** Nom court de la licence (`null` tant qu'elle n'est pas renseignée). */
    licence: string | null
    urlLicence?: string
}

const CC_BY_3 = { licence: 'CC-BY 3.0', urlLicence: 'https://creativecommons.org/licenses/by/3.0/' }

export const CREDITS: Credit[] = [
    { categorie: 'modele', titre: 'Ocean (vagues animées ajoutées)', auteur: 'Poly by Google', source: 'https://poly.pizza/m/faUostvShTI', ...CC_BY_3 },
    { categorie: 'modele', titre: 'Submarine', auteur: 'Poly by Google', source: 'https://poly.pizza/m/8PgPdFGg3MO', ...CC_BY_3 },
    { categorie: 'modele', titre: 'low poly battleship', auteur: 'angelo raffaele Catalano', source: 'https://poly.pizza/m/cqV6mUkn7Ow', ...CC_BY_3 },
    { categorie: 'modele', titre: 'Simple Battleship', auteur: 'Thomas de Rivaz', source: 'https://poly.pizza/m/aYAmfkUYZjg', ...CC_BY_3 },
    { categorie: 'modele', titre: 'low poly aircraft carrier with mini jets', auteur: null, source: 'https://sketchfab.com/3d-models/low-poly-aircraft-carrier-with-mini-jets-3d5047d68f064cdca0db39354b567241', licence: null },
    { categorie: 'modele', titre: 'lowpoly USS Hurricane PC-3', auteur: null, source: 'https://sketchfab.com/3d-models/lowpoly-uss-hurricane-pc-3-9582af31655d43ddbb0d3d2af9a037eb', licence: null },
    // À ajouter : le tentacule (CC-BY), le Man o' War, puis les musiques (categorie: 'musique').
]

export const LIBELLES_CATEGORIES: Record<CategorieCredit, string> = {
    modele: 'Modèles 3D',
    musique: 'Musiques',
}
