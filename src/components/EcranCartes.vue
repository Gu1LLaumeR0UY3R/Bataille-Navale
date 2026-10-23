<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { chargerCartes } from '../maps/chargeur.ts'
import type { Carte } from '../maps/types.ts'
import type { Couleur } from '../game/types.ts'

const emettre = defineEmits<{ choisir: [carte: Carte], retour: [] }>()

const cartes = ref<Carte[]>([])
const chargement = ref(true)
/** 'aleatoire' ou l'identifiant d'une carte. */
const selection = ref<string>('aleatoire')

onMounted(async () => {
    cartes.value = await chargerCartes()
    chargement.value = false
})

const rgb = (c: Couleur, clair = 1) => `rgb(${c.map((v) => Math.round(Math.min(1, v * clair) * 255)).join(' ')})`
function apercu(carte: Carte) {
    const { ciel, eau, soleil } = carte.ambiance
    return {
        background: `radial-gradient(circle at 78% 28%, ${rgb(soleil.couleur)} 0 7%, transparent 8%), `
            + `linear-gradient(180deg, ${rgb(ciel, 1.25)} 0%, ${rgb(ciel)} 44%, ${rgb(eau, 1.3)} 45%, ${rgb(eau, 0.7)} 100%)`,
    }
}

const carteSelectionnee = computed(() => cartes.value.find((carte) => carte.id === selection.value) ?? null)

function confirmer() {
    const carte = carteSelectionnee.value ?? cartes.value[Math.floor(Math.random() * cartes.value.length)]
    if (carte) emettre('choisir', carte)
}
</script>

<template>
    <section class="cartes">
        <p class="surtitre">NOUVELLE PARTIE</p>
        <h1>Choisissez votre carte</h1>

        <p v-if="chargement" class="etat" role="status">Chargement des cartes…</p>
        <div v-else class="grille-cartes" role="radiogroup" aria-label="Cartes disponibles">
            <label class="tuile" :class="{ choisie: selection === 'aleatoire' }">
                <input v-model="selection" type="radio" name="carte" value="aleatoire" />
                <span class="visuel hasard" aria-hidden="true">
                    <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="32" cy="32" r="28" />
                        <path d="M16 24c10 0 12 16 24 16h6M16 40c10 0 12-16 24-16h6" />
                        <path d="M42 18l6 6-6 6M42 34l6 6-6 6" />
                    </svg>
                </span>
                <strong>Aléatoire</strong>
            </label>
            <label v-for="carte in cartes" :key="carte.id" class="tuile" :class="{ choisie: selection === carte.id }">
                <input v-model="selection" type="radio" name="carte" :value="carte.id" />
                <span class="visuel" :style="carte.apercu ? undefined : apercu(carte)" aria-hidden="true">
                    <img v-if="carte.apercu" :src="`${carte.base}${carte.apercu}`" alt="" loading="lazy" />
                </span>
                <strong>{{ carte.nom }}</strong>
            </label>
        </div>

        <p v-if="!chargement" class="description" aria-live="polite">
            {{ carteSelectionnee ? carteSelectionnee.description : 'Une carte tirée au sort parmi toutes celles disponibles.' }}
        </p>

        <div class="actions">
            <button type="button" @click="emettre('retour')">← Retour</button>
            <button type="button" class="principal" :disabled="chargement" @click="confirmer">Continuer →</button>
        </div>
    </section>
</template>

<style scoped>
.cartes {
    max-width: 52rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 5vw, 3rem) 0;
    text-align: center;
}
.surtitre {
    margin: 0 0 0.4rem;
    color: var(--soleil);
    font-size: 0.7rem;
    font-weight: 750;
    letter-spacing: 0.22em;
}
h1 {
    margin: 0 0 1.6rem;
    font-family: var(--police-titres);
    font-size: clamp(2rem, 5vw, 3.2rem);
}
.etat {
    color: var(--attenue);
}
.grille-cartes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(0.6rem, 2vw, 1.1rem);
}
@media (max-width: 520px) {
    .grille-cartes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.tuile {
    position: relative;
    display: grid;
    gap: 0.5rem;
    cursor: pointer;
}
.tuile input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
}
.visuel {
    display: grid;
    aspect-ratio: 4 / 3;
    place-items: center;
    overflow: hidden;
    border: 2px solid var(--ligne);
    border-radius: 22px;
    box-shadow: 0 10px 26px rgb(3 24 42 / 30%);
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.visuel img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.hasard {
    background: rgb(7 38 63 / 70%);
    color: var(--craie);
}
.tuile:hover .visuel {
    transform: translateY(-3px);
}
.tuile.choisie .visuel {
    border-color: var(--soleil);
    box-shadow: 0 0 0 3px rgb(255 198 90 / 30%), 0 14px 30px rgb(3 24 42 / 40%);
}
.tuile input:focus-visible + .visuel {
    outline: 3px solid var(--soleil);
    outline-offset: 3px;
}
.tuile strong {
    font-family: var(--police-titres);
    font-size: 1.05rem;
}
.description {
    min-height: 1.6em;
    margin: 1.4rem 0 0;
    color: var(--attenue);
}
.actions {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    margin-top: 1.6rem;
}
</style>
