<script setup lang="ts">
// Démo LOCALE : l'adversaire est simulé dans le navigateur.
// Quand le serveur PHP existera, les trois endroits marqués « SERVEUR » seront remplacés par des appels réseau.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import Grille3D from './components/BoardView3D.vue'
import PlacementBateaux from './components/ShipPlacement.vue'
import { bateauSurCase, casesBateau, tousCoules, grilleAvecTirs, placerFlotteAleatoirement, resoudreTir } from './game/rules.ts'
import { creerIA, DIFFICULTES, type Difficulte, type IA } from './game/ai.ts'
import { FLOTTE, type CoordCase, type Bateau } from './game/types.ts'

type Etape = 'placement' | 'en_cours' | 'terminee'

const etape = ref<Etape>('placement')
const mesBateaux = ref<Bateau[]>([])
const bateauxAdverses = ref<Bateau[]>([]) // SERVEUR : le client ne connaîtra jamais ceci
const mesTirsChezAdversaire = ref<CoordCase[]>([])
const tirsAdversesChezMoi = ref<CoordCase[]>([])
const aMoiDeJouer = ref(true)
const message = ref('')
const gagnant = ref<'moi' | 'adversaire' | null>(null)
const difficulte = ref<Difficulte>('medium')
const zoneEtape = ref<HTMLElement | null>(null)
let ia: IA | null = null

const maGrille = computed(() => grilleAvecTirs(mesBateaux.value, tirsAdversesChezMoi.value, true))
const grilleAdverse = computed(() => grilleAvecTirs(bateauxAdverses.value, mesTirsChezAdversaire.value, false))
const bateauxAdversesCoules = computed(() =>
    bateauxAdverses.value.filter((bateau) =>
        casesBateau(bateau).every((caseGrille) =>
            mesTirsChezAdversaire.value.some((tir) => memeCase(tir, caseGrille)))))

let minuterieAdverse: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(minuterieAdverse))

const libellesResultat = { rate: 'À l’eau.', touche: 'Touché !', coule: 'Touché, coulé !' } as const
const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

