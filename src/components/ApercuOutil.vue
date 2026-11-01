<script setup lang="ts">
// Aperçu d'un outil : l'image low poly si elle existe, sinon un pictogramme dessiné.
// Un fichier manquant ne casse rien : l'image est simplement remplacée par le pictogramme.
import { ref } from 'vue'
import { ICONES_OUTILS } from '../game/iconesOutils.ts'
import type { DefinitionOutil } from '../game/outils.ts'

const proprietes = defineProps<{ outil: DefinitionOutil }>()
const imageManquante = ref(false)
const url = `${import.meta.env.BASE_URL}${proprietes.outil.image}`
</script>

<template>
    <span class="apercu-outil">
        <img v-if="!imageManquante" :src="url" alt="" draggable="false" @error="imageManquante = true" />
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" aria-hidden="true">
            <path v-for="(trace, index) in ICONES_OUTILS[outil.identifiant]" :key="index" :d="trace" />
        </svg>
    </span>
</template>

<style scoped>
.apercu-outil {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: var(--cuivre-fonce);
}
.apercu-outil img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 5px rgb(60 38 12 / 35%));
    user-select: none;
}
.apercu-outil svg {
    width: 62%;
    height: 62%;
}
</style>
