<script setup lang="ts">
// Démo LOCALE : l'adversaire est simulé dans le navigateur.
// Quand le serveur PHP existera, les trois endroits marqués « SERVEUR » seront remplacés par des appels réseau.
import { computed, onBeforeUnmount, ref } from 'vue'
import Grille3D from './components/BoardView3D.vue'
import PlacementBateaux from './components/ShipPlacement.vue'
import { tousCoules, grilleAvecTirs, placerFlotteAleatoirement, resoudreTir } from './game/rules.ts'
import { FLOTTE, TAILLE_GRILLE, type CoordCase, type Bateau } from './game/types.ts'

type Etape = 'placement' | 'en_cours' | 'terminee'

const etape = ref<Etape>('placement')
const mesBateaux = ref<Bateau[]>([])
const bateauxAdverses = ref<Bateau[]>([]) // SERVEUR : le client ne connaîtra jamais ceci
const mesTirsChezAdversaire = ref<CoordCase[]>([])
const tirsAdversesChezMoi = ref<CoordCase[]>([])
const aMoiDeJouer = ref(true)
const message = ref('')
const gagnant = ref<'moi' | 'adversaire' | null>(null)

const maGrille = computed(() => grilleAvecTirs(mesBateaux.value, tirsAdversesChezMoi.value, true))
const grilleAdverse = computed(() => grilleAvecTirs(bateauxAdverses.value, mesTirsChezAdversaire.value, false))

let minuterieAdverse: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(minuterieAdverse))

const libellesResultat = { rate: 'À l’eau.', touche: 'Touché !', coule: 'Touché, coulé !' } as const
const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

function demarrerPartie(bateaux: Bateau[]) {
    mesBateaux.value = bateaux
    bateauxAdverses.value = placerFlotteAleatoirement(FLOTTE) // SERVEUR : placement de l'adversaire
    mesTirsChezAdversaire.value = []
    tirsAdversesChezMoi.value = []
    aMoiDeJouer.value = true
    gagnant.value = null
    message.value = 'À vous de tirer.'
    etape.value = 'en_cours'
}

function tirer(caseGrille: CoordCase) {
    if (etape.value !== 'en_cours' || !aMoiDeJouer.value) return
    if (mesTirsChezAdversaire.value.some((tirPrecedent) => memeCase(tirPrecedent, caseGrille))) {
        message.value = 'Vous avez déjà tiré ici.'
        return
    }
    // SERVEUR : POST /api/tirer { colonne, ligne } → { resultat: 'rate' | 'touche' | 'coule' }
    const resultat = resoudreTir(bateauxAdverses.value, mesTirsChezAdversaire.value, caseGrille)
    mesTirsChezAdversaire.value = [...mesTirsChezAdversaire.value, caseGrille]
    message.value = libellesResultat[resultat]
    if (tousCoules(bateauxAdverses.value, mesTirsChezAdversaire.value)) return terminerPartie('moi')
    aMoiDeJouer.value = false
    minuterieAdverse = setTimeout(tirAdverse, 700)
}

function tirAdverse() {
    // SERVEUR : l'adversaire jouera depuis un autre navigateur ; on le récupérera par polling.
    let caseGrille: CoordCase
    do {
        caseGrille = {
            colonne: Math.floor(Math.random() * TAILLE_GRILLE),
            ligne: Math.floor(Math.random() * TAILLE_GRILLE),
        }
    } while (tirsAdversesChezMoi.value.some((tirPrecedent) => memeCase(tirPrecedent, caseGrille)))
    const resultat = resoudreTir(mesBateaux.value, tirsAdversesChezMoi.value, caseGrille)
    tirsAdversesChezMoi.value = [...tirsAdversesChezMoi.value, caseGrille]
    message.value = `L’adversaire tire : ${libellesResultat[resultat].toLowerCase()}`
    if (tousCoules(mesBateaux.value, tirsAdversesChezMoi.value)) return terminerPartie('adversaire')
    aMoiDeJouer.value = true
}

function terminerPartie(vainqueur: 'moi' | 'adversaire') {
    gagnant.value = vainqueur
    etape.value = 'terminee'
    message.value = vainqueur === 'moi'
        ? 'Victoire : la flotte adverse est coulée.'
        : 'Défaite : votre flotte est coulée.'
}

function recommencer() {
    clearTimeout(minuterieAdverse)
    etape.value = 'placement'
}
</script>

<template>
    <main class="application">
        <header class="entete-application">
            <h1>Bataille navale</h1>
            <p v-if="etape !== 'placement'" class="etat-partie" role="status">{{ message }}</p>
        </header>

        <PlacementBateaux v-if="etape === 'placement'" @valider="demarrerPartie" />

        <section v-else class="grilles">
            <figure>
                <figcaption>Ma flotte</figcaption>
                <Grille3D :cases="maGrille" :couleur-fond-marin="[0.2,0.5,0.2]"/>
            </figure>
            <figure>
                <figcaption>Eaux ennemies <small v-if="etape === 'en_cours'">{{ aMoiDeJouer ? '— cliquez pour tirer' : '— l’adversaire joue' }}</small></figcaption>
                <Grille3D :cases="grilleAdverse" :interactif="etape === 'en_cours' && aMoiDeJouer" @clic-case="tirer" :couleur-fond-marin="[0.5,0.2,0.2]" />
            </figure>
            <button v-if="etape === 'terminee'" type="button" class="primary rejouer" @click="recommencer">Nouvelle partie</button>
        </section>
    </main>
</template>

<style>
:root {
    --bleu-marine: #0b1d2e;
    --bleu-marine-clair: #12293f;
    --craie: #e8eef2;
    --attenue: #8fa3b3;
    --ligne: #24425c;
    --signal: #e4572e;
    --police-titres: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    --police-corps: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
*,
*::before,
*::after {
    box-sizing: border-box;
}
body {
    margin: 0;
    min-height: 100vh;
    background: var(--bleu-marine);
    color: var(--craie);
    font-family: var(--police-corps);
    line-height: 1.5;
}
button {
    font: inherit;
    color: var(--craie);
    background: var(--bleu-marine-clair);
    border: 1px solid var(--ligne);
    border-radius: 4px;
    padding: 0.55rem 0.9rem;
    cursor: pointer;
    text-align: left;
}
button:hover:not(:disabled) {
    border-color: var(--attenue);
}
button:focus-visible {
    outline: 2px solid var(--craie);
    outline-offset: 2px;
}
button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
button.principal {
    background: var(--signal);
    border-color: var(--signal);
    color: #fff;
    font-weight: 600;
    text-align: center;
}
</style>

<style scoped>
.application {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1.5rem;
}
.entete-application {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem 2rem;
    margin-bottom: 1.5rem;
}
h1 {
    margin: 0;
    font-family: var(--police-titres);
    font-weight: 600;
    font-size: 2rem;
}
.etat-partie {
    margin: 0;
    font-size: 1.1rem;
}
.grilles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2rem;
}
@media (max-width: 760px) {
    .grilles {
        grid-template-columns: 1fr;
    }
}
figure {
    margin: 0;
}
figcaption {
    margin-bottom: 0.5rem;
    font-family: var(--police-titres);
    font-size: 1.2rem;
}
figcaption small {
    font-family: var(--police-corps);
    font-size: 0.85rem;
    color: var(--attenue);
}
.rejouer {
    grid-column: 1 / -1;
    justify-self: center;
}
</style>