function afficherEtape() {
    void nextTick(() => zoneEtape.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function demarrerPartie(bateaux: Bateau[]) {
    mesBateaux.value = bateaux
    bateauxAdverses.value = placerFlotteAleatoirement(FLOTTE) // SERVEUR : placement de l'adversaire
    ia = creerIA(difficulte.value)
    mesTirsChezAdversaire.value = []
    tirsAdversesChezMoi.value = []
    aMoiDeJouer.value = true
    gagnant.value = null
    message.value = 'À vous de tirer.'
    etape.value = 'en_cours'
    afficherEtape()
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
    if (!ia) return
    const caseGrille = ia.choisirTir()
    const resultat = resoudreTir(mesBateaux.value, tirsAdversesChezMoi.value, caseGrille)
    ia.enregistrerResultat(caseGrille, resultat, resultat === 'coule' ? bateauSurCase(mesBateaux.value, caseGrille) : undefined)
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
    afficherEtape()
}

function recommencer() {
    clearTimeout(minuterieAdverse)
    etape.value = 'placement'
    afficherEtape()
}
</script>

<template>
    <main class="application">
        <header class="entete-application">
            <a class="marque" href="#" aria-label="Bataille navale, accueil" @click.prevent="recommencer">
                <span class="marque-icone" aria-hidden="true">✦</span>
                <span class="marque-texte">L’Archipel <small>CLUB NAUTIQUE</small></span>
            </a>
            <div class="entete-droite">
                <span class="badge-etape"><span class="point-etat"></span>{{ etape === 'placement' ? 'Préparation' : etape === 'en_cours' ? 'Partie en cours' : 'Partie terminée' }}</span>
                <p v-if="etape !== 'placement'" class="etat-partie" role="status">{{ message }}</p>
            </div>
        </header>

        <div ref="zoneEtape" class="zone-etape">
            <template v-if="etape === 'placement'">
                <section class="intro">
                    <p class="surtitre">BIENVENUE AUX CARAÏBES</p>
                    <h1>Cap sur la victoire<span>.</span></h1>
                    <p>Préparez votre flotte, trouvez votre cap, puis prenez le large.</p>
                </section>
                <fieldset class="difficulte">
                    <legend>Difficulté de l’adversaire</legend>
                    <label v-for="option in DIFFICULTES" :key="option.valeur" class="choix-difficulte">
                        <input v-model="difficulte" type="radio" name="difficulte" :value="option.valeur" />
                        <span>{{ option.libelle }}</span>
                    </label>
                </fieldset>
                <PlacementBateaux @valider="demarrerPartie" />
            </template>

            <template v-else>
                <section class="intro intro-partie">
                    <p class="surtitre">EN MER — {{ gagnant ? 'MISSION ACCOMPLIE' : 'À VOUS DE JOUER' }}</p>
                    <h1>{{ gagnant ? (gagnant === 'moi' ? 'Quelle victoire !' : 'La mer aura le dernier mot.') : 'La bataille fait rage' }}<span>.</span></h1>
                    <p>{{ message }}</p>
                </section>
                <section class="grilles">
                    <figure class="carte-grille">
                        <figcaption><span class="etiquette-grille">VOTRE FLOTTE</span><strong>Le port d’attache</strong><small>{{ mesBateaux.length }} navires en mer</small></figcaption>
                        <Grille3D :cases="maGrille" :bateaux="mesBateaux" :couleur-fond-marin="[0.2,0.5,0.2]" />
                    </figure>
                    <figure class="carte-grille" :class="{ 'cible-active': etape === 'en_cours' && aMoiDeJouer }">
                        <figcaption><span class="etiquette-grille">ZONE ENNEMIE</span><strong>Le large inconnu</strong><small>{{ etape === 'en_cours' ? (aMoiDeJouer ? 'Choisissez une case pour tirer' : 'L’adversaire joue…') : 'Fin de la partie' }}</small></figcaption>
                        <Grille3D :cases="grilleAdverse" :bateaux="bateauxAdversesCoules" :interactif="etape === 'en_cours' && aMoiDeJouer" @clic-case="tirer" :couleur-fond-marin="[0.5,0.2,0.2]" />
                    </figure>
                </section>
                <button v-if="etape === 'terminee'" type="button" class="bouton-principal rejouer" @click="recommencer">⚓ Rejouer une partie</button>
            </template>
        </div>
    </main>
</template>

<style>
:root {
    --bleu-marine: #073b43;
    --bleu-marine-clair: #0d5558;
    --craie: #fffdf4;
    --attenue: #9dc3b7;
    --ligne: rgb(255 255 255 / 15%);
    --signal: #ff795b;
    --soleil: #f8c95b;
    --menthe: #73d4b5;
    --police-titres: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
    --police-corps: 'Avenir Next', Avenir, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
*,
*::before,
*::after {
    box-sizing: border-box;
}
body {
    margin: 0;
    min-height: 100vh;
    background:
        radial-gradient(ellipse at 8% 4%, rgb(74 190 146 / 18%), transparent 32rem),
        radial-gradient(ellipse at 92% 28%, rgb(248 201 91 / 14%), transparent 28rem),
        linear-gradient(150deg, #062f39 0%, #075052 48%, #08706b 100%);
    color: var(--craie);
    font-family: var(--police-corps);
    line-height: 1.5;
}
body::before {
    position: fixed;
    z-index: -1;
    inset: 0;
    background-image: radial-gradient(rgb(255 255 255 / 18%) 0.7px, transparent 0.7px);
    background-size: 22px 22px;
    content: '';
    opacity: 0.12;
    pointer-events: none;
}
button {
    font: inherit;
    color: var(--craie);
    background: rgb(255 255 255 / 8%);
    border: 1px solid var(--ligne);
    border-radius: 12px;
    padding: 0.7rem 1rem;
    cursor: pointer;
    text-align: center;
    transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
button:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: rgb(255 255 255 / 45%);
    background: rgb(255 255 255 / 13%);
}
button:focus-visible {
    outline: 3px solid var(--soleil);
    outline-offset: 2px;
}
button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.bouton-principal,
button.principal {
    border-color: transparent;
    background: linear-gradient(135deg, #ff8862, #f45e4c);
    box-shadow: 0 9px 22px rgb(241 94 76 / 25%);
    color: #fffdf4;
    font-weight: 600;
    text-align: center;
}
.bouton-principal:hover:not(:disabled),
button.principal:hover:not(:disabled) {
    border-color: transparent;
    background: linear-gradient(135deg, #ff9876, #fa705b);
    box-shadow: 0 12px 26px rgb(241 94 76 / 35%);
}
</style>

<style scoped>
.application {
    position: relative;
    isolation: isolate;
    max-width: 1380px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 1.25rem clamp(1rem, 4vw, 3.5rem) 4rem;
}
.entete-application {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem 2rem;
    padding: 0.4rem 0 1.2rem;
    border-bottom: 1px solid var(--ligne);
}
.marque {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--craie);
    text-decoration: none;
}
.marque-icone {
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    place-items: center;
    border: 1px solid rgb(248 201 91 / 55%);
    border-radius: 50%;
    background: rgb(248 201 91 / 10%);
    color: var(--soleil);
    font-size: 1.25rem;
}
.marque-texte {
    font-family: var(--police-titres);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.015em;
}
.marque-texte small {
    display: block;
    color: var(--attenue);
    font-family: var(--police-corps);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.2em;
}
.entete-droite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem 1rem;
}
.badge-etape {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--ligne);
    border-radius: 999px;
    background: rgb(255 255 255 / 5%);
    color: #e4f5e8;
    font-size: 0.78rem;
    font-weight: 650;
}
.point-etat {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--menthe);
    box-shadow: 0 0 10px rgb(115 212 181 / 75%);
}
.zone-etape {
    scroll-margin-top: 1.25rem;
}
.intro {
    position: relative;
    padding: clamp(2rem, 5vw, 4rem) 0 1.3rem;
}
.intro::after {
    position: absolute;
    top: 1.8rem;
    right: clamp(0rem, 8vw, 8rem);
    width: clamp(4rem, 10vw, 8rem);
    aspect-ratio: 1;
    border: 1px solid rgb(248 201 91 / 35%);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgb(248 201 91 / 28%), rgb(248 201 91 / 4%) 65%, transparent 66%);
    content: '';
    pointer-events: none;
}
.surtitre {
    margin: 0 0 0.45rem;
    color: var(--soleil);
    font-size: 0.7rem;
    font-weight: 750;
    letter-spacing: 0.22em;
}
.intro h1 {
    max-width: 720px;
    margin: 0;
    font-family: var(--police-titres);
    font-size: clamp(2.4rem, 5vw, 4.6rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.02;
}
.intro h1 span {
    color: var(--soleil);
}
.intro > p:last-child {
    margin: 0.8rem 0 0;
    color: #c0ded2;
    font-size: clamp(0.95rem, 1.6vw, 1.1rem);
}
.intro-partie {
    padding-top: 2.2rem;
    padding-bottom: 1.6rem;
}
.etat-partie {
    margin: 0;
    color: #d7ede3;
    font-size: 0.88rem;
}
.grilles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1rem, 2.5vw, 2rem);
}
.carte-grille {
    min-width: 0;
    padding: clamp(0.8rem, 2vw, 1.25rem);
    border: 1px solid rgb(226 255 239 / 16%);
    border-radius: 20px;
    background: linear-gradient(145deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 4%));
    box-shadow: 0 18px 50px rgb(0 23 30 / 20%);
    backdrop-filter: blur(12px);
    transition: border-color 200ms ease, box-shadow 200ms ease;
}
.cible-active {
    border-color: rgb(248 201 91 / 55%);
    box-shadow: 0 0 0 1px rgb(248 201 91 / 12%), 0 18px 52px rgb(0 23 30 / 27%);
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
    display: grid;
    gap: 0.12rem;
    margin-bottom: 0.8rem;
}
figcaption strong {
    font-family: var(--police-titres);
    font-size: 1.25rem;
    font-weight: 600;
}
figcaption small {
    font-size: 0.8rem;
    color: var(--attenue);
}
.etiquette-grille {
    color: var(--soleil);
    font-size: 0.62rem;
    font-weight: 750;
    letter-spacing: 0.18em;
}
.rejouer {
    display: block;
    margin: 1.5rem auto 0;
}
.difficulte {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    width: fit-content;
    max-width: 100%;
    margin: 0 0 1.5rem;
    padding: 0.5rem 0.75rem 0.75rem;
    border: 1px solid var(--ligne);
    border-radius: 14px;
    background: rgb(1 36 42 / 30%);
}
.difficulte legend {
    padding: 0 0.35rem;
    color: var(--attenue);
    font-size: 0.72rem;
    font-weight: 650;
}
.choix-difficulte {
    position: relative;
    cursor: pointer;
}
.choix-difficulte input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
}
.choix-difficulte span {
    display: block;
    padding: 0.4rem 0.8rem;
    border: 1px solid transparent;
    border-radius: 999px;
    color: #c1ddd1;
    font-size: 0.82rem;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.choix-difficulte input:checked + span {
    border-color: rgb(248 201 91 / 40%);
    background: rgb(248 201 91 / 14%);
    color: var(--soleil);
}
.choix-difficulte input:focus-visible + span {
    outline: 2px solid var(--soleil);
    outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
    }
}
.difficulte label {
    cursor: pointer;
}
</style>
