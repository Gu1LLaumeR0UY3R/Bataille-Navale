<script setup lang="ts">
import { reglages, reinitialiserReglages } from '../game/options.ts'

defineEmits<{ retour: [] }>()

const curseurs = [
    { cle: 'volumeGeneral', libelle: 'Volume général' },
    { cle: 'volumeMusique', libelle: 'Musique' },
    { cle: 'volumeEffets', libelle: 'Effets sonores' },
] as const
</script>

<template>
    <section class="options">
        <p class="surtitre">RÉGLAGES</p>
        <h1>Options</h1>
        <p class="note">Le son arrive bientôt : vos réglages sont déjà enregistrés.</p>

        <div class="carte">
            <h2>Son</h2>
            <label class="ligne ligne-case">
                <span>Couper tout le son</span>
                <input v-model="reglages.muet" type="checkbox" />
            </label>
            <label v-for="curseur in curseurs" :key="curseur.cle" class="ligne" :class="{ inactif: reglages.muet }">
                <span>{{ curseur.libelle }}</span>
                <input v-model.number="reglages[curseur.cle]" type="range" min="0" max="100" step="1" :disabled="reglages.muet" />
                <output>{{ reglages[curseur.cle] }}</output>
            </label>
        </div>

        <div class="carte">
            <h2>Affichage</h2>
            <label class="ligne ligne-case">
                <span>Réduire les animations <small>Menus et transitions ; la mer 3D reste animée.</small></span>
                <input v-model="reglages.reduireAnimations" type="checkbox" />
            </label>
        </div>

        <div class="actions">
            <button type="button" @click="reinitialiserReglages">Réinitialiser</button>
            <button type="button" class="principal" @click="$emit('retour')">Retour</button>
        </div>
    </section>
</template>

<style scoped>
.options {
    max-width: 38rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 5vw, 3rem) 0;
}
.surtitre {
    margin: 0 0 0.4rem;
    color: var(--soleil);
    font-size: 0.7rem;
    font-weight: 750;
    letter-spacing: 0.22em;
}
h1 {
    margin: 0;
    font-family: var(--police-titres);
    font-size: clamp(2.2rem, 5vw, 3.4rem);
}
.note {
    margin: 0.5rem 0 1.5rem;
    color: var(--attenue);
}
.carte {
    margin-bottom: 1rem;
    padding: 1.1rem 1.25rem;
    border: 1px solid var(--ligne);
    border-radius: 18px;
    background: var(--panneau);
    backdrop-filter: blur(10px);
}
h2 {
    margin: 0 0 0.6rem;
    font-family: var(--police-titres);
    font-size: 1.2rem;
}
.ligne {
    display: grid;
    grid-template-columns: 9rem 1fr 2.5rem;
    align-items: center;
    gap: 0.8rem;
    min-height: 2.8rem;
}
.ligne.inactif {
    opacity: 0.45;
}
.ligne-case {
    grid-template-columns: 1fr auto;
    cursor: pointer;
}
.ligne small {
    display: block;
    color: var(--attenue);
    font-size: 0.74rem;
}
input[type='range'] {
    width: 100%;
    accent-color: var(--soleil);
}
input[type='checkbox'] {
    width: 1.3rem;
    height: 1.3rem;
    accent-color: var(--soleil);
}
output {
    color: var(--soleil);
    font-variant-numeric: tabular-nums;
    text-align: right;
}
.actions {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    margin-top: 1.4rem;
}
@media (max-width: 520px) {
    .ligne { grid-template-columns: 6.5rem 1fr 2.2rem; }
}
</style>
