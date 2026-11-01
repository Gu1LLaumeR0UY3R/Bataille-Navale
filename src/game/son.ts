// Effets sonores synthétisés (aucun fichier audio) avec l'API Web Audio.
// Ils respectent les réglages : « Couper tout le son », volume général et volume des effets.
// Le navigateur n'autorise le son qu'après un geste du joueur : le contexte audio est créé au premier
// appel, toujours déclenché par un clic dans le jeu.

import { reglages } from './options.ts'

let contexte: AudioContext | null = null

function obtenirContexte(): AudioContext | null {
    if (reglages.muet) return null
    try {
        contexte ??= new AudioContext()
        if (contexte.state === 'suspended') void contexte.resume()
        return contexte
    } catch {
        return null // pas d'audio disponible : le jeu reste jouable en silence
    }
}

/** Volume final de 0 à 1 : général × effets, avec une marge pour ne jamais surprendre. */
const volume = () => (reglages.volumeGeneral / 100) * (reglages.volumeEffets / 100) * 0.22

interface Note {
    forme?: OscillatorType
    /** Fréquence de départ puis d'arrivée, en Hz. */
    de: number
    vers: number
    /** Décalage de départ et durée, en secondes. */
    debut?: number
    duree: number
    gain?: number
}

function jouer(notes: readonly Note[]) {
    const audio = obtenirContexte()
    const niveau = volume()
    if (!audio || niveau <= 0) return
    const maintenant = audio.currentTime
    for (const note of notes) {
        const depart = maintenant + (note.debut ?? 0)
        const oscillateur = audio.createOscillator()
        const enveloppe = audio.createGain()
        oscillateur.type = note.forme ?? 'sine'
        oscillateur.frequency.setValueAtTime(note.de, depart)
        oscillateur.frequency.exponentialRampToValueAtTime(Math.max(1, note.vers), depart + note.duree)
        // Attaque très courte puis extinction douce : pas de « clic » au début ni à la fin.
        enveloppe.gain.setValueAtTime(0.0001, depart)
        enveloppe.gain.exponentialRampToValueAtTime(niveau * (note.gain ?? 1), depart + 0.012)
        enveloppe.gain.exponentialRampToValueAtTime(0.0001, depart + note.duree)
        oscillateur.connect(enveloppe).connect(audio.destination)
        oscillateur.start(depart)
        oscillateur.stop(depart + note.duree + 0.02)
    }
}

/** Un poisson arrive au compteur : petite bulle qui monte. `rang` fait monter la hauteur d'un poisson à l'autre. */
export function sonPoisson(rang = 0) {
    const base = 520 * Math.pow(1.122, rang)
    jouer([{ de: base, vers: base * 1.7, duree: 0.11, gain: 0.9 }, { forme: 'triangle', de: base * 2, vers: base * 2.6, debut: 0.03, duree: 0.08, gain: 0.35 }])
}

/** Achat : deux pièces qui tintent. */
export function sonAchat() {
    jouer([
        { forme: 'triangle', de: 880, vers: 880, duree: 0.16 },
        { forme: 'triangle', de: 1320, vers: 1320, debut: 0.07, duree: 0.28, gain: 0.8 },
    ])
}

/** Outil pris en main. */
export function sonSelection() {
    jouer([{ forme: 'triangle', de: 420, vers: 640, duree: 0.09, gain: 0.7 }])
}

/** Outil reposé. */
export function sonAnnulation() {
    jouer([{ forme: 'triangle', de: 520, vers: 320, duree: 0.09, gain: 0.6 }])
}

/** Les drones arrivent : un ronronnement qui monte puis redescend. */
export function sonDrones() {
    jouer([
        { forme: 'sawtooth', de: 110, vers: 210, duree: 1.4, gain: 0.35 },
        { forme: 'sawtooth', de: 116, vers: 222, duree: 1.4, gain: 0.3 },
        { forme: 'sawtooth', de: 210, vers: 110, debut: 2.4, duree: 1.2, gain: 0.3 },
    ])
}

/** Réparation terminée : accord qui s'ouvre. */
export function sonReparation() {
    jouer([
        { forme: 'sine', de: 523, vers: 523, duree: 0.5, gain: 0.8 },
        { forme: 'sine', de: 659, vers: 659, debut: 0.08, duree: 0.5, gain: 0.7 },
        { forme: 'sine', de: 784, vers: 784, debut: 0.16, duree: 0.6, gain: 0.7 },
    ])
}

/** Ping de sonar : une note pure qui s'éteint, puis son écho plus faible. */
export function sonSonar() {
    jouer([
        { forme: 'sine', de: 880, vers: 860, duree: 0.7, gain: 0.8 },
        { forme: 'sine', de: 880, vers: 860, debut: 0.45, duree: 0.7, gain: 0.3 },
    ])
}

/** Contacts détectés par le sonar : deux petites notes montantes. */
export function sonContacts() {
    jouer([
        { forme: 'triangle', de: 660, vers: 700, duree: 0.12 },
        { forme: 'triangle', de: 990, vers: 1040, debut: 0.1, duree: 0.2, gain: 0.8 },
    ])
}

/** Tir arrêté par un bouclier : choc métallique qui s'éteint. */
export function sonBouclier() {
    jouer([
        { forme: 'square', de: 300, vers: 90, duree: 0.28, gain: 0.55 },
        { forme: 'sine', de: 1500, vers: 700, duree: 0.4, gain: 0.5 },
    ])
}
