<script setup lang="ts">
defineEmits<{ ia: [], retour: [] }>()
</script>

<template>
    <section class="mode">
        <p class="surtitre">NOUVELLE PARTIE</p>
        <h1>Choisissez votre mode</h1>

        <div class="choix">
            <button type="button" class="carte actif" @click="$emit('ia')">
                <span class="icone" aria-hidden="true">⚓</span>
                <strong>Contre l’IA</strong>
                <span class="texte">Affrontez un amiral virtuel. Trois niveaux de difficulté.</span>
                <span class="cta">Jouer →</span>
            </button>
            <button type="button" class="carte" disabled>
                <span class="icone" aria-hidden="true">⚔</span>
                <strong>Multijoueur</strong>
                <span class="texte">Défiez un ami en ligne.</span>
                <span class="badge">Bientôt disponible</span>
            </button>
        </div>

        <button type="button" class="retour" @click="$emit('retour')">← Retour</button>
    </section>
</template>

<style scoped>
.mode {
    max-width: 50rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 5vw, 3.5rem) 0;
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
    margin: 0 0 2rem;
    font-family: var(--police-titres);
    font-size: clamp(2rem, 5vw, 3.2rem);
}
.choix {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.2rem;
}
@media (max-width: 640px) {
    .choix { grid-template-columns: 1fr; }
}
.carte {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    padding: 1.8rem 1.4rem;
    border-radius: 20px;
    background: var(--panneau);
    backdrop-filter: blur(10px);
}
.carte.actif {
    border-color: rgb(255 198 90 / 60%);
    box-shadow: 0 0 0 1px rgb(255 198 90 / 15%), 0 18px 40px rgb(3 24 42 / 35%);
}
.icone {
    display: grid;
    width: 3.4rem;
    height: 3.4rem;
    place-items: center;
    border: 1px solid rgb(255 198 90 / 50%);
    border-radius: 50%;
    color: var(--soleil);
    font-size: 1.6rem;
}
strong {
    font-family: var(--police-titres);
    font-size: 1.45rem;
}
.texte {
    color: var(--attenue);
    font-size: 0.92rem;
}
.cta {
    margin-top: 0.4rem;
    color: var(--soleil);
    font-weight: 700;
    letter-spacing: 0.08em;
}
.badge {
    margin-top: 0.4rem;
    padding: 0.25rem 0.8rem;
    border: 1px solid var(--ligne);
    border-radius: 999px;
    font-size: 0.74rem;
}
.retour {
    margin-top: 2rem;
}
</style>
