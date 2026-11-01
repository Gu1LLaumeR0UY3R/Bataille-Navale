<script setup lang="ts">
// Arrivée des poissons : une petite banc de thons jaillit de la mer et nage en arc jusqu'au compteur.
// À chaque arrivée, le parent crédite le compteur (événement `arrivee`) et un son bref se joue.
// Avec « Réduire les animations », les poissons ne volent pas : le compteur monte directement.
import { onBeforeUnmount, ref } from 'vue'
import { reglages } from '../game/options.ts'
import { sonPoisson } from '../game/son.ts'

const proprietes = defineProps<{ urlPoisson: string }>()
const emettre = defineEmits<{ arrivee: [valeur: number] }>()

const couche = ref<HTMLElement>()
const enVol = new Set<number>()
const minuteries = new Set<ReturnType<typeof setTimeout>>()

const animationsReduites = () =>
    reglages.reduireAnimations || window.matchMedia('(prefers-reduced-motion: reduce)').matches

const borner = (valeur: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, valeur))

/** Point de départ : le centre de `source` s'il est visible, sinon le bas de l'écran. */
function pointDepart(source: HTMLElement | null | undefined): { x: number, y: number } {
    const rectangle = source?.getBoundingClientRect()
    if (rectangle && rectangle.bottom > 0 && rectangle.top < window.innerHeight) {
        return {
            x: rectangle.left + rectangle.width * (0.25 + Math.random() * 0.5),
            y: borner(rectangle.top + rectangle.height * (0.45 + Math.random() * 0.3), 80, window.innerHeight - 30),
        }
    }
    return { x: window.innerWidth * (0.2 + Math.random() * 0.6), y: window.innerHeight + 30 }
}

function envoler(cible: HTMLElement, source: HTMLElement | null | undefined, valeur: number, rang: number, dernier: boolean) {
    if (!couche.value) return
    const arrivee = cible.getBoundingClientRect()
    const x2 = arrivee.left + arrivee.width / 2
    const y2 = arrivee.top + arrivee.height / 2
    const depart = pointDepart(source)
    // Courbe de Bézier : le poisson monte plus haut que la cible, puis redescend vers elle.
    const x1 = (depart.x + x2) / 2 + (Math.random() - 0.5) * 260
    const y1 = Math.min(depart.y, y2) - 140 - Math.random() * 120
    const duree = 1150 + Math.random() * 350
    const phase = Math.random() * Math.PI * 2

    const poisson = document.createElement('img')
    poisson.src = proprietes.urlPoisson
    poisson.alt = ''
    poisson.className = 'poisson-vol'
    couche.value.appendChild(poisson)

    const identifiant = Math.random()
    enVol.add(identifiant)
    const debut = performance.now()
    const image = (maintenant: number) => {
        const t = borner((maintenant - debut) / duree, 0, 1)
        const u = 1 - t
        const px = u * u * depart.x + 2 * u * t * x1 + t * t * x2
        const py = u * u * depart.y + 2 * u * t * y1 + t * t * y2
        // Direction de nage : tangente de la courbe. L'image regarde vers la droite ; vers la gauche on la retourne.
        const dx = 2 * u * (x1 - depart.x) + 2 * t * (x2 - x1)
        const dy = 2 * u * (y1 - depart.y) + 2 * t * (y2 - y1)
        const angle = Math.atan2(dy, dx)
        const retourne = dx < 0
        const ondulation = Math.sin(t * 16 + phase) * 0.16
        const largeur = 46 * (1 - 0.5 * t * t * t)
        const opacite = Math.min(1, t * 8) * (t > 0.92 ? (1 - t) / 0.08 : 1)
        poisson.style.width = `${largeur}px`
        poisson.style.opacity = String(opacite)
        poisson.style.transform = `translate3d(${px - largeur / 2}px, ${py - largeur / 4}px, 0) rotate(${retourne ? angle - Math.PI : angle}rad) rotate(${ondulation}rad) scaleX(${retourne ? -1 : 1})`
        if (t < 1) {
            requestAnimationFrame(image)
            return
        }
        poisson.remove()
        enVol.delete(identifiant)
        sonPoisson(rang)
        emettre('arrivee', valeur)
        if (dernier) montrerGain(cible)
    }
    requestAnimationFrame(image)
}

/** Petit « +10 » qui s'élève du compteur quand le dernier poisson arrive. */
let gainCourant = 0
function montrerGain(cible: HTMLElement) {
    if (!couche.value || gainCourant <= 0) return
    const rectangle = cible.getBoundingClientRect()
    const gain = document.createElement('span')
    gain.className = 'gain-vol'
    gain.textContent = `+${gainCourant}`
    gain.style.left = `${rectangle.left + rectangle.width / 2}px`
    gain.style.top = `${rectangle.top}px`
    couche.value.appendChild(gain)
    gainCourant = 0
    setTimeout(() => gain.remove(), 1500)
}

/**
 * Lance `nombre` poissons vers `cible`. Ils valent ensemble `total` poissons (réparti à parts égales).
 * `source` : élément d'où ils jaillissent (par exemple la grille de sa flotte).
 */
function lancer(nombre: number, total: number, cible: HTMLElement | null | undefined, source?: HTMLElement | null) {
    if (!cible || !couche.value) {
        emettre('arrivee', total)
        return
    }
    if (animationsReduites()) {
        sonPoisson(0)
        emettre('arrivee', total)
        return
    }
    gainCourant += total
    const part = Math.floor(total / nombre)
    for (let rang = 0; rang < nombre; rang++) {
        const valeur = rang === nombre - 1 ? total - part * (nombre - 1) : part
        const minuterie = setTimeout(() => {
            minuteries.delete(minuterie)
            envoler(cible, source, valeur, rang, rang === nombre - 1)
        }, rang * 130)
        minuteries.add(minuterie)
    }
}

defineExpose({ lancer })
onBeforeUnmount(() => {
    minuteries.forEach(clearTimeout)
    couche.value?.replaceChildren()
})
</script>

<template>
    <div ref="couche" class="couche-poissons" aria-hidden="true"></div>
</template>

<style>
/* Non « scoped » : les poissons et le « +10 » sont créés à la main, hors du rendu Vue. */
.couche-poissons {
    position: fixed;
    inset: 0;
    z-index: 70;
    overflow: hidden;
    pointer-events: none;
}
.poisson-vol {
    position: absolute;
    top: 0;
    left: 0;
    height: auto;
    filter: drop-shadow(0 4px 6px rgb(3 24 42 / 45%));
    will-change: transform;
}
.gain-vol {
    position: absolute;
    padding: 0.1rem 0.7rem;
    border-radius: 999px;
    background: var(--papier);
    box-shadow: 0 6px 16px rgb(3 24 42 / 40%);
    color: var(--cuivre-fonce);
    font-family: var(--police-titres);
    font-size: 1.35rem;
    font-weight: 800;
    transform: translate(-50%, 0);
    animation: gain-monte 1.5s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}
@keyframes gain-monte {
    0% { opacity: 0; transform: translate(-50%, 10px) scale(0.6); }
    18% { opacity: 1; transform: translate(-50%, -14px) scale(1.15); }
    100% { opacity: 0; transform: translate(-50%, -52px) scale(1); }
}
</style>
