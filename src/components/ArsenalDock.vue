<script setup lang="ts">
// Arsenal : le coffre de l'équipage, fixé en bas de l'écran. Chaque outil montre son aperçu et une courte
// description. Quand un outil est « en main », sa carte se soulève et un bandeau le rappelle.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ApercuOutil from './ApercuOutil.vue'
import { CATALOGUE_OUTILS, STOCK_MAX, type IdentifiantOutil, type InventaireOutils } from '../game/outils.ts'

const proprietes = defineProps<{
    poissons: number
    inventaire: InventaireOutils
    outilEnMain: IdentifiantOutil | null
    aMoiDeJouer: boolean
    /** Tours restants avant de pouvoir réutiliser chaque outil. */
    recharges: InventaireOutils
    brouilleurActif: boolean
    urlPoisson: string
}>()
const emettre = defineEmits<{
    acheter: [identifiant: IdentifiantOutil]
    utiliser: [identifiant: IdentifiantOutil]
    reposer: []
    hauteur: [pixels: number]
}>()

// Sur petit écran, l'arsenal démarre replié (les grilles restent visibles) et se replie quand on prend un outil.
const petitEcran = window.matchMedia('(max-width: 760px)')
const replie = ref(petitEcran.matches)
watch(() => proprietes.outilEnMain, (outil) => { if (outil && petitEcran.matches) replie.value = true })
/** Toucher l'en-tête déploie ou replie l'arsenal (les boutons de l'en-tête gardent leur propre rôle). */
function basculerDepuisEntete(evenement: MouseEvent) {
    if ((evenement.target as HTMLElement).closest('button')) return
    replie.value = !replie.value
}
const racine = ref<HTMLElement>()
const outilTenu = computed(() => CATALOGUE_OUTILS.find((outil) => outil.identifiant === proprietes.outilEnMain) ?? null)

const manque = (prix: number) => Math.max(0, prix - proprietes.poissons)
const peutAcheter = (identifiant: IdentifiantOutil, prix: number) =>
    proprietes.poissons >= prix && proprietes.inventaire[identifiant] < STOCK_MAX
const indisponible = (identifiant: IdentifiantOutil) =>
    !proprietes.aMoiDeJouer || proprietes.inventaire[identifiant] < 1 || proprietes.recharges[identifiant] > 0 ||
    (identifiant === 'brouilleur' && proprietes.brouilleurActif)

const VERBES: Record<IdentifiantOutil, string> = { sonar: 'Scanner', brouilleur: 'Activer', bouee: 'Poser', drone: 'Envoyer' }
function etiquetteUtiliser(identifiant: IdentifiantOutil): string {
    if (proprietes.outilEnMain === identifiant) return 'En main ✓'
    if (proprietes.recharges[identifiant] > 0) return `Recharge ${proprietes.recharges[identifiant]}`
    if (identifiant === 'brouilleur' && proprietes.brouilleurActif) return 'Actif'
    return VERBES[identifiant]
}

// Le parent réserve la place du dock en bas de page : on lui donne sa hauteur réelle.
let observateur: ResizeObserver | undefined
onMounted(() => {
    observateur = new ResizeObserver(() => emettre('hauteur', racine.value?.offsetHeight ?? 0))
    if (racine.value) observateur.observe(racine.value)
})
onBeforeUnmount(() => observateur?.disconnect())
</script>

