<script setup lang="ts">
// Écran de fin de partie : le bilan de la traversée, en victoire comme en défaite.
// Le sceau de cire tombe avec un petit choc, les chiffres montent, des confettis (victoire) ou des bulles
// (défaite) animent la carte. « Voir la mer » referme le bilan pour regarder le plateau final.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { reglages } from '../game/options.ts'
import { formaterDuree, rangDeFin, type StatsPartie } from '../game/stats.ts'

const proprietes = defineProps<{ victoire: boolean, stats: StatsPartie, urlPoisson: string }>()
const emettre = defineEmits<{ rejouer: [], menu: [], voir: [] }>()

const rang = computed(() => rangDeFin(proprietes.victoire, proprietes.stats.tirs))
const boutonRejouer = ref<HTMLButtonElement>()

// Chiffres qui montent de 0 à leur valeur ; sans animation (réglage ou préférence système), ils s'affichent d'un coup.
const cibles = computed(() => ({
    tirs: proprietes.stats.tirs,
    precision: Math.round(proprietes.stats.precision * 100),
    coules: proprietes.stats.naviresCoules,
    perdus: proprietes.stats.naviresPerdus,
    gagnes: proprietes.stats.poissonsGagnes,
    depenses: proprietes.stats.poissonsDepenses,
    outils: proprietes.stats.outilsUtilises,
    boucliers: proprietes.stats.boucliersBloques,
}))
const affiche = reactive<Record<keyof typeof cibles.value, number>>({ tirs: 0, precision: 0, coules: 0, perdus: 0, gagnes: 0, depenses: 0, outils: 0, boucliers: 0 })
let image = 0

function monter() {
    const reduit = reglages.reduireAnimations || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduit) {
        Object.assign(affiche, cibles.value)
        return
    }
    const debut = performance.now() + 700 // les chiffres démarrent une fois le sceau posé
    const duree = 1100
    const pas = (maintenant: number) => {
        const t = Math.min(1, Math.max(0, (maintenant - debut) / duree))
        const progression = 1 - Math.pow(1 - t, 3)
        for (const cle of Object.keys(cibles.value) as (keyof typeof affiche)[]) {
            affiche[cle] = Math.round(cibles.value[cle] * progression)
        }
        if (t < 1) image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
}

function surTouche(evenement: KeyboardEvent) {
    if (evenement.key === 'Escape') emettre('voir')
}
onMounted(() => {
    monter()
    window.addEventListener('keydown', surTouche)
    boutonRejouer.value?.focus()
})
onBeforeUnmount(() => {
    cancelAnimationFrame(image)
    window.removeEventListener('keydown', surTouche)
})

/** Confettis : position, délai, durée et couleur varient d'un morceau à l'autre. */
const COULEURS_CONFETTIS = ['#e3a25c', '#f5d27a', '#3fae9a', '#e8725a', '#fff3d0', '#6ec5d9']
const confettis = Array.from({ length: 34 }, (_, i) => ({
    gauche: `${(i * 97) % 100}%`,
    delai: `${((i * 37) % 24) / 10}s`,
    duree: `${3.4 + ((i * 53) % 20) / 10}s`,
    couleur: COULEURS_CONFETTIS[i % COULEURS_CONFETTIS.length]!,
    rotation: `${(i * 71) % 360}deg`,
}))
const bulles = Array.from({ length: 16 }, (_, i) => ({
    gauche: `${(i * 83) % 100}%`,
    delai: `${((i * 41) % 30) / 10}s`,
    duree: `${4 + ((i * 29) % 30) / 10}s`,
    taille: `${0.5 + ((i * 17) % 10) / 10}rem`,
}))
</script>

