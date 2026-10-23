// Réglages du joueur, conservés dans le navigateur (localStorage). Le son n'existe pas encore :
// les volumes sont déjà enregistrés pour que le futur moteur audio n'ait qu'à les lire.

import { reactive, watch } from 'vue'

export interface Reglages {
    /** Volumes de 0 à 100. */
    volumeGeneral: number
    volumeMusique: number
    volumeEffets: number
    muet: boolean
    reduireAnimations: boolean
}

const CLE = 'bataille-navale:reglages'
const DEFAUT: Reglages = { volumeGeneral: 80, volumeMusique: 60, volumeEffets: 80, muet: false, reduireAnimations: false }

function charger(): Reglages {
    try {
        const brut = window.localStorage.getItem(CLE)
        return brut ? { ...DEFAUT, ...JSON.parse(brut) } : { ...DEFAUT }
    } catch {
        return { ...DEFAUT }
    }
}

export const reglages = reactive<Reglages>(charger())

function appliquer() {
    document.documentElement.toggleAttribute('data-animations-reduites', reglages.reduireAnimations)
    try {
        window.localStorage.setItem(CLE, JSON.stringify(reglages))
    } catch {
        // stockage indisponible (navigation privée) : les réglages restent valables pour la session
    }
}
watch(reglages, appliquer, { deep: true, immediate: true })

export const reinitialiserReglages = () => Object.assign(reglages, DEFAUT)
