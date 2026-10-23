<script setup lang="ts">
// Enveloppe Vue autour de engine/boardScene.ts.
// Ce composant ne manipule jamais un objet 3D : il traduit des props en appels de méthodes,
// et les événements de la scène 3D en événements Vue.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { creerSceneGrille, type OutilVisuel, type SceneGrille } from '../engine/boardScene.ts'
import type { CoordCase, EtatCase, Couleur, Bateau } from '../game/types.ts'
import type { Carte } from '../maps/types.ts'

const proprietes = withDefaults(
    defineProps<{
        cases: EtatCase[][]
        vue?: 'inclinee' | 'dessus'
        interactif?: boolean
        apercu?: { cases: CoordCase[]; valide: boolean } | null
        bateaux?: Bateau[]
        outils?: OutilVisuel[]
        couleurFondMarin?: Couleur
        carte?: Carte | null
    }>(),
    { vue: 'inclinee', interactif: false, apercu: null, bateaux: () => [], outils: () => [], couleurFondMarin: () => [1.0, 0.2, 0.2], carte: null },
)

const emettre = defineEmits<{
    'clic-case': [caseGrille: CoordCase]
    'survol-case': [caseGrille: CoordCase | null]
}>()

const toile = ref<HTMLCanvasElement>()
// shallowRef : Vue ne doit pas rendre l'objet réactif en profondeur.
const sceneGrille = shallowRef<SceneGrille>()
const erreur = ref('')
let estDemonte = false

function appliquerApercu() {
    if (proprietes.apercu) {
        sceneGrille.value?.definirApercu(proprietes.apercu.cases, proprietes.apercu.valide)
    } else sceneGrille.value?.effacerApercu()
}

onMounted(async () => {
    try {
        const sceneCreee = await creerSceneGrille(toile.value!, {
            vue: proprietes.vue,
            couleurCase: null,
            couleurFondMarin: proprietes.couleurFondMarin,
            carte: proprietes.carte,
        })

        if (estDemonte) {
            // Le composant a été démonté pendant l'initialisation asynchrone
            sceneCreee.liberer()
            return
        }

        sceneCreee.surSurvolCase((caseGrille) => {
            if (!proprietes.interactif) return
            sceneCreee.definirSurvol(caseGrille)
            emettre('survol-case', caseGrille)
        })

        sceneCreee.surClicCase((caseGrille) => {
            if (proprietes.interactif) emettre('clic-case', caseGrille)
        })

        sceneGrille.value = sceneCreee
        sceneCreee.definirCases(proprietes.cases)
        sceneCreee.definirBateaux(proprietes.bateaux)
        sceneCreee.definirOutils(proprietes.outils)
        appliquerApercu()
    
    } catch (erreurCapturee) {
        erreur.value = erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee)
    }
})

watch(() => proprietes.cases, (cases) => sceneGrille.value?.definirCases(cases), { deep: true })
watch(() => proprietes.bateaux, (bateaux) => sceneGrille.value?.definirBateaux(bateaux), { deep: true })
watch(() => proprietes.outils, (outils) => sceneGrille.value?.definirOutils(outils), { deep: true })
watch(() => proprietes.apercu, appliquerApercu, { deep: true })
watch(() => proprietes.interactif, (actif) => {
    if (!actif) sceneGrille.value?.definirSurvol(null)
})

onBeforeUnmount(() => {
    estDemonte = true
    sceneGrille.value?.liberer()
})
</script>




<template>
    <div class="grille">
        <canvas ref="toile" class="toile-grille" :class="{ interactif: proprietes.interactif }" />
        <p v-if="erreur" class="erreur-grille" role="alert">
            Impossible d'afficher la grille 3D. {{ erreur }}
        </p>
    </div>
</template>




<style scoped>
.grille {
    position: relative;
    width: 100%;
}
.toile-grille {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1; /* grille carrée : la caméra fixe est cadrée pour un canvas carré */
    border-radius: 6px;
    background: #1f5c85;
    touch-action: none;
}
.toile-grille.interactif {
    cursor: crosshair;
}
.erreur-grille {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    margin: 0;
    text-align: center;
    color: #f4c9bd;
    background: rgb(11 47 74 / 0.94);
    border-radius: 6px;
}
</style>