<template>
    <aside ref="racine" class="arsenal-dock" :class="{ replie, 'outil-en-main': outilTenu }" aria-label="Arsenal">
        <div class="dock-cadre">
            <header class="dock-tete" @click="basculerDepuisEntete">
                <template v-if="outilTenu">
                    <span class="tete-main"><ApercuOutil :outil="outilTenu" /></span>
                    <p class="tete-texte" role="status">
                        <strong>En main : {{ outilTenu.nom }}</strong>
                        <span>{{ outilTenu.usage }}</span>
                    </p>
                    <button type="button" class="reposer" @click="emettre('reposer')">Reposer <kbd>Échap</kbd></button>
                </template>
                <template v-else>
                    <h2>Arsenal</h2>
                    <p class="tete-texte"><span>Acheter ne coûte pas votre tour. Utiliser un outil, si.</span></p>
                    <span class="bourse-dock" aria-hidden="true"><img :src="urlPoisson" alt="" />{{ poissons }}</span>
                </template>
                <button type="button" class="replier" :aria-expanded="!replie" :aria-label="replie ? 'Déployer l’arsenal' : 'Replier l’arsenal'"
                    @click="replie = !replie">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                </button>
            </header>

            <div v-show="!replie" class="outils">
                <article v-for="outil in CATALOGUE_OUTILS" :key="outil.identifiant" class="carte-outil"
                    :class="{ 'en-main': outilEnMain === outil.identifiant, 'en-stock': inventaire[outil.identifiant] > 0 }">
                    <span v-if="outilEnMain === outil.identifiant" class="ruban">En main</span>
                    <div class="cadre-image">
                        <ApercuOutil :outil="outil" />
                        <span v-if="inventaire[outil.identifiant] > 0" :key="inventaire[outil.identifiant]" class="sceau">
                            <span class="sr-seulement">En stock : </span>×{{ inventaire[outil.identifiant] }}
                        </span>
                    </div>
                    <div class="contenu">
                        <h3>{{ outil.nom }}</h3>
                        <p class="description" :title="outil.description">{{ outil.description }}</p>
                        <p class="regles">
                            <span :class="outil.coutTour ? 'coute' : 'gratuit'">{{ outil.coutTour ? 'Coûte le tour' : 'Gratuit en tour' }}</span>
                            <span>Recharge {{ outil.recharge }} tours</span>
                        </p>
                        <p v-if="recharges[outil.identifiant] > 0" class="attente">Prêt dans {{ recharges[outil.identifiant] }} tour{{ recharges[outil.identifiant] > 1 ? 's' : '' }}</p>
                        <p v-else-if="outil.identifiant === 'brouilleur' && brouilleurActif" class="attente">Actif : attend un sonar adverse</p>
                        <p v-if="inventaire[outil.identifiant] < 1 && manque(outil.prix) > 0" class="manque">Il manque {{ manque(outil.prix) }} poissons</p>
                    </div>
                    <div class="actions">
                        <button type="button" class="acheter" :disabled="!peutAcheter(outil.identifiant, outil.prix)"
                            :aria-label="`Acheter ${outil.nom} pour ${outil.prix} poissons${manque(outil.prix) ? `, il manque ${manque(outil.prix)}` : ''}`"
                            @click="emettre('acheter', outil.identifiant)">
                            <span>Acheter</span>
                            <span class="prix"><img :src="urlPoisson" alt="" aria-hidden="true" />{{ outil.prix }}</span>
                        </button>
                        <button type="button" class="utiliser" :disabled="indisponible(outil.identifiant)"
                            :aria-pressed="outilEnMain === outil.identifiant"
                            @click="emettre('utiliser', outil.identifiant)">
                            {{ etiquetteUtiliser(outil.identifiant) }}
                        </button>
                    </div>
                </article>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.arsenal-dock {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 30;
    padding: 0 clamp(0.5rem, 3vw, 3rem);
    pointer-events: none;
    animation: monte 620ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
@keyframes monte {
    from { transform: translateY(105%); }
}
.dock-cadre {
    position: relative;
    max-width: 1380px;
    margin: 0 auto;
    padding: 0.7rem clamp(0.7rem, 1.6vw, 1.2rem) 0.85rem;
    border: 3px solid var(--cuivre);
    border-bottom: 0;
    border-radius: 22px 22px 0 0;
    background: var(--grain), linear-gradient(180deg, #f8edd1 0%, #ecd9ae 100%);
    box-shadow: 0 -16px 44px rgb(3 24 42 / 50%), inset 0 2px 0 rgb(255 255 255 / 55%), inset 0 -8px 20px rgb(120 80 30 / 14%);
    color: var(--encre);
    pointer-events: auto;
}
/* Rivets de laiton aux deux angles. */
.dock-cadre::before,
.dock-cadre::after {
    position: absolute;
    top: 10px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff0c4, #b88a3c 60%, #6d4a17);
    box-shadow: 0 1px 2px rgb(60 38 12 / 50%);
    content: '';
}
.dock-cadre::before { left: 12px; }
.dock-cadre::after { right: 12px; }

.dock-tete {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-height: 2.9rem;
    padding: 0 1.4rem 0.55rem;
}
.dock-tete h2 {
    margin: 0;
    color: var(--cuivre-fonce);
    font-family: var(--police-titres);
    font-size: 1.15rem;
    letter-spacing: 0.04em;
}
.tete-texte {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0 0.7rem;
    margin: 0;
    color: var(--encre-douce);
    font-size: 0.86rem;
    font-style: italic;
}
.tete-texte strong {
    color: var(--encre);
    font-family: var(--police-titres);
    font-size: 1rem;
    font-style: normal;
}
.bourse-dock {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0.8rem 0.15rem 0.5rem;
    border: 1.5px solid var(--cuivre);
    border-radius: 999px;
    background: rgb(255 250 235 / 70%);
    font-family: var(--police-titres);
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
.bourse-dock img {
    width: 2rem;
    height: 1.25rem;
    object-fit: contain;
}
.tete-main {
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    flex: none;
    place-items: center;
    border: 2px solid var(--cuivre);
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff6dc, #e8cf94);
    animation: balancement 1.8s ease-in-out infinite;
}
@keyframes balancement {
    50% { transform: translateY(-3px) rotate(-5deg); }
}
.reposer,
.replier {
    border-color: var(--cuivre-fonce);
    background: rgb(255 250 235 / 55%);
    color: var(--encre);
}
.reposer {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    font-weight: 700;
}
.reposer kbd {
    padding: 0 0.4rem;
    border: 1px solid var(--cuivre-fonce);
    border-radius: 6px;
    background: rgb(255 255 255 / 55%);
    font: inherit;
    font-size: 0.72rem;
}
.replier {
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    flex: none;
    place-items: center;
    padding: 0;
}
.replie .replier svg {
    transform: rotate(180deg);
}
.outil-en-main .dock-tete {
    margin: -0.7rem calc(-1 * clamp(0.7rem, 1.6vw, 1.2rem)) 0.5rem;
    padding-top: 0.55rem;
    border-radius: 19px 19px 0 0;
    background:
        repeating-linear-gradient(115deg, rgb(255 255 255 / 0%) 0 14px, rgb(255 255 255 / 20%) 14px 28px),
        linear-gradient(180deg, #f2c98a, #dfa35a);
    background-size: 56px 100%, 100% 100%;
    animation: defile 2.4s linear infinite;
}
@keyframes defile {
    to { background-position: 56px 0, 0 0; }
}

.outils {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    padding-top: 0.3rem;
}
.carte-outil {
    position: relative;
    display: grid;
    grid-template-columns: 5.3rem minmax(0, 1fr);
    grid-template-areas: 'image contenu' 'actions actions';
    gap: 0.6rem 0.75rem;
    padding: 0.7rem;
    border: 1.5px solid var(--papier-bord);
    border-radius: 16px;
    background: rgb(255 251 238 / 62%);
    box-shadow: 0 2px 0 rgb(120 80 30 / 12%);
    transition: transform 240ms cubic-bezier(0.2, 0.9, 0.25, 1), box-shadow 240ms ease, border-color 240ms ease, background 240ms ease;
}
.carte-outil:hover {
    transform: translateY(-3px);
    border-color: var(--cuivre);
    box-shadow: 0 10px 22px rgb(90 60 20 / 22%);
}
.carte-outil.en-stock { border-color: var(--cuivre-clair); }
.carte-outil.en-main {
    z-index: 1;
    transform: translateY(-9px) scale(1.025);
    border: 2.5px solid var(--cuivre);
    background: #fff6dc;
    box-shadow: 0 0 0 4px rgb(227 162 92 / 45%), 0 18px 34px rgb(90 60 20 / 34%);
    animation: halo 1.6s ease-in-out infinite;
}
@keyframes halo {
    50% { box-shadow: 0 0 0 8px rgb(227 162 92 / 18%), 0 18px 34px rgb(90 60 20 / 34%); }
}
.ruban {
    position: absolute;
    top: -0.75rem;
    left: 0.9rem;
    padding: 0.12rem 0.7rem;
    border-radius: 6px;
    background: linear-gradient(180deg, var(--cuivre-clair), var(--cuivre));
    box-shadow: 0 3px 6px rgb(60 38 12 / 35%);
    color: #2b1a08;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    animation: ruban-entre 360ms cubic-bezier(0.2, 1.2, 0.3, 1) both;
}
@keyframes ruban-entre {
    from { opacity: 0; transform: translateY(8px) scale(0.8); }
}
.cadre-image {
    position: relative;
    grid-area: image;
    width: 5.3rem;
    height: 5.3rem;
    border: 2px solid var(--cuivre-clair);
    border-radius: 14px;
    background: radial-gradient(circle at 50% 38%, #fbf3d8 0%, #ecd9a2 62%, #dcc283 100%);
    box-shadow: inset 0 2px 8px rgb(120 80 30 / 25%);
}
.cadre-image :deep(.apercu-outil) {
    padding: 0.35rem;
}
.sceau {
    position: absolute;
    right: -0.55rem;
    bottom: -0.55rem;
    display: grid;
    min-width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    padding: 0 0.3rem;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #cf5148, var(--cire) 62%, #6e1d17);
    box-shadow: 0 3px 6px rgb(60 20 15 / 45%), inset 0 -2px 3px rgb(0 0 0 / 22%);
    color: #fff3dc;
    font-size: 0.82rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    animation: sceau-pop 520ms cubic-bezier(0.2, 1.5, 0.3, 1) both;
}
@keyframes sceau-pop {
    0% { transform: scale(0.2) rotate(-40deg); }
    100% { transform: scale(1) rotate(0); }
}
.contenu {
    grid-area: contenu;
    min-width: 0;
}
.contenu h3 {
    margin: 0 0 0.2rem;
    font-family: var(--police-titres);
    font-size: 1.05rem;
    line-height: 1.15;
}
.description {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--encre-douce);
    font-size: 0.8rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
}
.regles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.4rem;
    margin: 0.35rem 0 0;
    font-size: 0.68rem;
    font-weight: 700;
}
.regles span {
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: rgb(184 115 51 / 14%);
    color: var(--encre-douce);
}
.regles .coute { background: rgb(163 50 42 / 16%); color: var(--cire); }
.regles .gratuit { background: rgb(31 122 108 / 16%); color: #1f6b5e; }
.attente {
    margin: 0.3rem 0 0;
    padding: 0.15rem 0.5rem;
    border-radius: 8px;
    background: rgb(184 115 51 / 18%);
    color: var(--cuivre-fonce);
    font-size: 0.74rem;
    font-weight: 700;
}
.actions {
    display: grid;
    grid-area: actions;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}
.actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.75rem;
    padding: 0.45rem 0.6rem;
    border: 1.5px solid var(--cuivre-fonce);
    border-radius: 12px;
    font-size: 0.86rem;
    font-weight: 700;
    white-space: nowrap;
}
.acheter {
    background: linear-gradient(180deg, #f0b46c, #c9843c);
    box-shadow: 0 2px 0 var(--cuivre-fonce);
    color: #2b1a08;
}
.acheter:hover:not(:disabled) {
    background: linear-gradient(180deg, #f7c585, #d6914a);
}
.prix {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: rgb(255 250 235 / 65%);
    font-variant-numeric: tabular-nums;
}
.prix img {
    width: 1.5rem;
    height: 1rem;
    object-fit: contain;
}
.utiliser {
    background: linear-gradient(180deg, #3fae9a, #23806f);
    box-shadow: 0 2px 0 #0f4f44;
    border-color: #0f4f44 !important;
    color: #fff8e6;
}
.utiliser:hover:not(:disabled) {
    background: linear-gradient(180deg, #4cc1ab, #2a917f);
}
.utiliser[aria-pressed='true'] {
    background: #fff6dc;
    box-shadow: inset 0 0 0 2px var(--cuivre);
    border-color: var(--cuivre) !important;
    color: var(--cuivre-fonce);
}
.actions button:disabled {
    border-color: var(--papier-bord) !important;
    background: rgb(214 195 150 / 60%);
    box-shadow: none;
    color: #6f5c3c;
    opacity: 1;
    cursor: not-allowed;
}
.actions button:disabled .prix {
    background: rgb(255 250 235 / 40%);
}
.manque {
    margin: 0.3rem 0 0;
    color: var(--cire);
    font-size: 0.72rem;
    font-weight: 800;
}
.sr-seulement {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
button:focus-visible {
    outline: 3px solid #1d6f8e;
    outline-offset: 2px;
}

/* Moins de 1000 px : quatre cartes ne tiennent plus côte à côte, l'arsenal défile à l'horizontale. */
@media (max-width: 999px) {
    .outils {
        grid-auto-flow: column;
        grid-auto-columns: min(46%, 18rem);
        grid-template-columns: none;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding: 0.8rem 0.2rem 0.4rem;
        scroll-snap-type: x mandatory;
    }
    .carte-outil {
        scroll-snap-align: start;
    }
}
@media (max-width: 760px) {
    .dock-tete {
        padding: 0 1rem 0.5rem;
    }
    .tete-texte span:not(strong + span) {
        display: none;
    }
    .outil-en-main .tete-texte span {
        display: inline;
    }
    .outils {
        grid-auto-columns: min(86%, 18rem);
    }
}
</style>
