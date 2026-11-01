<script setup lang="ts">
// Enveloppe Vue autour de engine/boardScene.ts.
// Ce composant ne manipule jamais un objet 3D : il traduit des props en appels de méthodes,
// et les événements de la scène 3D en événements Vue.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { creerSceneGrille, type OutilVisuel, type ProgresChargement, type SceneGrille } from '../engine/boardScene.ts'
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
        /** Cases protégées par un bouclier. */
        boucliers?: CoordCase[]
        /** Chaque nouvel `id` lance l'animation des drones autour de `caseGrille`. */
        reparation?: { id: number; caseGrille: CoordCase } | null
        /** Chaque nouvel `id` fait scintiller le bouclier de `caseGrille` (tir bloqué). */
        impactBouclier?: { id: number; caseGrille: CoordCase } | null
        couleurFondMarin?: Couleur
        carte?: Carte | null
    }>(),
    { vue: 'inclinee', interactif: false, apercu: null, bateaux: () => [], outils: () => [], boucliers: () => [], reparation: null, impactBouclier: null, couleurFondMarin: () => [1.0, 0.2, 0.2], carte: null },
)

const emettre = defineEmits<{
    'clic-case': [caseGrille: CoordCase]
    'survol-case': [caseGrille: CoordCase | null]
    /** La case est réparée (mi-parcours de l'animation des drones). */
    'reparation-faite': [id: number]
    /** Les drones sont repartis. */
    'reparation-finie': [id: number]
    /** Avancement du chargement de la scène (moteur, effets, modèles, compilation). */
    progres: [progres: ProgresChargement]
    /** La scène est entièrement chargée et affichée. */
    pret: []
    /** La scène n'a pas pu être créée (WebGPU absent, modèle illisible…). */
    echec: [message: string]
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
            surProgres: (progres) => emettre('progres', progres),
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
        sceneCreee.definirBoucliers(proprietes.boucliers)
        appliquerApercu()
        emettre('pret')
    } catch (erreurCapturee) {
        erreur.value = erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee)
        emettre('echec', erreur.value)
    }
})

watch(() => proprietes.cases, (cases) => sceneGrille.value?.definirCases(cases), { deep: true })
watch(() => proprietes.bateaux, (bateaux) => sceneGrille.value?.definirBateaux(bateaux), { deep: true })
watch(() => proprietes.outils, (outils) => sceneGrille.value?.definirOutils(outils), { deep: true })
watch(() => proprietes.boucliers, (boucliers) => sceneGrille.value?.definirBoucliers(boucliers), { deep: true })
watch(() => proprietes.reparation?.id, () => {
    const reparation = proprietes.reparation
    if (!reparation) return
    sceneGrille.value?.jouerReparation(reparation.caseGrille, {
        reparee: () => emettre('reparation-faite', reparation.id),
        terminee: () => emettre('reparation-finie', reparation.id),
    })
})
watch(() => proprietes.impactBouclier?.id, () => {
    if (proprietes.impactBouclier) sceneGrille.value?.flasherBouclier(proprietes.impactBouclier.caseGrille)
})
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
