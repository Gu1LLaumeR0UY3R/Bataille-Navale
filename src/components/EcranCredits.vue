<script setup lang="ts">
import { computed } from 'vue'
import { CREDITS, LIBELLES_CATEGORIES, type CategorieCredit } from '../game/credits.ts'

defineEmits<{ retour: [] }>()

const groupes = computed(() =>
    (Object.keys(LIBELLES_CATEGORIES) as CategorieCredit[])
        .map((categorie) => ({ categorie, libelle: LIBELLES_CATEGORIES[categorie], credits: CREDITS.filter((credit) => credit.categorie === categorie) }))
        .filter((groupe) => groupe.credits.length > 0))
</script>

<template>
    <section class="credits">
        <p class="surtitre">REMERCIEMENTS</p>
        <h1>Crédits</h1>
        <p class="note">Ce jeu utilise des créations de tiers, sous les licences de leurs auteurs. Merci à eux.</p>

        <div v-for="groupe in groupes" :key="groupe.categorie" class="carte">
            <h2>{{ groupe.libelle }}</h2>
            <ul>
                <li v-for="credit in groupe.credits" :key="credit.titre">
                    <strong>{{ credit.titre }}</strong>
                    <span>
                        {{ credit.auteur ?? 'Auteur à préciser' }}
                        ·
                        <a v-if="credit.licence && credit.urlLicence" :href="credit.urlLicence" target="_blank" rel="noopener noreferrer">{{ credit.licence }}</a>
                        <template v-else>{{ credit.licence ?? 'Licence à préciser' }}</template>
                        ·
                        <a :href="credit.source" target="_blank" rel="noopener noreferrer">Source</a>
                    </span>
                </li>
            </ul>
        </div>

        <div class="actions">
            <button type="button" class="principal" @click="$emit('retour')">Retour</button>
        </div>
    </section>
</template>

<style scoped>
.credits {
    max-width: 44rem;
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
ul {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
}
li {
    display: grid;
    gap: 0.1rem;
}
li span {
    color: var(--attenue);
    font-size: 0.85rem;
}
a {
    color: var(--soleil);
}
.actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.4rem;
}
</style>
