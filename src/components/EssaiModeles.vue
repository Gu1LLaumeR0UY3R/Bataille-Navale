<script setup lang="ts">
// Page d'essai des modèles 3D : ouvrir l'application avec /?essai=modeles
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { creerSceneEssai, type SceneEssai } from '../engine/essaiModeles.ts'

const toile = ref<HTMLCanvasElement>()
const scene = shallowRef<SceneEssai>()
const erreur = ref('')
const chargement = ref(true)
const rotations = reactive<Record<string, number>>({})
let estDemonte = false

const bateaux = computed(() => scene.value?.bateaux ?? [])
const releve = computed(() => bateaux.value.map((bateau) => `${bateau.identifiant} : ${rotations[bateau.identifiant] ?? 0}°`).join('\n'))

function tourner(identifiant: string, degres: number) {
    scene.value?.tourner(identifiant, degres)
    rotations[identifiant] = scene.value?.lireRotation(identifiant) ?? 0
}

onMounted(async () => {
    try {
        const sceneCreee = await creerSceneEssai(toile.value!)
        if (estDemonte) {
            sceneCreee.liberer()
            return
        }
        sceneCreee.bateaux.forEach((bateau) => {
            rotations[bateau.identifiant] = sceneCreee.lireRotation(bateau.identifiant)
        })
        scene.value = sceneCreee
    } catch (erreurCapturee) {
        erreur.value = erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee)
    } finally {
        chargement.value = false
    }
})

onBeforeUnmount(() => {
    estDemonte = true
    scene.value?.liberer()
})
</script>

<template>
    <main class="essai">
        <h1>Essai des modèles 3D</h1>
        <div class="zone">
            <div class="cadre">
                <canvas ref="toile" class="toile" />
                <p v-if="chargement" class="voile">Chargement des modèles…</p>
                <p v-else-if="erreur" class="voile erreur" role="alert">{{ erreur }}</p>
            </div>
            <aside class="panneau">
                <p class="aide">
                    De haut en bas à l'écran. Le rectangle bleu sous chaque bateau donne sa longueur en cases.
                    Souris : tourner la vue, molette : zoom.
                </p>
                <ul>
                    <li v-for="bateau in bateaux" :key="bateau.identifiant">
                        <strong>{{ bateau.nom }}</strong>
                        <span>{{ bateau.cases }} cases, rotation {{ rotations[bateau.identifiant] }}°</span>
                        <span class="boutons">
                            <button type="button" @click="tourner(bateau.identifiant, -90)">−90°</button>
                            <button type="button" @click="tourner(bateau.identifiant, 90)">+90°</button>
                            <button type="button" @click="tourner(bateau.identifiant, 180)">180°</button>
                        </span>
                    </li>
                </ul>
                <label>
                    Valeurs à me renvoyer :
                    <textarea :value="releve" readonly rows="6" />
                </label>
            </aside>
        </div>
    </main>
</template>

<style scoped>
.essai {
    max-width: 72rem;
    margin: 0 auto;
    padding: 1rem;
}
.zone {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
    gap: 1rem;
}
.cadre {
    position: relative;
}
.toile {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 6px;
    background: #05101e;
    touch-action: none;
}
.voile {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1.5rem;
    text-align: center;
    background: rgb(5 16 30 / 0.85);
    border-radius: 6px;
}
.erreur {
    color: #f4c9bd;
}
.panneau ul {
    display: grid;
    gap: 0.75rem;
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
}
.panneau li {
    display: grid;
    gap: 0.25rem;
}
.boutons {
    display: flex;
    gap: 0.5rem;
}
.aide {
    margin-top: 0;
}
textarea {
    display: block;
    width: 100%;
    font-family: monospace;
}
@media (max-width: 800px) {
    .zone {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
