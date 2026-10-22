<script setup lang="ts">
// Placement des bateaux, vue de dessus. La détection de case et le dessin sont dans le moteur ;
// les règles (est-ce valide ?) sont dans game/rules.ts. Ce composant ne fait que les relier.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Grille3D from './BoardView3D.vue'
import { grilleDepuisBateaux, peutPlacer, placerFlotteAleatoirement, casesBateau } from '../game/rules.ts'
import { FLOTTE, type CoordCase, type Bateau } from '../game/types.ts'

const emettre = defineEmits<{ valider: [bateaux: Bateau[]] }>()

const bateauxPlaces = ref<Bateau[]>([])
const horizontal = ref(true)
const caseSurvolee = ref<CoordCase | null>(null)

const prochainModele = computed(() => FLOTTE[bateauxPlaces.value.length] ?? null)
const flotteComplete = computed(() => bateauxPlaces.value.length === FLOTTE.length)
const cases = computed(() => grilleDepuisBateaux(bateauxPlaces.value))

// Le bateau « fantôme » sous le pointeur, avec sa validité
const candidat = computed(() => {
    if (!prochainModele.value || !caseSurvolee.value) return null
    return {
        colonne: caseSurvolee.value.colonne,
        ligne: caseSurvolee.value.ligne,
        longueur: prochainModele.value.longueur,
        horizontal: horizontal.value,
    }
})
const apercu = computed(() =>
    candidat.value
        ? { cases: casesBateau(candidat.value), valide: peutPlacer(candidat.value, bateauxPlaces.value) }
        : null,
)

function placer(caseGrille: CoordCase) {
    const modele = prochainModele.value
    if (!modele) return
    const bateau = {
        colonne: caseGrille.colonne,
        ligne: caseGrille.ligne,
        longueur: modele.longueur,
        horizontal: horizontal.value,
    }
    if (peutPlacer(bateau, bateauxPlaces.value)) {
        bateauxPlaces.value = [...bateauxPlaces.value, { ...modele, ...bateau }]
    }
}

const tourner = () => (horizontal.value = !horizontal.value)
const annulerDernier = () => (bateauxPlaces.value = bateauxPlaces.value.slice(0, -1))
const toutRetirer = () => (bateauxPlaces.value = [])
const placementAleatoire = () => (bateauxPlaces.value = placerFlotteAleatoirement(FLOTTE))

function surTouche(evenement: KeyboardEvent) {
    if (evenement.key === 'r' || evenement.key === 'R') tourner()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onBeforeUnmount(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
    <section class="placement">
        <div class="grille-placement">
            <Grille3D
                vue="dessus"
                :cases="cases"
                :apercu="apercu"
                interactif
                @survol-case="caseSurvolee = $event"
                @clic-case="placer"
            />
        </div>

        <div class="panneau-placement">
            <h2>Placez votre flotte</h2>
            <p v-if="prochainModele" class="modele-courant">
                Prochain bateau : <strong>{{ prochainModele.nom }}</strong> ({{ prochainModele.longueur }} cases)
            </p>
            <p v-else class="modele-courant">Flotte au complet.</p>

            <ul class="flotte">
                <li v-for="(modele, index) in FLOTTE" :key="modele.identifiant"
                        :class="{ termine: index < bateauxPlaces.length, suivant: index === bateauxPlaces.length }">
                    {{ modele.nom }} <span>{{ modele.longueur }}</span>
                </li>
            </ul>

            <div class="actions">
                <button type="button" @click="tourner">
                    {{ horizontal ? 'Horizontal' : 'Vertical' }} (touche R)
                </button>
                <button type="button" :disabled="!bateauxPlaces.length" @click="annulerDernier">Annuler le dernier</button>
                <button type="button" :disabled="!bateauxPlaces.length" @click="toutRetirer">Tout retirer</button>
                <button type="button" @click="placementAleatoire">Placement aléatoire</button>
                <button type="button" class="principal" :disabled="!flotteComplete" @click="emettre('valider', bateauxPlaces)">
                    Valider la flotte
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.placement {
    display: grid;
    grid-template-columns: minmax(280px, 560px) minmax(220px, 300px);
    gap: 2rem;
    align-items: start;
    justify-content: center;
}
@media (max-width: 760px) {
    .placement {
        grid-template-columns: 1fr;
    }
}
h2 {
    margin: 0 0 0.5rem;
    font-family: var(--police-titres);
    font-weight: 600;
    font-size: 1.5rem;
}
.modele-courant {
    margin: 0 0 1rem;
}
.flotte {
    list-style: none;
    padding: 0;
    margin: 0 0 1.25rem;
    border-top: 1px solid var(--ligne);
}
.flotte li {
    display: flex;
    justify-content: space-between;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--ligne);
    color: var(--attenue);
}
.flotte li.suivant {
    color: var(--craie);
    font-weight: 600;
}
.flotte li.termine {
    text-decoration: line-through;
}
.actions {
    display: grid;
    gap: 0.5rem;
}
</style>
