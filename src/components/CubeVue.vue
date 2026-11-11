<script setup lang="ts">
// Cube de vue, posé sur la carte : il tourne comme la caméra, et un clic sur une face place la caméra de ce côté.
// On peut toujours bouger librement à la souris dans la scène ; le cube suit.
import { computed } from 'vue'
import type { VueCamera } from '../engine/boardScene.ts'
import { rotationCube, type FaceCube } from '../engine/vueCube.ts'

const proprietes = defineProps<{
    alpha: number
    beta: number
}>()
const emettre = defineEmits<{ choisir: [vue: VueCamera] }>()

const FACES: { id: FaceCube, nom: string, vue: VueCamera, transformation: string }[] = [
    { id: 'avant', nom: 'Avant', vue: 'avant', transformation: 'translateZ(var(--moitie))' },
    { id: 'arriere', nom: 'Arrière', vue: 'arriere', transformation: 'rotateY(180deg) translateZ(var(--moitie))' },
    { id: 'droite', nom: 'Droite', vue: 'droite', transformation: 'rotateY(90deg) translateZ(var(--moitie))' },
    { id: 'gauche', nom: 'Gauche', vue: 'gauche', transformation: 'rotateY(-90deg) translateZ(var(--moitie))' },
    { id: 'dessus', nom: 'Dessus', vue: 'dessus', transformation: 'rotateX(90deg) translateZ(var(--moitie))' },
]

const orientation = computed(() => rotationCube(proprietes.alpha, proprietes.beta))
</script>

<template>
    <div class="cube-vue" role="group" aria-label="Position de la caméra">
        <div class="scene-cube">
            <div class="cube" :style="{ transform: orientation.transformation }">
                <button v-for="face in FACES" :key="face.id" type="button" class="face"
                    :class="{ courante: orientation.faceVisee === face.id }" :style="{ transform: face.transformation }"
                    :aria-label="`Vue ${face.nom.toLowerCase()}`" :title="`Vue ${face.nom.toLowerCase()}`"
                    @click.stop="emettre('choisir', face.vue)">
                    {{ face.nom }}
                </button>
                <span class="face dessous" aria-hidden="true"></span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.cube-vue {
    --taille: 3.4rem;
    --moitie: 1.7rem;
    position: absolute;
    top: 1rem;
    right: 1.1rem;
    z-index: 6;
    width: 5.4rem;
    height: 5.4rem;
    display: grid;
    place-items: center;
}
.scene-cube {
    width: var(--taille);
    height: var(--taille);
    perspective: 360px;
}
.cube {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 90ms linear;
}
.face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0;
    border: 2px solid rgb(201 132 60 / 90%);
    border-radius: 6px;
    background: linear-gradient(135deg, rgb(12 54 84 / 88%), rgb(8 36 60 / 92%));
    color: #f6ead0;
    font: inherit;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    backface-visibility: hidden;
    transition: background 140ms ease, color 140ms ease;
}
.face:hover {
    background: linear-gradient(135deg, #f0b46c, #c9843c);
    color: #2a1a08;
}
.face.courante {
    border-color: #ffd89a;
    box-shadow: 0 0 10px rgb(255 216 154 / 55%);
}
.dessous {
    transform: rotateX(-90deg) translateZ(var(--moitie));
    pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
    .cube { transition: none; }
}
</style>
