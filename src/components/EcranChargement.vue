<script setup lang="ts">
// Écran de chargement : s'affiche quand on prend le large, le temps de préparer la mer, les navires et
// l'arsenal. La barre suit la vraie progression de la 3D ; un navire de papier tangue sur les vagues.
import { computed } from 'vue'

const proprietes = defineProps<{
    /** Progression de 0 à 1. */
    progression: number
    /** Ce qui vient d'être chargé. */
    etape: string
}>()

const ASTUCES = [
    'Acheter un outil ne coûte pas votre tour : l’utiliser, si.',
    'Un drone répare une case touchée et la protège du prochain tir.',
    'Le sonar scanne une zone de 3 × 3 cases sur la grille ennemie.',
    'Un navire entièrement touché est perdu : les drones arrivent trop tard.',
    'Les poissons arrivent à chaque tour : dépensez-les avec soin.',
    'Une bouée leurre détourne le sonar adverse pendant deux tours.',
]
const astuce = ASTUCES[Math.floor(Math.random() * ASTUCES.length)]!
const pourcentage = computed(() => Math.round(Math.min(1, Math.max(0, proprietes.progression)) * 100))
</script>

<template>
    <div class="chargement" role="dialog" aria-modal="true" aria-labelledby="titre-chargement">
        <div class="chargement-carte">
            <p class="surtitre">APPAREILLAGE</p>
            <h2 id="titre-chargement">Préparation de la traversée</h2>

            <div class="mer" aria-hidden="true">
                <svg class="navire" viewBox="0 0 120 80" width="120" height="80">
                    <path d="M60 6v46" stroke="#5a4731" stroke-width="3" stroke-linecap="round" fill="none" />
                    <path d="M62 8c20 8 28 22 30 38H62z" fill="#fff6dc" stroke="#b87333" stroke-width="2" stroke-linejoin="round" />
                    <path d="M58 14c-14 6-22 18-24 32h24z" fill="#f0d9a3" stroke="#b87333" stroke-width="2" stroke-linejoin="round" />
                    <path d="M18 52h84l-12 18H32z" fill="#7a4a1f" stroke="#4a2c10" stroke-width="2" stroke-linejoin="round" />
                    <path d="M60 6l12 5-12 5z" fill="#a3322a" />
                </svg>
                <span class="vague vague-1"></span>
                <span class="vague vague-2"></span>
            </div>

            <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="pourcentage"
                aria-label="Progression du chargement">
                <span class="remplissage" :style="{ width: `${pourcentage}%` }"></span>
            </div>
            <p class="etape" role="status" aria-live="polite">
                <span>{{ etape }}…</span>
                <strong>{{ pourcentage }} %</strong>
            </p>
            <p class="astuce"><span aria-hidden="true">✦</span> {{ astuce }}</p>
        </div>
    </div>
</template>

<style scoped>
.chargement {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background:
        radial-gradient(ellipse at 50% 20%, rgb(255 214 130 / 22%), transparent 60%),
        linear-gradient(180deg, #1b6f93 0%, #0e4e73 55%, #082e4a 100%);
}
.chargement-carte {
    width: min(30rem, 100%);
    padding: 1.6rem 1.8rem 1.4rem;
    border: 3px solid var(--cuivre);
    border-radius: 24px;
    background: var(--grain), linear-gradient(180deg, #f8edd1, #ecd9ae);
    box-shadow: 0 30px 70px rgb(3 24 42 / 55%), inset 0 2px 0 rgb(255 255 255 / 55%);
    color: var(--encre);
    text-align: center;
    animation: arrive 520ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
@keyframes arrive {
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
}
.surtitre {
    margin: 0;
    color: var(--cuivre-fonce);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.24em;
}
h2 {
    margin: 0.2rem 0 0;
    font-family: var(--police-titres);
    font-size: 1.55rem;
}

/* Mer : deux bandes de vagues qui défilent sous un navire qui tangue. */
.mer {
    position: relative;
    height: 7.2rem;
    margin: 0.8rem 0 0.4rem;
    overflow: hidden;
    border-radius: 16px;
    background: linear-gradient(180deg, #f9f0d6 0%, #e6f1ea 60%, #bfe3df 100%);
    box-shadow: inset 0 2px 8px rgb(120 80 30 / 22%);
}
.navire {
    position: absolute;
    bottom: 1.5rem;
    left: calc(50% - 60px);
    transform-origin: 50% 90%;
    animation: tangage 2.4s ease-in-out infinite;
}
@keyframes tangage {
    0%, 100% { transform: translateY(0) rotate(-4deg); }
    50% { transform: translateY(-6px) rotate(4deg); }
}
.vague {
    position: absolute;
    right: -100%;
    left: 0;
    height: 2.2rem;
    width: 200%;
    /* Un aplat plein sous le motif masque les coutures entre deux répétitions de la vague. */
    background-repeat: repeat-x, no-repeat;
    background-size: 120px 100%, 100% 100%;
}
.vague-1 {
    bottom: -0.2rem;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='36' viewBox='0 0 120 36'%3E%3Cpath d='M0 18C20 6 40 6 60 18s40 12 60 0v18H0z' fill='%2335a3b8'/%3E%3C/svg%3E"), linear-gradient(to top, #35a3b8 50%, transparent 50%);
    animation: houle 4s linear infinite;
}
.vague-2 {
    bottom: -0.9rem;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='36' viewBox='0 0 120 36'%3E%3Cpath d='M0 18C20 30 40 30 60 18S100 6 120 18v18H0z' fill='%231f7d99'/%3E%3C/svg%3E"), linear-gradient(to top, #1f7d99 50%, transparent 50%);
    animation: houle 6s linear infinite reverse;
}
@keyframes houle {
    to { transform: translateX(-120px); }
}

.barre {
    height: 0.9rem;
    overflow: hidden;
    border: 2px solid var(--cuivre);
    border-radius: 999px;
    background: rgb(255 250 235 / 70%);
    box-shadow: inset 0 2px 5px rgb(120 80 30 / 25%);
}
.remplissage {
    display: block;
    height: 100%;
    border-radius: 999px;
    background:
        repeating-linear-gradient(115deg, rgb(255 255 255 / 0%) 0 10px, rgb(255 255 255 / 26%) 10px 20px),
        linear-gradient(180deg, #f0b46c, #c9843c);
    background-size: 40px 100%, 100% 100%;
    transition: width 360ms cubic-bezier(0.2, 0.9, 0.25, 1);
    animation: defile 1.2s linear infinite;
}
@keyframes defile {
    to { background-position: 40px 0, 0 0; }
}
.etape {
    display: flex;
    justify-content: space-between;
    margin: 0.55rem 0.2rem 0;
    font-family: var(--police-titres);
    font-size: 0.98rem;
    font-style: italic;
}
.etape strong {
    font-style: normal;
    font-variant-numeric: tabular-nums;
}
.astuce {
    margin: 1rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px dashed var(--papier-bord);
    color: var(--encre-douce);
    font-size: 0.86rem;
}
.astuce span {
    color: var(--cuivre);
}
</style>
