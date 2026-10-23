// Chargeur de cartes : lit public/cartes/index.json puis chaque carte.json, valide, et ignore (avec un
// avertissement console) toute carte invalide. Ajouter une carte = ajouter un dossier + une ligne dans index.json,
// sans recompiler.

import type { Couleur } from '../game/types.ts'
import type { Ambiance, Carte, Decor, Vec3 } from './types.ts'

const RACINE = `${import.meta.env.BASE_URL}cartes/`

export const AMBIANCE_DEFAUT: Ambiance = {
    eau: [0.04, 0.4, 0.52],
    ciel: [0.12, 0.36, 0.52],
    lumiereCiel: { couleur: [0.78, 0.9, 1], intensite: 0.85 },
    soleil: { direction: [0.35, -0.85, 0.5], couleur: [1, 0.93, 0.76], intensite: 0.85 },
}

/** Carte de secours : utilisée si aucun fichier de carte n'est lisible. */
export const CARTE_DEFAUT: Carte = {
    id: 'lagon', nom: 'Le lagon', description: 'Mer calme sous un soleil haut.',
    apercu: null, ambiance: AMBIANCE_DEFAUT, decors: [], base: `${RACINE}lagon/`,
}

type Brut = Record<string, unknown>
const estObjet = (valeur: unknown): valeur is Brut => typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
const nombre = (valeur: unknown, defaut: number, min = -Infinity, max = Infinity) =>
    typeof valeur === 'number' && Number.isFinite(valeur) ? Math.min(max, Math.max(min, valeur)) : defaut
const texte = (valeur: unknown, defaut: string) => (typeof valeur === 'string' && valeur.trim() ? valeur.trim().slice(0, 200) : defaut)
const vecteur = (valeur: unknown, defaut: Vec3): Vec3 =>
    Array.isArray(valeur) && valeur.length === 3 ? [nombre(valeur[0], defaut[0]), nombre(valeur[1], defaut[1]), nombre(valeur[2], defaut[2])] : defaut
const couleur = (valeur: unknown, defaut: Couleur): Couleur =>
    Array.isArray(valeur) && valeur.length === 3
        ? [nombre(valeur[0], defaut[0], 0, 1), nombre(valeur[1], defaut[1], 0, 1), nombre(valeur[2], defaut[2], 0, 1)]
        : defaut

function lireAmbiance(brut: unknown): Ambiance {
    const a = estObjet(brut) ? brut : {}
    const ciel = estObjet(a.lumiereCiel) ? a.lumiereCiel : {}
    const soleil = estObjet(a.soleil) ? a.soleil : {}
    const d = AMBIANCE_DEFAUT
    return {
        eau: couleur(a.eau, d.eau),
        ciel: couleur(a.ciel, d.ciel),
        lumiereCiel: {
            couleur: couleur(ciel.couleur, d.lumiereCiel.couleur),
            intensite: nombre(ciel.intensite, d.lumiereCiel.intensite, 0, 3),
        },
        soleil: {
            direction: vecteur(soleil.direction, d.soleil.direction),
            couleur: couleur(soleil.couleur, d.soleil.couleur),
            intensite: nombre(soleil.intensite, d.soleil.intensite, 0, 3),
        },
    }
}

const TYPES_SIMPLES = ['ile', 'rocher', 'bouee'] as const

function lireDecor(brut: unknown): Decor | null {
    if (!estObjet(brut)) return null
    const x = nombre(brut.x, 0, -6.5, 6.5)
    const z = nombre(brut.z, 0, -6.5, 6.5)
    const echelle = nombre(brut.echelle, 1, 0.1, 10)
    const type = brut.type
    if (type === 'modele') {
        // Chemin relatif au dossier de la carte, sans remonter dans l'arborescence.
        if (typeof brut.fichier !== 'string' || brut.fichier.includes('..') || brut.fichier.startsWith('/')) return null
        return { type, fichier: brut.fichier, x, y: nombre(brut.y, 0, -3, 5), z, echelle, rotation: nombre(brut.rotation, 0) }
    }
    return (TYPES_SIMPLES as readonly unknown[]).includes(type) ? { type: type as (typeof TYPES_SIMPLES)[number], x, z, echelle } : null
}

export function lireCarte(brut: unknown, id: string): Carte | null {
    if (!estObjet(brut)) return null
    const decors = Array.isArray(brut.decors) ? brut.decors.slice(0, 60).map(lireDecor).filter((d): d is Decor => d !== null) : []
    const apercu = typeof brut.apercu === 'string' && !brut.apercu.includes('..') && !brut.apercu.startsWith('/') ? brut.apercu : null
    return {
        id,
        nom: texte(brut.nom, id),
        description: texte(brut.description, ''),
        apercu,
        ambiance: lireAmbiance(brut.ambiance),
        decors,
        base: `${RACINE}${id}/`,
    }
}

const ID_VALIDE = /^[a-z0-9][a-z0-9_-]{0,40}$/

async function lireJson(url: string): Promise<unknown> {
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`)
    return reponse.json()
}

let cache: Promise<Carte[]> | null = null

/** Toutes les cartes disponibles (au moins une : la carte de secours). Résultat mis en cache. */
export function chargerCartes(): Promise<Carte[]> {
    cache ??= (async () => {
        const cartes: Carte[] = []
        try {
            const index = await lireJson(`${RACINE}index.json`)
            const ids = estObjet(index) && Array.isArray(index.cartes) ? index.cartes : []
            await Promise.all(ids.map(async (id, position) => {
                if (typeof id !== 'string' || !ID_VALIDE.test(id)) return console.warn(`[cartes] identifiant ignoré : ${String(id)}`)
                try {
                    const carte = lireCarte(await lireJson(`${RACINE}${id}/carte.json`), id)
                    if (carte) cartes[position] = carte
                    else console.warn(`[cartes] ${id} : format invalide`)
                } catch (erreur) {
                    console.warn(`[cartes] ${id} : lecture impossible`, erreur)
                }
            }))
        } catch (erreur) {
            console.warn('[cartes] index.json illisible, carte de secours utilisée', erreur)
        }
        const valides = cartes.filter(Boolean)
        return valides.length ? valides : [CARTE_DEFAUT]
    })()
    return cache
}
