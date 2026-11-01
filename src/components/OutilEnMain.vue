<script setup lang="ts">
// L'outil en main : un petit médaillon suit le curseur au-dessus des grilles, pour qu'on voie tout de suite
// avec quoi on joue. Sur écran tactile (pas de curseur), le bandeau de l'arsenal prend le relais.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ApercuOutil from './ApercuOutil.vue'
import type { DefinitionOutil } from '../game/outils.ts'

const proprietes = defineProps<{ outil: DefinitionOutil | null }>()

const racine = ref<HTMLElement>()
const visible = ref(false)
let image = 0
let x = 0
let y = 0

function placer() {
    image = 0
    if (racine.value) racine.value.style.transform = `translate3d(${x + 20}px, ${y + 20}px, 0)`
}

function surDeplacement(evenement: PointerEvent) {
    if (evenement.pointerType === 'touch') return
    x = evenement.clientX
    y = evenement.clientY
    // Visible seulement au-dessus des grilles : sur l'arsenal ou ailleurs, le curseur reste normal.
    const cible = evenement.target as Element | null
    visible.value = !!cible?.closest?.('.grilles')
    if (!image) image = requestAnimationFrame(placer)
}

const masquer = () => { visible.value = false }

onMounted(() => {
    window.addEventListener('pointermove', surDeplacement, { passive: true })
    document.addEventListener('pointerleave', masquer)
})
onBeforeUnmount(() => {
    window.removeEventListener('pointermove', surDeplacement)
    document.removeEventListener('pointerleave', masquer)
    cancelAnimationFrame(image)
})
watch(() => proprietes.outil, () => { if (!proprietes.outil) visible.value = false })
</script>

<template>
    <div v-if="outil" ref="racine" class="outil-en-main" :class="{ visible }" aria-hidden="true">
        <span class="medaillon"><ApercuOutil :outil="outil" /></span>
        <span class="etiquette">{{ outil.nom }}</span>
    </div>
</template>

<style scoped>
.outil-en-main {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
    will-change: transform;
}
.outil-en-main.visible { opacity: 1; }
.medaillon {
    display: grid;
    width: 3.1rem;
    height: 3.1rem;
    padding: 0.2rem;
    place-items: center;
    border: 2.5px solid var(--cuivre);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff8e0, #ecd49a);
    box-shadow: 0 8px 18px rgb(3 24 42 / 45%), 0 0 0 4px rgb(227 162 92 / 35%);
    animation: balancement 1.6s ease-in-out infinite;
}
@keyframes balancement {
    50% { transform: translateY(-4px) rotate(-6deg); }
}
.etiquette {
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--papier);
    box-shadow: 0 3px 8px rgb(3 24 42 / 35%);
    color: var(--encre);
    font-family: var(--police-titres);
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
}
</style>
