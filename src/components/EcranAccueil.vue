<script setup lang="ts">
defineEmits<{ jouer: [], options: [] }>()
</script>

<template>
    <section class="accueil">
        <div class="soleil" aria-hidden="true"></div>
        <div class="vagues" aria-hidden="true">
            <svg class="vague vague-1" viewBox="0 0 2400 200" preserveAspectRatio="none"><path d="M0 100 Q150 40 300 100 T600 100 T900 100 T1200 100 T1500 100 T1800 100 T2100 100 T2400 100 V200 H0Z" /></svg>
            <svg class="vague vague-2" viewBox="0 0 2400 200" preserveAspectRatio="none"><path d="M0 100 Q150 160 300 100 T600 100 T900 100 T1200 100 T1500 100 T1800 100 T2100 100 T2400 100 V200 H0Z" /></svg>
            <svg class="vague vague-3" viewBox="0 0 2400 200" preserveAspectRatio="none"><path d="M0 100 Q150 50 300 100 T600 100 T900 100 T1200 100 T1500 100 T1800 100 T2100 100 T2400 100 V200 H0Z" /></svg>
        </div>

        <div class="contenu">
            <p class="surtitre">L’ARCHIPEL · CLUB NAUTIQUE</p>
            <h1><span>Bataille</span> Navale</h1>
            <p class="accroche">Placez votre flotte. Devinez le cap de l’ennemi. Coulez-le avant qu’il ne vous coule.</p>
            <nav class="menu" aria-label="Menu principal">
                <button type="button" class="principal gros" @click="$emit('jouer')">JOUER</button>
                <button type="button" class="gros" @click="$emit('options')">OPTIONS</button>
            </nav>
        </div>
    </section>
</template>

<style scoped>
.accueil {
    position: relative;
    display: grid;
    min-height: 100vh;
    place-items: center;
    overflow: hidden;
    padding: 2rem 1.25rem 12rem;
    isolation: isolate;
}
.soleil {
    position: absolute;
    z-index: -2;
    right: 5vw;
    bottom: 22%;
    width: clamp(8rem, 20vw, 16rem);
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 40% 40%, #fff1c2, #ffd070 45%, #ffb347 100%);
    box-shadow: 0 0 100px 30px rgb(255 200 100 / 35%);
}
@media (max-width: 900px) {
    .soleil { right: 50%; bottom: 24%; transform: translateX(50%); opacity: 0.45; }
}
.contenu {
    max-width: 44rem;
    text-align: center;
}
.surtitre {
    margin: 0 0 0.8rem;
    color: var(--soleil);
    font-size: 0.74rem;
    font-weight: 750;
    letter-spacing: 0.3em;
}
h1 {
    margin: 0;
    font-family: var(--police-titres);
    font-size: clamp(2.8rem, 9vw, 6.4rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 0.98;
    text-shadow: 0 4px 30px rgb(4 28 48 / 55%);
}
h1 span {
    display: block;
    color: var(--soleil);
    font-size: 0.62em;
    font-style: italic;
    font-weight: 500;
    letter-spacing: 0.02em;
}
.accroche {
    max-width: 30rem;
    margin: 1.2rem auto 2.2rem;
    color: #e6f3f6;
    font-size: clamp(1rem, 2vw, 1.15rem);
    text-shadow: 0 2px 12px rgb(4 28 48 / 60%);
}
.menu {
    display: grid;
    gap: 0.8rem;
    width: min(100%, 20rem);
    margin: 0 auto;
}
.gros {
    padding: 1rem 1.5rem;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.24em;
    border-radius: 14px;
    background: rgb(7 38 63 / 55%);
    backdrop-filter: blur(6px);
}
.principal.gros {
    background: linear-gradient(135deg, #ffd27a, #ffa940);
}
.vagues {
    position: absolute;
    z-index: -1;
    inset: auto 0 0;
    height: 34vh;
    min-height: 12rem;
}
.vague {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 200%;
    height: 100%;
    animation: derive linear infinite;
}
.vague-1 { fill: #1a7fa3; opacity: 0.85; animation-duration: 34s; height: 90%; }
.vague-2 { fill: #0f5f86; opacity: 0.92; animation-duration: 24s; animation-direction: reverse; height: 70%; }
.vague-3 { fill: #082a45; animation-duration: 18s; height: 48%; }
@keyframes derive {
    to { transform: translateX(-50%); }
}
</style>