<template>
    <div class="fin-fond" :class="victoire ? 'fond-victoire' : 'fond-defaite'">
        <section class="fin-carte" :class="victoire ? 'victoire' : 'defaite'" role="dialog" aria-modal="true"
            aria-labelledby="titre-fin" aria-describedby="devise-fin">
            <div v-if="victoire" class="confettis" aria-hidden="true">
                <span v-for="(c, i) in confettis" :key="i" :style="{ left: c.gauche, animationDelay: c.delai, animationDuration: c.duree, background: c.couleur, '--rotation': c.rotation }"></span>
            </div>
            <div v-else class="bulles" aria-hidden="true">
                <span v-for="(b, i) in bulles" :key="i" :style="{ left: b.gauche, animationDelay: b.delai, animationDuration: b.duree, width: b.taille, height: b.taille }"></span>
            </div>

            <div class="medaille" aria-hidden="true">
                <span class="onde"></span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path v-if="victoire" d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.3 1.3-6.5L2.5 9.4l6.6-.8z" fill="currentColor" fill-opacity="0.25" />
                    <template v-else>
                        <path d="M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4" /><path d="M12 7v13" /><path d="M8 11h8" /><path d="M5 13a7 7 0 0 0 14 0" />
                    </template>
                </svg>
            </div>

            <p class="surtitre">{{ victoire ? 'MISSION ACCOMPLIE' : 'FIN DE LA TRAVERSÉE' }}</p>
            <h2 id="titre-fin">{{ victoire ? 'Victoire !' : 'Défaite' }}</h2>
            <p class="rang"><strong>{{ rang.titre }}</strong></p>
            <p id="devise-fin" class="devise">{{ rang.devise }}</p>

            <dl class="bilan">
                <div class="stat" style="--i: 0"><dt>Tirs</dt><dd>{{ affiche.tirs }}</dd></div>
                <div class="stat" style="--i: 1">
                    <dt>Précision</dt><dd>{{ affiche.precision }} %</dd>
                    <span class="jauge" aria-hidden="true"><span :style="{ width: `${affiche.precision}%` }"></span></span>
                </div>
                <div class="stat" style="--i: 2"><dt>Navires coulés</dt><dd>{{ affiche.coules }}<small> / {{ stats.naviresTotal }}</small></dd></div>
                <div class="stat" style="--i: 3"><dt>Navires perdus</dt><dd>{{ affiche.perdus }}<small> / {{ stats.naviresTotal }}</small></dd></div>
                <div class="stat" style="--i: 4"><dt>Durée</dt><dd class="duree">{{ formaterDuree(stats.dureeMs) }}</dd></div>
                <div class="stat" style="--i: 5">
                    <dt>Poissons</dt>
                    <dd><img :src="urlPoisson" alt="" aria-hidden="true" />{{ affiche.gagnes }}<small> gagnés · {{ affiche.depenses }} dépensés</small></dd>
                </div>
                <div class="stat" style="--i: 6"><dt>Outils utilisés</dt><dd>{{ affiche.outils }}</dd></div>
                <div class="stat" style="--i: 7"><dt>Tirs bloqués</dt><dd>{{ affiche.boucliers }}<small> par bouclier</small></dd></div>
            </dl>

            <div class="actions">
                <button ref="boutonRejouer" type="button" class="rejouer" @click="emettre('rejouer')">⚓ Rejouer une partie</button>
                <button type="button" @click="emettre('menu')">Menu principal</button>
                <button type="button" class="discret" @click="emettre('voir')">Voir la mer <kbd>Échap</kbd></button>
            </div>

            <div v-if="victoire" class="banc" aria-hidden="true">
                <img v-for="n in 3" :key="n" :src="urlPoisson" alt="" :style="{ animationDelay: `${(n - 1) * -2.6}s`, top: `${(n % 3) * 0.5}rem` }" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.fin-fond {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow-y: auto;
    animation: fond-entre 500ms ease both;
}
.fond-victoire { background: radial-gradient(ellipse at 50% 30%, rgb(255 214 130 / 30%), rgb(6 28 46 / 78%) 70%); }
.fond-defaite { background: radial-gradient(ellipse at 50% 30%, rgb(70 90 120 / 35%), rgb(4 16 28 / 88%) 70%); backdrop-filter: saturate(0.55); }
@keyframes fond-entre { from { opacity: 0; } }

