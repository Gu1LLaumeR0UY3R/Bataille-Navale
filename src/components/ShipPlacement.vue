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
const progression = computed(() => (bateauxPlaces.value.length / FLOTTE.length) * 100)

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
        <div class="panneau-grille">
            <div class="entete-grille">
                <div>
                    <span class="surtitre-grille">VOTRE CARTE MARINE</span>
                    <h2>Le lagon</h2>
                </div>
                <span class="compteur-bateaux">{{ bateauxPlaces.length }} / {{ FLOTTE.length }} navires</span>
            </div>
            <div class="grille-placement">
                <Grille3D
                    vue="dessus"
                    :cases="cases"
                    :bateaux="bateauxPlaces"
                    :apercu="apercu"
                    interactif
                    @survol-case="caseSurvolee = $event"
                    @clic-case="placer"
                />
            </div>
            <p class="aide-grille"><span aria-hidden="true">✦</span> Cliquez sur la carte pour mouiller votre navire.</p>
        </div>

        <div class="panneau-placement">
            <div class="titre-panneau">
                <span class="etiquette-panneau">ÉTAPE 1 · PRÉPARATION</span>
                <h2>Composez votre flotte</h2>
                <p>Installez vos navires avant que la marée ne tourne.</p>
            </div>

            <div class="progression" role="progressbar" :aria-valuenow="bateauxPlaces.length" :aria-valuemin="0" :aria-valuemax="FLOTTE.length" :aria-label="`${bateauxPlaces.length} navires sur ${FLOTTE.length} placés`">
                <div class="progression-label"><span>Progression</span><strong>{{ bateauxPlaces.length }} / {{ FLOTTE.length }}</strong></div>
                <div class="progression-piste"><span :style="{ width: `${progression}%` }"></span></div>
            </div>

            <div class="modele-courant" aria-live="polite">
                <span class="icone-navire" aria-hidden="true">{{ flotteComplete ? '✓' : '⚓' }}</span>
                <div>
                    <small>{{ flotteComplete ? 'PRÊT À PRENDRE LE LARGE' : 'PROCHAIN NAVIRE' }}</small>
                    <strong>{{ prochainModele?.nom ?? 'Flotte au complet !' }}</strong>
                    <span v-if="prochainModele">{{ prochainModele.longueur }} cases · {{ horizontal ? 'à l’horizontale' : 'à la verticale' }}</span>
                </div>
            </div>

            <ul class="flotte">
                <li v-for="(modele, index) in FLOTTE" :key="modele.identifiant"
                    :class="{ termine: index < bateauxPlaces.length, suivant: index === bateauxPlaces.length }">
                    <span class="etat-navire" aria-hidden="true">{{ index < bateauxPlaces.length ? '✓' : String(index + 1).padStart(2, '0') }}</span>
                    <span class="nom-navire">{{ modele.nom }}<small>{{ modele.longueur }} cases</small></span>
                    <span class="statut-navire">{{ index < bateauxPlaces.length ? 'Mouillé' : index === bateauxPlaces.length ? 'À placer' : 'En réserve' }}</span>
                </li>
            </ul>

            <div class="actions">
                <button type="button" class="bouton-orientation" @click="tourner" :aria-label="`Changer l’orientation, actuellement ${horizontal ? 'horizontale' : 'verticale'}`">
                    <span aria-hidden="true">↻</span> {{ horizontal ? 'Horizontal' : 'Vertical' }} <kbd>R</kbd>
                </button>
                <div class="actions-secondaires">
                    <button type="button" :disabled="!bateauxPlaces.length" @click="annulerDernier">Annuler le dernier</button>
                    <button type="button" :disabled="!bateauxPlaces.length" @click="toutRetirer">Tout retirer</button>
                </div>
                <button type="button" class="bouton-aleatoire" @click="placementAleatoire"><span aria-hidden="true">✦</span> Placement aléatoire</button>
                <button type="button" class="principal" :disabled="!flotteComplete" @click="emettre('valider', bateauxPlaces)">
                    {{ flotteComplete ? 'Prendre le large' : 'Placez toute la flotte' }} <span aria-hidden="true">→</span>
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.placement {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
    gap: clamp(1rem, 3vw, 2.5rem);
    align-items: stretch;
    justify-content: center;
}
@media (max-width: 760px) {
    .placement {
        grid-template-columns: 1fr;
    }
}
.panneau-grille,
.panneau-placement {
    min-width: 0;
    border: 1px solid rgb(226 255 239 / 17%);
    border-radius: 22px;
    background: linear-gradient(145deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%));
    box-shadow: 0 20px 55px rgb(0 23 30 / 22%);
    backdrop-filter: blur(12px);
}
.panneau-grille {
    padding: clamp(0.8rem, 2vw, 1.2rem);
}
.entete-grille {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.2rem 0.3rem 0.9rem;
}
.surtitre-grille,
.etiquette-panneau {
    color: var(--soleil);
    font-size: 0.62rem;
    font-weight: 750;
    letter-spacing: 0.17em;
}
.entete-grille h2 {
    margin: 0.1rem 0 0;
    font-family: var(--police-titres);
    font-size: 1.5rem;
    font-weight: 600;
}
.compteur-bateaux {
    flex: 0 0 auto;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--ligne);
    border-radius: 999px;
    color: #d8eee2;
    font-size: 0.75rem;
}
.grille-placement {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 17%);
    border-radius: 14px;
    background: #073c43;
}
.aide-grille {
    margin: 0.8rem 0.25rem 0.1rem;
    color: #c4ded2;
    font-size: 0.8rem;
}
.aide-grille span {
    padding-right: 0.3rem;
    color: var(--soleil);
}
.panneau-placement {
    padding: clamp(1rem, 2.5vw, 1.6rem);
}
.titre-panneau h2 {
    margin: 0.3rem 0 0;
    font-family: var(--police-titres);
    font-size: clamp(1.55rem, 2.5vw, 2rem);
    font-weight: 600;
    line-height: 1.1;
}
.titre-panneau p {
    margin: 0.55rem 0 1.2rem;
    color: #c0ded2;
    font-size: 0.88rem;
}
.progression {
    margin-bottom: 1rem;
}
.progression-label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.4rem;
    color: #c0ded2;
    font-size: 0.73rem;
}
.progression-label strong {
    color: var(--craie);
}
.progression-piste {
    height: 0.42rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(0 0 0 / 22%);
}
.progression-piste span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--menthe), var(--soleil));
    box-shadow: 0 0 12px rgb(115 212 181 / 45%);
    transition: width 260ms ease;
}
.modele-courant {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin: 0 0 1rem;
    padding: 0.8rem;
    border: 1px solid rgb(248 201 91 / 29%);
    border-radius: 14px;
    background: linear-gradient(120deg, rgb(248 201 91 / 12%), rgb(248 201 91 / 4%));
}
.icone-navire {
    display: grid;
    flex: 0 0 auto;
    width: 2.45rem;
    height: 2.45rem;
    place-items: center;
    border-radius: 12px;
    background: rgb(248 201 91 / 15%);
    color: var(--soleil);
    font-size: 1.2rem;
}
.modele-courant div {
    display: grid;
    gap: 0.08rem;
}
.modele-courant small {
    color: var(--soleil);
    font-size: 0.58rem;
    font-weight: 750;
    letter-spacing: 0.14em;
}
.modele-courant strong {
    color: var(--craie);
    font-size: 0.88rem;
}
.modele-courant div > span {
    color: #c0ded2;
    font-size: 0.72rem;
}
.flotte {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
}
.flotte li {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 3.1rem;
    padding: 0.4rem 0.55rem;
    border-bottom: 1px solid rgb(255 255 255 / 9%);
    color: #a7c7ba;
    transition: background 180ms ease, color 180ms ease;
}
.flotte li.suivant {
    border-radius: 10px;
    background: rgb(115 212 181 / 9%);
    color: var(--craie);
}
.flotte li.termine {
    color: #a6d8bf;
}
.etat-navire {
    display: grid;
    flex: 0 0 auto;
    width: 1.8rem;
    height: 1.8rem;
    place-items: center;
    border: 1px solid var(--ligne);
    border-radius: 50%;
    color: #c0ded2;
    font-size: 0.66rem;
    font-weight: 700;
}
.termine .etat-navire {
    border-color: rgb(115 212 181 / 45%);
    background: rgb(115 212 181 / 14%);
    color: var(--menthe);
}
.suivant .etat-navire {
    border-color: rgb(248 201 91 / 55%);
    color: var(--soleil);
}
.nom-navire {
    display: grid;
    flex: 1;
    gap: 0.05rem;
    font-size: 0.82rem;
    font-weight: 650;
}
.nom-navire small {
    color: var(--attenue);
    font-size: 0.68rem;
    font-weight: 400;
}
.statut-navire {
    color: var(--attenue);
    font-size: 0.65rem;
}
.termine .statut-navire {
    color: var(--menthe);
}
.actions {
    display: grid;
    gap: 0.55rem;
}
.bouton-orientation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-color: rgb(115 212 181 / 32%);
    background: rgb(115 212 181 / 8%);
}
.bouton-orientation > span {
    color: var(--menthe);
    font-size: 1.15rem;
}
kbd {
    margin-left: 0.2rem;
    padding: 0.08rem 0.35rem;
    border: 1px solid rgb(255 255 255 / 20%);
    border-radius: 5px;
    color: var(--attenue);
    font: inherit;
    font-size: 0.68rem;
}
.actions-secondaires {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}
.actions-secondaires button {
    padding: 0.56rem 0.45rem;
    font-size: 0.76rem;
}
.bouton-aleatoire {
    color: #f9df93;
}
.bouton-aleatoire span {
    padding-right: 0.3rem;
}
.actions .principal {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.25rem;
    padding: 0.85rem 1rem;
}
</style>
