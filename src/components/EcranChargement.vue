<script setup lang="ts">
// Écran de chargement : s'affiche quand on prend le large, le temps de préparer la mer, les navires et
// l'arsenal. Sobre mais vivant : un petit voilier avance sur la barre au rythme du vrai chargement de la 3D.
import { computed } from 'vue'

const proprietes = defineProps<{
    /** Progression de 0 à 1. */
    progression: number
    /** Ce qui vient d'être chargé. */
    etape: string
}>()

const ASTUCES = [
    'Acheter un outil ne coûte pas votre tour : l’utiliser, si.',
    'Les drones réparent toutes les cases touchées d’un navire, mais une seule fois par navire.',
    'Le sonar scanne une zone de 3 × 3 cases sur la grille ennemie.',
    'Un navire entièrement touché est perdu : les drones arrivent trop tard.',
    'Une bouée leurre détourne le sonar adverse pendant deux tours.',
]
const astuce = ASTUCES[Math.floor(Math.random() * ASTUCES.length)]!
const pourcentage = computed(() => Math.round(Math.min(1, Math.max(0, proprietes.progression)) * 100))
</script>

<template>
    <div class="chargement" role="dialog" aria-modal="true" aria-labelledby="titre-chargement">
        <div class="contenu">
            <h2 id="titre-chargement">Bataille navale</h2>
            <p class="sous-titre">Hissez les voiles, la traversée se prépare…</p>

            <div class="route">
                <div class="barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="pourcentage"
                    aria-label="Progression du chargement">
                    <span class="remplissage" :style="{ width: `${pourcentage}%` }"></span>
                </div>
                <!-- Le voilier suit la fin de la barre -->
                <div class="voilier" :style="{ left: `${pourcentage}%` }" aria-hidden="true">
                    <svg viewBox="0 0 40 40" width="40" height="40">
                        <path d="M20 4v24" stroke="#3a2410" stroke-width="2" stroke-linecap="round" />
                        <path d="M22 6c8 4 11 11 12 18H22z" fill="#fff6dc" />
                        <path d="M18 10c-6 3-9 8-10 14h10z" fill="#f0d9a3" />
                        <path d="M6 28h28l-5 7H11z" fill="#a3322a" stroke="#5a1a14" stroke-width="1.5" stroke-linejoin="round" />
                    </svg>
                </div>
            </div>

            <p class="etape" role="status" aria-live="polite">
                <span>{{ etape }}…</span>
                <strong>{{ pourcentage }} %</strong>
            </p>
            <p class="astuce"><span aria-hidden="true">✦</span> {{ astuce }}</p>
        </div>

        <!-- Une seule rangée de vagues, discrète, en bas de l'écran -->
        <div class="vagues" aria-hidden="true"></div>
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
    overflow: hidden;
    background: radial-gradient(ellipse at 50% 30%, #1d6f93 0%, #0e4e73 50%, #082e4a 100%);
}
.contenu {
    position: relative;
    z-index: 1;
    width: min(28rem, 100%);
    color: #f6ead0;
    text-align: center;
    animation: apparition 400ms ease-out both;
}
@keyframes apparition {
    from { opacity: 0; transform: translateY(10px); }
}
h2 {
    margin: 0;
    font-family: var(--police-titres);
    font-size: 2rem;
    letter-spacing: 0.02em;
}
.sous-titre {
    margin: 0.3rem 0 2.2rem;
    color: rgb(246 234 208 / 70%);
    font-size: 0.95rem;
}

/* Route : la barre, avec le voilier posé sur son extrémité */
.route {
    position: relative;
}
.barre {
    height: 0.7rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(0 0 0 / 35%);
    box-shadow: inset 0 1px 3px rgb(0 0 0 / 40%);
}
.remplissage {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #f0b46c, #ffd89a);
    transition: width 300ms ease-out;
}
.voilier {
    position: absolute;
    bottom: 0.15rem;
    width: 40px;
    height: 40px;
    margin-left: -20px;
    transition: left 300ms ease-out;
}
.voilier svg {
    display: block;
    transform-origin: 50% 90%;
    animation: tangue 2.2s ease-in-out infinite;
    filter: drop-shadow(0 3px 4px rgb(0 10 25 / 45%));
}
@keyframes tangue {
    0%, 100% { transform: translateY(1px) rotate(-5deg); }
    50% { transform: translateY(-3px) rotate(5deg); }
}

.etape {
    display: flex;
    justify-content: space-between;
    margin: 0.7rem 0.1rem 0;
    font-size: 0.9rem;
    color: rgb(246 234 208 / 85%);
}
.etape strong {
    font-variant-numeric: tabular-nums;
}
.astuce {
    margin: 1.8rem 0 0;
    color: rgb(246 234 208 / 65%);
    font-size: 0.85rem;
}
.astuce span {
    color: #f0b46c;
}

/* Vagues : une bande qui défile lentement en bas */
.vagues {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 200%;
    height: 5rem;
    background-repeat: repeat-x;
    background-size: 240px 100%;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='80' viewBox='0 0 240 80'%3E%3Cpath d='M0 36C40 16 80 16 120 36s80 20 120 0v44H0z' fill='%23ffffff' fill-opacity='.07'/%3E%3Cpath d='M0 50C30 34 90 34 120 50s90 16 120 0v30H0z' fill='%23ffffff' fill-opacity='.08'/%3E%3C/svg%3E");
    animation: houle 12s linear infinite;
}
@keyframes houle {
    to { translate: -240px 0; }
}

@media (prefers-reduced-motion: reduce) {
    .voilier svg, .vagues { animation: none; }
}
</style>