.fin-carte {
    position: relative;
    width: min(46rem, 100%);
    max-height: calc(100vh - 2rem);
    padding: 2.6rem 2rem 1.6rem;
    overflow: hidden auto;
    border: 3px solid var(--cuivre);
    border-radius: 28px;
    background: var(--grain), linear-gradient(180deg, #f9eed3, #ecd8aa);
    box-shadow: 0 34px 80px rgb(3 24 42 / 60%), inset 0 2px 0 rgb(255 255 255 / 55%);
    color: var(--encre);
    text-align: center;
    animation: carte-entre 700ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
.fin-carte.defaite {
    border-color: #6b7b8c;
    background: var(--grain), linear-gradient(180deg, #e8e4d8, #cfc9b8);
}
@keyframes carte-entre {
    from { opacity: 0; transform: translateY(34px) scale(0.94); }
}

/* Médaille : le sceau tombe avec un choc et une onde. */
.medaille {
    position: relative;
    display: grid;
    width: 6.4rem;
    height: 6.4rem;
    margin: 0 auto 0.6rem;
    place-items: center;
    border: 4px solid #8a5a1c;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 28%, #fff0c4, #e0a843 55%, #a8731a);
    box-shadow: 0 10px 22px rgb(80 50 10 / 45%), inset 0 -5px 10px rgb(90 55 10 / 35%);
    color: #7a4a0f;
    animation: tampon 760ms cubic-bezier(0.3, 1.5, 0.4, 1) 250ms both;
}
.defaite .medaille {
    border-color: #5a1b16;
    background: radial-gradient(circle at 35% 28%, #d8665c, #a3322a 58%, #6e1d17);
    color: #fff0e2;
}
.medaille svg { width: 3.6rem; height: 3.6rem; }
@keyframes tampon {
    0% { opacity: 0; transform: scale(2.8) rotate(-24deg); }
    55% { opacity: 1; transform: scale(0.9) rotate(4deg); }
    100% { opacity: 1; transform: scale(1) rotate(-3deg); }
}
.onde {
    position: absolute;
    inset: -4px;
    border: 3px solid rgb(227 162 92 / 70%);
    border-radius: 50%;
    opacity: 0;
    animation: onde 900ms ease-out 700ms both;
}
@keyframes onde {
    0% { opacity: 0.9; transform: scale(1); }
    100% { opacity: 0; transform: scale(2.1); }
}

.surtitre {
    margin: 0;
    color: var(--cuivre-fonce);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    animation: monte 500ms ease 650ms both;
}
h2 {
    margin: 0.1rem 0 0;
    font-family: var(--police-titres);
    font-size: clamp(2.4rem, 6vw, 3.6rem);
    letter-spacing: -0.02em;
    line-height: 1.05;
    animation: titre 800ms cubic-bezier(0.2, 0.9, 0.25, 1) 700ms both;
}
.victoire h2 { color: #7a4a0f; text-shadow: 0 2px 0 rgb(255 255 255 / 60%); }
.defaite h2 { color: #3d4a58; }
@keyframes titre {
    from { opacity: 0; transform: translateY(14px) scale(0.9); }
    to { opacity: 1; transform: none; }
}
@keyframes monte {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
}
.rang {
    margin: 0.2rem 0 0;
    font-family: var(--police-titres);
    font-size: 1.25rem;
    animation: monte 500ms ease 900ms both;
}
.devise {
    margin: 0.2rem 0 1.1rem;
    color: var(--encre-douce);
    font-style: italic;
    animation: monte 500ms ease 1000ms both;
}

.bilan {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.6rem;
    margin: 0 0 1.3rem;
}
.stat {
    position: relative;
    padding: 0.6rem 0.4rem 0.7rem;
    border: 1.5px solid var(--papier-bord);
    border-radius: 14px;
    background: rgb(255 251 238 / 65%);
    animation: monte 450ms ease both;
    animation-delay: calc(1000ms + var(--i) * 80ms);
}
.defaite .stat { border-color: #a8a08a; background: rgb(255 255 255 / 40%); }
.stat dt {
    color: var(--cuivre-fonce);
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}
.stat dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 0 0.3rem;
    margin: 0.2rem 0 0;
    font-family: var(--police-titres);
    font-size: 1.7rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
}
.stat dd.duree { font-size: 1.3rem; padding-top: 0.2rem; }
.stat dd small {
    flex-basis: 100%;
    color: var(--encre-douce);
    font-family: inherit;
    font-size: 0.72rem;
    font-weight: 500;
}
.stat dd img { width: 1.8rem; height: 1.1rem; object-fit: contain; align-self: center; }
.jauge {
    display: block;
    height: 0.4rem;
    margin: 0.4rem 0.6rem 0;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(120 80 30 / 18%);
}
.jauge span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #3fae9a, #e3a25c); }

.actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    animation: monte 500ms ease 1700ms both;
}
.actions button {
    min-height: 2.9rem;
    padding: 0.55rem 1.3rem;
    border: 1.5px solid var(--cuivre-fonce);
    border-radius: 14px;
    background: rgb(255 250 235 / 60%);
    color: var(--encre);
    font-weight: 700;
}
.actions .rejouer {
    border-color: transparent;
    background: linear-gradient(180deg, #f0b46c, #c9843c);
    box-shadow: 0 3px 0 var(--cuivre-fonce);
    font-size: 1.02rem;
}
.actions .rejouer:hover { background: linear-gradient(180deg, #f7c585, #d6914a); }
.defaite .actions .rejouer { background: linear-gradient(180deg, #8ea4bc, #667d96); color: #fff; }
.actions .discret { border-style: dashed; font-weight: 600; }
.actions kbd {
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--cuivre-fonce);
    border-radius: 6px;
    font: inherit;
    font-size: 0.72rem;
}
button:focus-visible { outline: 3px solid #1d6f8e; outline-offset: 2px; }

/* Décor animé : confettis (victoire), bulles (défaite), banc de thons. */
.confettis, .bulles { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.confettis span {
    position: absolute;
    top: -1.2rem;
    width: 0.55rem;
    height: 0.95rem;
    border-radius: 2px;
    animation: confetti linear infinite;
}
@keyframes confetti {
    0% { transform: translateY(0) rotate(var(--rotation)); opacity: 1; }
    100% { transform: translateY(120vh) rotate(calc(var(--rotation) + 540deg)); opacity: 0.9; }
}
.bulles span {
    position: absolute;
    bottom: -2rem;
    border: 2px solid rgb(255 255 255 / 55%);
    border-radius: 50%;
    background: rgb(255 255 255 / 12%);
    animation: bulle ease-in infinite;
}
@keyframes bulle {
    0% { transform: translateY(0) translateX(0); opacity: 0; }
    15% { opacity: 1; }
    100% { transform: translateY(-110vh) translateX(1.2rem); opacity: 0; }
}
.banc { position: relative; height: 2.6rem; margin: 1rem -2rem -1.1rem; overflow: hidden; }
.banc img {
    position: absolute;
    left: -5rem;
    width: 3.4rem;
    opacity: 0.85;
    animation: nage 8s linear infinite;
}
@keyframes nage {
    from { transform: translateX(0) translateY(0); }
    50% { transform: translateX(30rem) translateY(0.5rem); }
    to { transform: translateX(64rem) translateY(0); }
}

@media (max-width: 640px) {
    .fin-carte { padding: 2rem 1rem 1.2rem; }
    .bilan { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
