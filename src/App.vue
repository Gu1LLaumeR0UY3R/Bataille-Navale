<script setup lang="ts">
// Démo LOCALE : l'adversaire est simulé dans le navigateur.
// Quand le serveur PHP existera, les trois endroits marqués « SERVEUR » seront remplacés par des appels réseau.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Grille3D from './components/BoardView3D.vue'
import PlacementBateaux from './components/ShipPlacement.vue'
import EcranAccueil from './components/EcranAccueil.vue'
import EcranOptions from './components/EcranOptions.vue'
import EcranMode from './components/EcranMode.vue'
import EcranCartes from './components/EcranCartes.vue'
import ArsenalDock from './components/ArsenalDock.vue'
import OutilEnMain from './components/OutilEnMain.vue'
import PoissonsVolants from './components/PoissonsVolants.vue'
import EcranChargement from './components/EcranChargement.vue'
import EcranFin from './components/EcranFin.vue'
import type { OutilVisuel, ProgresChargement } from './engine/boardScene.ts'
import { calculerStats, type StatsPartie } from './game/stats.ts'
import type { Carte } from './maps/types.ts'
import { bateauSurCase, casesBateau, tousCoules, grilleAvecTirs, placerFlotteAleatoirement, resoudreTir } from './game/rules.ts'
import { creerIA, DIFFICULTES, type Difficulte, type IA } from './game/ai.ts'
import { FLOTTE, type CoordCase, type Bateau } from './game/types.ts'
import { evaluerReparation, messagesRefusReparation, retirerTirs, tirBloque } from './game/reparation.ts'
import { sonAchat, sonAnnulation, sonBouclier, sonContacts, sonDrones, sonReparation, sonSelection, sonSonar } from './game/son.ts'
import { DUREE_DRONES, INSTANT_REPARATION } from './engine/dronesAnimation.ts'
import {
    acheter as acheterArsenal, apresTirAdverse, apresTourAdverse, casesZoneSonar, CATALOGUE_OUTILS, commencerTour, consommer,
    creerArsenal, definitionOutil, peutAcheter, peutUtiliser, poserBouee, resoudreSonar, REVENU_PAR_TOUR, STOCK_MAX,
    type Arsenal, type IdentifiantOutil,
} from './game/outils.ts'
import { planifierTour } from './game/iaOutils.ts'

type Etape = 'accueil' | 'options' | 'mode' | 'cartes' | 'placement' | 'en_cours' | 'terminee'

const etape = ref<Etape>('accueil')
const mesBateaux = ref<Bateau[]>([])
const bateauxAdverses = ref<Bateau[]>([]) // SERVEUR : le client ne connaîtra jamais ceci
const mesTirsChezAdversaire = ref<CoordCase[]>([])
const tirsAdversesChezMoi = ref<CoordCase[]>([])
const aMoiDeJouer = ref(true)
const message = ref('')
const gagnant = ref<'moi' | 'adversaire' | null>(null)
const difficulte = ref<Difficulte>('medium')
const carte = ref<Carte | null>(null)
const zoneEtape = ref<HTMLElement | null>(null)

// Les deux camps jouent avec les mêmes règles : chacun son arsenal (solde, stock, recharges, bouées, boucliers).
// Ce qu'on voit de l'adversaire : ses boucliers (dôme sur sa grille) et ses drones. Le reste est caché.
const joueur = reactive<Arsenal>(creerArsenal())
const adverse = reactive<Arsenal>(creerArsenal())
const outilSelectionne = ref<IdentifiantOutil | null>(null)
const derniereRecherche = ref('')
/** Cases où votre sonar a affiché un navire (vrai ou leurre) : elles restent marquées jusqu'au tir. */
const contactsSonar = ref<CoordCase[]>([])
const reparationEnCours = ref<{ id: number, caseGrille: CoordCase } | null>(null)
const impactBouclier = ref<{ id: number, caseGrille: CoordCase } | null>(null)
const reparationAdverse = ref<{ id: number, caseGrille: CoordCase } | null>(null)
const impactBouclierAdverse = ref<{ id: number, caseGrille: CoordCase } | null>(null)
/** Vrai pendant que l'adversaire « réfléchit » avant de jouer. */
const reflexionAdverse = ref(false)
/** Zone que l'adversaire est en train de scanner sur votre grille. */
const zoneScanAdverse = ref<CoordCase[] | null>(null)
let numeroTourAdverse = 0
let compteurAnimation = 0
const survolEnnemi = ref<CoordCase | null>(null)
const survolMaGrille = ref<CoordCase | null>(null)
// Poissons : `joueur.poissons` est le solde réel ; `poissonsEnVol` ceux qui nagent encore vers le compteur.
const poissonsEnVol = ref(0)
const poissonsAffiches = computed(() => Math.max(0, joueur.poissons - poissonsEnVol.value))
const volants = ref<InstanceType<typeof PoissonsVolants> | null>(null)
const elementBourse = ref<HTMLElement | null>(null)
const elementMaFlotte = ref<HTMLElement | null>(null)
const hauteurDock = ref(0)

// Chargement de la 3D quand on prend le large : les deux grilles préparent la mer, les navires et l'arsenal.
type CoteGrille = 'ma' | 'ennemie'
const progresScenes = reactive<Record<CoteGrille, { fait: number, total: number }>>({ ma: { fait: 0, total: 1 }, ennemie: { fait: 0, total: 1 } })
const scenesPretes = reactive<Record<CoteGrille, boolean>>({ ma: false, ennemie: false })
const etapeChargement = ref('Préparation de la mer')
const chargementVisible = ref(false)
let debutChargement = 0
const progressionChargement = computed(() => {
    const total = progresScenes.ma.total + progresScenes.ennemie.total
    return total > 0 ? (progresScenes.ma.fait + progresScenes.ennemie.fait) / total : 0
})

// Bilan de partie
const compteurs = reactive({ outilsUtilises: 0, boucliersBloques: 0, poissonsGagnes: 0, poissonsDepenses: 0, sonarsLances: 0 })
let debutPartie = Date.now()
const statsFin = ref<StatsPartie | null>(null)
const ecranFinVisible = ref(false)
let ia: IA | null = null
const urlPoisson = `${import.meta.env.BASE_URL}images/poisson.png`

const maGrille = computed(() => grilleAvecTirs(mesBateaux.value, tirsAdversesChezMoi.value, true))
const grilleAdverse = computed(() => grilleAvecTirs(bateauxAdverses.value, mesTirsChezAdversaire.value, false))
const outilsMaGrille = computed<OutilVisuel[]>(() => [
    ...joueur.bouees.map(({ caseGrille }, index) => ({
        identifiant: `bouee-${index}`,
        type: 'bouee' as const,
        caseGrille,
        actif: true,
    })),
    { identifiant: 'brouilleur', type: 'brouilleur', actif: joueur.brouilleurActif },
])
/** Contacts du sonar encore à tirer : une fois la case visée, le marqueur disparaît. */
const outilsGrilleAdverse = computed<OutilVisuel[]>(() => contactsSonar.value
    .filter((contact) => !mesTirsChezAdversaire.value.some((tir) => memeCase(tir, contact)))
    .map((caseGrille, index) => ({ identifiant: `contact-${index}`, type: 'contact' as const, caseGrille, actif: true })))
const bateauxAdversesCoules = computed(() =>
    bateauxAdverses.value.filter((bateau) =>
        casesBateau(bateau).every((caseGrille) =>
            mesTirsChezAdversaire.value.some((tir) => memeCase(tir, caseGrille)))))

let minuterieAdverse: ReturnType<typeof setTimeout> | undefined
let minuterieReparation: ReturnType<typeof setTimeout> | undefined
let minuterieBouclier: ReturnType<typeof setTimeout> | undefined
let minuterieSecurite: ReturnType<typeof setTimeout> | undefined
let minuterieChargement: ReturnType<typeof setTimeout> | undefined
/** Déroulement d'une réparation par drones, pour vous et pour l'adversaire : vol, réparation, départ. */
type EtapeReparation = 'aucune' | 'en-vol' | 'faite' | 'finie'
let etapeReparation: EtapeReparation = 'aucune'
let casesEnReparation: CoordCase[] = []
let etapeReparationAdverse: EtapeReparation = 'aucune'
let casesEnReparationAdverse: CoordCase[] = []
const arreterMinuteries = () => {
    for (const minuterie of [minuterieAdverse, minuterieReparation, minuterieBouclier, minuterieSecurite, minuterieChargement]) clearTimeout(minuterie)
    etapeReparation = 'aucune'
    etapeReparationAdverse = 'aucune'
    reflexionAdverse.value = false
}
const animationPiloteeAMain = () => !!(globalThis as { __gelerAnimation?: boolean }).__gelerAnimation

const outilEnMain = computed(() => CATALOGUE_OUTILS.find((outil) => outil.identifiant === outilSelectionne.value) ?? null)
const cibleSurMaGrille = computed(() => outilSelectionne.value === 'bouee' || outilSelectionne.value === 'drone')
const consigneAdversaire = computed(() => {
    if (etape.value !== 'en_cours') return 'Fin de la partie'
    if (!aMoiDeJouer.value) return reflexionAdverse.value ? 'L’adversaire réfléchit…' : 'L’adversaire joue…'
    if (outilSelectionne.value === 'sonar') return 'Choisissez la zone à scanner'
    return cibleSurMaGrille.value ? 'Utilisez votre outil sur votre grille' : 'Choisissez une case pour tirer'
})

/** Zone 3 × 3 du sonar sous le curseur : verte. */
const apercuSonar = computed(() => {
    const centre = survolEnnemi.value
    if (outilSelectionne.value !== 'sonar' || !centre || !aMoiDeJouer.value) return null
    return { cases: casesZoneSonar(centre), valide: true }
})
/** Sur votre grille : la zone que l'adversaire scanne (rouge), puis la case visée par la bouée ou les drones. */
const apercuMaGrille = computed(() => {
    if (zoneScanAdverse.value) return { cases: zoneScanAdverse.value, valide: false }
    const cible = survolMaGrille.value
    if (!cible || !aMoiDeJouer.value) return null
    if (outilSelectionne.value === 'drone') {
        const diagnostic = evaluerReparation(mesBateaux.value, tirsAdversesChezMoi.value, cible)
        return { cases: diagnostic.ok ? diagnostic.casesReparees : [cible], valide: diagnostic.ok }
    }
    if (outilSelectionne.value === 'bouee') return { cases: [cible], valide: boueePosable(cible) }
    return null
})

/** Une bouée se pose sur une case libre : ni sous un de vos navires, ni sur une autre bouée, ni sur une case déjà tirée. */
function boueePosable(caseGrille: CoordCase): boolean {
    return !bateauSurCase(mesBateaux.value, caseGrille) &&
        !joueur.bouees.some(({ caseGrille: position }) => memeCase(position, caseGrille)) &&
        !tirsAdversesChezMoi.value.some((tir) => memeCase(tir, caseGrille))
}

function surTouche(evenement: KeyboardEvent) {
    if (evenement.key === 'Escape' && outilSelectionne.value && etape.value === 'en_cours') reposerOutil()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onBeforeUnmount(() => {
    arreterMinuteries()
    window.removeEventListener('keydown', surTouche)
})

const libellesResultat = { rate: 'À l’eau.', touche: 'Touché !', coule: 'Touché, coulé !' } as const
const memeCase = (premiere: CoordCase, seconde: CoordCase) =>
    premiere.colonne === seconde.colonne && premiere.ligne === seconde.ligne

function afficherEtape() {
    void nextTick(() => zoneEtape.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function demarrerPartie(bateaux: Bateau[]) {
    mesBateaux.value = bateaux
    bateauxAdverses.value = placerFlotteAleatoirement(FLOTTE) // SERVEUR : placement de l'adversaire
    ia = creerIA(difficulte.value)
    mesTirsChezAdversaire.value = []
    tirsAdversesChezMoi.value = []
    aMoiDeJouer.value = true
    gagnant.value = null
    arreterMinuteries()
    Object.assign(compteurs, { outilsUtilises: 0, boucliersBloques: 0, poissonsGagnes: 0, poissonsDepenses: 0, sonarsLances: 0 })
    statsFin.value = null
    ecranFinVisible.value = false
    progresScenes.ma = { fait: 0, total: 1 }
    progresScenes.ennemie = { fait: 0, total: 1 }
    scenesPretes.ma = false
    scenesPretes.ennemie = false
    etapeChargement.value = 'Préparation de la mer'
    chargementVisible.value = true
    debutChargement = Date.now()
    Object.assign(joueur, creerArsenal())
    Object.assign(adverse, creerArsenal())
    numeroTourAdverse = 0
    poissonsEnVol.value = 0
    outilSelectionne.value = null
    derniereRecherche.value = ''
    contactsSonar.value = []
    reparationEnCours.value = null
    reparationAdverse.value = null
    zoneScanAdverse.value = null
    survolEnnemi.value = null
    survolMaGrille.value = null
    message.value = 'À vous de tirer.'
    etape.value = 'en_cours'
    afficherEtape()
    // Filet de sécurité : si une scène ne répondait jamais, l'écran de chargement finit quand même par se retirer.
    minuterieChargement = setTimeout(terminerChargement, 30000)
}

function surProgres(cote: CoteGrille, progres: ProgresChargement) {
    progresScenes[cote] = { fait: progres.fait, total: progres.total }
    etapeChargement.value = progres.etape
}

function surScenePrete(cote: CoteGrille) {
    scenesPretes[cote] = true
    if (scenesPretes.ma && scenesPretes.ennemie) terminerChargement()
}

/** Retire l'écran de chargement (après un temps minimum, pour qu'il ne clignote pas), puis la partie commence. */
function terminerChargement() {
    if (!chargementVisible.value) return
    clearTimeout(minuterieChargement)
    const reste = Math.max(0, 1300 - (Date.now() - debutChargement))
    minuterieChargement = setTimeout(() => {
        chargementVisible.value = false
        debutPartie = Date.now()
        // Le premier revenu arrive en mer, comme à chaque tour : les poissons nagent jusqu'au compteur.
        minuterieSecurite = setTimeout(debutTourJoueur, 700)
    }, reste)
}

/**
 * Début de votre tour : revenu fixe (le même pour les deux camps) et recharge des outils d'un tour.
 * Le solde monte tout de suite, le compteur suit à mesure que les poissons arrivent.
 */
function debutTourJoueur() {
    commencerTour(joueur)
    compteurs.poissonsGagnes += REVENU_PAR_TOUR
    poissonsEnVol.value += REVENU_PAR_TOUR
    volants.value?.lancer(5, REVENU_PAR_TOUR, elementBourse.value, elementMaFlotte.value)
    // Filet de sécurité : si une animation ne se terminait pas, le compteur finit quand même par rattraper le solde.
    clearTimeout(minuterieSecurite)
    minuterieSecurite = setTimeout(() => { poissonsEnVol.value = 0 }, 4500)
}

function surArriveePoisson(valeur: number) {
    poissonsEnVol.value = Math.max(0, poissonsEnVol.value - valeur)
}

function tirer(caseGrille: CoordCase) {
    if (etape.value !== 'en_cours' || !aMoiDeJouer.value) return
    if (outilSelectionne.value) {
        if (outilSelectionne.value !== 'sonar') {
            message.value = 'Cet outil doit être utilisé sur votre propre grille.'
            return
        }
        utiliserOutilSurCase(caseGrille)
        return
    }
    if (mesTirsChezAdversaire.value.some((tirPrecedent) => memeCase(tirPrecedent, caseGrille))) {
        message.value = 'Vous avez déjà tiré ici.'
        return
    }
    if (tirBloque(adverse.boucliers, caseGrille)) {
        // Les drones adverses ont protégé cette case : votre tir est arrêté et votre tour est perdu.
        impactBouclierAdverse.value = { id: ++compteurAnimation, caseGrille }
        message.value = `Bouclier ! Votre tir en ${coordonnees(caseGrille)} est bloqué : vous perdez votre tour.`
        sonBouclier()
        finirTourJoueur(true, 1400, true)
        return
    }
    // SERVEUR : POST /api/tirer { colonne, ligne } → { resultat: 'rate' | 'touche' | 'coule' }
    const resultat = resoudreTir(bateauxAdverses.value, mesTirsChezAdversaire.value, caseGrille)
    mesTirsChezAdversaire.value = [...mesTirsChezAdversaire.value, caseGrille]
    message.value = `${coordonnees(caseGrille)} : ${libellesResultat[resultat].toLowerCase()}`
    if (tousCoules(bateauxAdverses.value, mesTirsChezAdversaire.value)) return terminerPartie('moi')
    finirTourJoueur(true)
}

function acheter(identifiant: IdentifiantOutil) {
    if (etape.value !== 'en_cours') return
    const definition = definitionOutil(identifiant)
    if (joueur.inventaire[identifiant] >= STOCK_MAX) {
        message.value = `${definition.nom} : vous en avez déjà un en réserve.`
        return
    }
    if (!peutAcheter(joueur, identifiant)) {
        message.value = `Il vous faut ${definition.prix} poissons pour ${definition.nom.toLowerCase()}.`
        return
    }
    acheterArsenal(joueur, identifiant)
    compteurs.poissonsDepenses += definition.prix
    message.value = `${definition.nom} acheté. L’achat ne consomme pas votre tour.`
    sonAchat()
}

function reposerOutil() {
    if (!outilSelectionne.value) return
    outilSelectionne.value = null
    survolEnnemi.value = null
    survolMaGrille.value = null
    message.value = 'Outil reposé. Vous pouvez tirer.'
    sonAnnulation()
}

function utiliser(identifiant: IdentifiantOutil) {
    if (etape.value !== 'en_cours' || !aMoiDeJouer.value) return
    const definition = definitionOutil(identifiant)
    if (!peutUtiliser(joueur, identifiant)) {
        message.value = joueur.inventaire[identifiant] < 1
            ? 'Vous ne possédez pas cet outil.'
            : joueur.recharges[identifiant] > 0
                ? `${definition.nom} : prêt dans ${joueur.recharges[identifiant]} tour(s).`
                : 'Le brouilleur est déjà actif.'
        return
    }
    if (identifiant === 'brouilleur') {
        consommer(joueur, 'brouilleur')
        compteurs.outilsUtilises++
        joueur.brouilleurActif = true
        outilSelectionne.value = null
        message.value = 'Brouilleur activé : le prochain sonar adverse ne renverra rien. Gratuit : vous pouvez encore tirer.'
        sonSelection()
        return
    }
    if (outilSelectionne.value === identifiant) return reposerOutil()
    outilSelectionne.value = identifiant
    message.value = `${definition.nom} en main. ${definition.usage}`
    sonSelection()
}

function utiliserOutilSurCase(caseGrille: CoordCase) {
    const identifiant = outilSelectionne.value
    if (!identifiant || !peutUtiliser(joueur, identifiant)) return

    if (identifiant === 'sonar') {
        consommer(joueur, 'sonar')
        compteurs.outilsUtilises++
        compteurs.sonarsLances++
        const resultat = resoudreSonar(bateauxAdverses.value, caseGrille, adverse.bouees.map((bouee) => bouee.caseGrille), adverse.brouilleurActif)
        if (resultat.type === 'brouille') adverse.brouilleurActif = false // le brouilleur adverse est consommé
        // Les contacts s'ajoutent à ceux des sonars précédents (sans doublon).
        const nouveaux = resultat.contacts.filter((contact) => !contactsSonar.value.some((ancien) => memeCase(ancien, contact)))
        contactsSonar.value = [...contactsSonar.value, ...nouveaux]
        derniereRecherche.value = resultat.type === 'brouille'
            ? 'Sonar brouillé : l’adversaire a activé un brouilleur, rien n’est revenu.'
            : resultat.contacts.length > 0
                ? `Sonar : ${resultat.contacts.length} contact${resultat.contacts.length > 1 ? 's' : ''} en ${resultat.contacts.map(coordonnees).join(', ')}.`
                : 'Sonar : aucun navire dans la zone.'
        outilSelectionne.value = null
        survolEnnemi.value = null
        message.value = `${derniereRecherche.value} Cela a coûté votre tour.`
        sonSonar()
        if (resultat.contacts.length > 0) setTimeout(sonContacts, 650)
        finirTourJoueur(false, 1500)
        return
    }

    if (identifiant === 'bouee') {
        if (!boueePosable(caseGrille)) {
            message.value = 'Choisissez une case libre : pas sous un navire, ni sur une bouée ou une case déjà tirée.'
            return
        }
        consommer(joueur, 'bouee')
        compteurs.outilsUtilises++
        poserBouee(joueur, caseGrille)
        outilSelectionne.value = null
        survolMaGrille.value = null
        message.value = `Bouée leurre mouillée en ${coordonnees(caseGrille)} pour 4 tours adverses. Gratuit : vous pouvez encore tirer.`
        sonSelection()
        return
    }

    if (identifiant === 'drone') {
        const diagnostic = evaluerReparation(mesBateaux.value, tirsAdversesChezMoi.value, caseGrille)
        if (!diagnostic.ok) {
            message.value = messagesRefusReparation[diagnostic.raison]
            return
        }
        consommer(joueur, 'drone')
        lancerReparation(caseGrille, diagnostic.casesReparees)
    }
}

/**
 * Les quatre drones arrivent, réparent tout le navire (ses cases redeviennent saines à mi-parcours, avec un
 * bouclier pour le prochain tir adverse), puis repartent. L'adversaire ne joue qu'une fois les drones partis.
 */
function lancerReparation(caseGrille: CoordCase, cases: CoordCase[]) {
    outilSelectionne.value = null
    survolMaGrille.value = null
    aMoiDeJouer.value = false
    compteurs.outilsUtilises++
    reparationEnCours.value = { id: ++compteurAnimation, caseGrille }
    etapeReparation = 'en-vol'
    casesEnReparation = cases
    message.value = `Les drones foncent vers votre navire en ${coordonnees(caseGrille)}…`
    sonDrones()
    // C'est l'animation 3D qui déroule la séquence (réparation, puis départ des drones). Ces deux minuteries
    // ne servent que de filet de sécurité si la 3D ne répond pas (WebGPU absent, machine très lente).
    if (animationPiloteeAMain()) return // tests : animation pilotée à la main
    minuterieReparation = setTimeout(appliquerReparation, INSTANT_REPARATION * 1000 + 2500)
    minuterieAdverse = setTimeout(terminerSequenceDrones, DUREE_DRONES * 1000 + 4000)
}

/** Les cases sont réparées : elles redeviennent saines et reçoivent un bouclier pour le prochain tir adverse. */
function appliquerReparation() {
    if (etapeReparation !== 'en-vol') return
    etapeReparation = 'faite'
    tirsAdversesChezMoi.value = retirerTirs(tirsAdversesChezMoi.value, casesEnReparation)
    joueur.boucliers = [...casesEnReparation]
    // L'adversaire doit savoir que ces cases sont de nouveau saines : sinon il croirait les avoir déjà touchées.
    for (const caseReparee of casesEnReparation) ia?.signalerReparation(caseReparee)
    message.value = `${casesEnReparation.length} case${casesEnReparation.length > 1 ? 's' : ''} réparée${casesEnReparation.length > 1 ? 's' : ''} : bouclier actif pour le prochain tir adverse.`
    sonReparation()
}

/** Les drones sont repartis : l'adversaire peut jouer. */
function terminerSequenceDrones() {
    appliquerReparation()
    if (etapeReparation !== 'faite') return
    etapeReparation = 'finie'
    clearTimeout(minuterieReparation)
    clearTimeout(minuterieAdverse)
    finirTourJoueur(false, 350)
}

function coordonnees(caseGrille: CoordCase): string {
    return `${String.fromCharCode(65 + caseGrille.colonne)}${caseGrille.ligne + 1}`
}

/**
 * Fin de votre tour. `aTire` : vous avez tiré (les boucliers adverses tombent). Les bouées adverses vieillissent.
 * L'adversaire ne joue pas tout de suite : il laisse le temps de lire le résultat, puis « réfléchit ».
 */
function finirTourJoueur(aTire: boolean, attente = 900, garderBouclier = false) {
    aMoiDeJouer.value = false
    if (aTire) {
        // Un tir bloqué laisse un instant le dôme visible avant qu'il disparaisse.
        if (garderBouclier) minuterieBouclier = setTimeout(() => apresTirAdverse(adverse), 1100)
        else apresTirAdverse(adverse)
    }
    apresTourAdverse(adverse)
    minuterieAdverse = setTimeout(() => {
        reflexionAdverse.value = true
        message.value = 'L’adversaire réfléchit…'
        minuterieAdverse = setTimeout(jouerTourAdverse, delaiReflexion())
    }, attente)
}

/** Temps de réflexion de l'IA, en millisecondes : plus le niveau est haut, plus elle « réfléchit » longtemps. */
const DELAIS_REFLEXION: Record<Difficulte, [number, number]> = { easy: [1100, 1700], medium: [1500, 2300], hard: [1900, 2800] }
function delaiReflexion(): number {
    const [minimum, maximum] = DELAIS_REFLEXION[difficulte.value]
    return minimum + Math.random() * (maximum - minimum)
}

/** Tour de l'adversaire : revenu, achats, défenses gratuites, puis une action principale (sonar, drone ou tir). */
function jouerTourAdverse() {
    // SERVEUR : l'adversaire jouera depuis un autre navigateur ; on le récupérera par polling.
    reflexionAdverse.value = false
    if (!ia) return
    numeroTourAdverse++
    commencerTour(adverse)
    const plan = planifierTour({
        niveau: difficulte.value, arsenal: adverse, ia, mesBateaux: bateauxAdverses.value, tirsRecus: mesTirsChezAdversaire.value,
        sonarsAdverses: compteurs.sonarsLances, tour: numeroTourAdverse, hasard: Math.random,
    })
    if (plan.principale.type === 'sonar') return sonarAdverse(plan.principale.centre)
    if (plan.principale.type === 'drone') return droneAdverse(plan.principale.caseGrille)
    tirAdverse()
}

/** Fin du tour adverse : vos bouées vieillissent, vos boucliers tombent s'il a tiré, puis c'est à vous. */
function finirTourAdverse(aTire: boolean, garderBouclier = false) {
    if (aTire) {
        if (garderBouclier) minuterieBouclier = setTimeout(() => apresTirAdverse(joueur), 1100)
        else apresTirAdverse(joueur)
    }
    apresTourAdverse(joueur)
    aMoiDeJouer.value = true
    debutTourJoueur()
}

/** L'adversaire scanne une zone de votre grille : vous la voyez s'illuminer, puis vous apprenez ce qu'il a trouvé. */
function sonarAdverse(centre: CoordCase) {
    zoneScanAdverse.value = casesZoneSonar(centre)
    message.value = `L’adversaire lance un sonar sur votre grille, autour de ${coordonnees(centre)}…`
    sonSonar()
    minuterieAdverse = setTimeout(() => {
        zoneScanAdverse.value = null
        const resultat = resoudreSonar(mesBateaux.value, centre, joueur.bouees.map((bouee) => bouee.caseGrille), joueur.brouilleurActif)
        if (resultat.type === 'brouille') {
            joueur.brouilleurActif = false
            compteurs.boucliersBloques++
            message.value = 'Brouillé ! Votre brouilleur a bloqué le sonar adverse : il n’a rien appris.'
            sonBouclier()
        } else {
            ia?.enregistrerSonar(centre, resultat.contacts)
            const leurres = resultat.type === 'leurre' ? resultat.contacts.length : 0
            message.value = resultat.type === 'leurre'
                ? `Le sonar adverse a repéré ${leurres} contact${leurres > 1 ? 's' : ''}… des bouées leurres ! Vos navires de la zone restent masqués.`
                : resultat.contacts.length > 0
                    ? `Le sonar adverse a repéré ${resultat.contacts.length} case${resultat.contacts.length > 1 ? 's' : ''} de vos navires.`
                    : 'Le sonar adverse n’a rien trouvé.'
            if (resultat.contacts.length > 0) sonContacts()
        }
        finirTourAdverse(false)
    }, 2000)
}

/** L'adversaire envoie ses drones sur l'un de ses navires touchés : vous les voyez voler sur SA grille. */
function droneAdverse(caseGrille: CoordCase) {
    const diagnostic = evaluerReparation(bateauxAdverses.value, mesTirsChezAdversaire.value, caseGrille)
    if (!diagnostic.ok) return tirAdverse()
    etapeReparationAdverse = 'en-vol'
    casesEnReparationAdverse = diagnostic.casesReparees
    reparationAdverse.value = { id: ++compteurAnimation, caseGrille }
    message.value = 'L’adversaire envoie ses drones réparer l’un de ses navires…'
    sonDrones()
    if (animationPiloteeAMain()) return
    minuterieReparation = setTimeout(appliquerReparationAdverse, INSTANT_REPARATION * 1000 + 2500)
    minuterieAdverse = setTimeout(terminerSequenceDronesAdverse, DUREE_DRONES * 1000 + 4000)
}

function appliquerReparationAdverse() {
    if (etapeReparationAdverse !== 'en-vol') return
    etapeReparationAdverse = 'faite'
    mesTirsChezAdversaire.value = retirerTirs(mesTirsChezAdversaire.value, casesEnReparationAdverse)
    adverse.boucliers = [...casesEnReparationAdverse]
    // Les cases réparées sont protégées d'un tir : le dôme vous prévient de ne pas y tirer ce tour-ci.
    message.value = `L’adversaire a réparé ${casesEnReparationAdverse.length} case${casesEnReparationAdverse.length > 1 ? 's' : ''} de son navire, protégée${casesEnReparationAdverse.length > 1 ? 's' : ''} d’un tir. Évitez les dômes !`
    sonReparation()
}

function terminerSequenceDronesAdverse() {
    appliquerReparationAdverse()
    if (etapeReparationAdverse !== 'faite') return
    etapeReparationAdverse = 'finie'
    clearTimeout(minuterieReparation)
    clearTimeout(minuterieAdverse)
    finirTourAdverse(false)
}

function tirAdverse() {
    if (!ia) return
    const caseGrille = ia.choisirTir()
    if (tirBloque(joueur.boucliers, caseGrille)) {
        // Tir arrêté par le bouclier : il n'a aucun effet et l'adversaire perd son tour.
        ia.signalerBouclier(caseGrille)
        impactBouclier.value = { id: ++compteurAnimation, caseGrille }
        compteurs.boucliersBloques++
        message.value = `Bouclier ! Le tir adverse en ${coordonnees(caseGrille)} est bloqué : il perd son tour.`
        sonBouclier()
        // Le dôme reste un instant pour montrer l'impact, puis disparaît : l'immunité ne dure qu'un tour.
        finirTourAdverse(true, true)
        return
    }
    const resultat = resoudreTir(mesBateaux.value, tirsAdversesChezMoi.value, caseGrille)
    ia.enregistrerResultat(caseGrille, resultat, resultat === 'coule' ? bateauSurCase(mesBateaux.value, caseGrille) : undefined)
    tirsAdversesChezMoi.value = [...tirsAdversesChezMoi.value, caseGrille]
    message.value = `L’adversaire tire en ${coordonnees(caseGrille)} : ${libellesResultat[resultat].toLowerCase()}`
    if (tousCoules(mesBateaux.value, tirsAdversesChezMoi.value)) return terminerPartie('adversaire')
    finirTourAdverse(true)
}

function terminerPartie(vainqueur: 'moi' | 'adversaire') {
    gagnant.value = vainqueur
    etape.value = 'terminee'
    outilSelectionne.value = null
    statsFin.value = calculerStats(mesTirsChezAdversaire.value, bateauxAdverses.value, tirsAdversesChezMoi.value, mesBateaux.value, {
        ...compteurs,
        dureeMs: Date.now() - debutPartie,
    })
    // Le bilan s'affiche une fois la dernière animation de tir terminée.
    minuterieSecurite = setTimeout(() => { ecranFinVisible.value = true }, 1500)
    message.value = vainqueur === 'moi'
        ? 'Victoire : la flotte adverse est coulée.'
        : 'Défaite : votre flotte est coulée.'
    afficherEtape()
}

function recommencer() {
    arreterMinuteries()
    // Chaque partie commence par le choix d'une carte.
    etape.value = 'cartes'
    afficherEtape()
}

function allerA(ecran: Etape) {
    // Quitter une partie en cours demande confirmation : elle serait perdue.
    if (etape.value === 'en_cours' && !window.confirm('Quitter la partie en cours ?')) return
    arreterMinuteries()
    etape.value = ecran
    afficherEtape()
}

const NIVEAUX: Record<Difficulte, { libelle: string, description: string }> = {
    easy: { libelle: 'Facile', description: 'Tirs au hasard' },
    medium: { libelle: 'Moyen', description: 'Poursuit les bateaux touchés' },
    hard: { libelle: 'Difficile', description: 'Chasse méthodique' },
}
const libelleEtape = computed(() => ({
    accueil: '', options: 'Options', mode: 'Nouvelle partie', cartes: 'Choix de la carte', placement: 'Préparation',
    en_cours: 'Partie en cours', terminee: 'Partie terminée',
})[etape.value])
</script>

<template>
    <EcranAccueil v-if="etape === 'accueil'" @jouer="etape = 'mode'" @options="etape = 'options'" />

    <main v-else class="application">
        <header class="entete-application">
            <a class="marque" href="#" aria-label="Bataille navale, accueil" @click.prevent="allerA('accueil')">
                <span class="marque-icone" aria-hidden="true">✦</span>
                <span class="marque-texte">L’Archipel <small>CLUB NAUTIQUE</small></span>
            </a>
            <div class="entete-droite">
                <span class="badge-etape"><span class="point-etat"></span>{{ libelleEtape }}</span>
                <p v-if="etape === 'terminee'" class="etat-partie">{{ message }}</p>
            </div>
        </header>

        <div ref="zoneEtape" class="zone-etape" :class="{ 'avec-dock': etape === 'en_cours' }" :style="{ '--hauteur-dock': `${hauteurDock}px` }">
            <EcranOptions v-if="etape === 'options'" @retour="etape = 'accueil'" />
            <EcranMode v-else-if="etape === 'mode'" @ia="etape = 'cartes'" @retour="etape = 'accueil'" />
            <EcranCartes v-else-if="etape === 'cartes'" @choisir="carte = $event; etape = 'placement'" @retour="etape = 'mode'" />

            <template v-else-if="etape === 'placement'">
                <section class="niveau" aria-labelledby="titre-niveau">
                    <h2 id="titre-niveau">Niveau de l’adversaire</h2>
                    <div class="niveau-choix" role="radiogroup" aria-labelledby="titre-niveau">
                        <label v-for="option in DIFFICULTES" :key="option.valeur" class="choix-niveau">
                            <input v-model="difficulte" type="radio" name="difficulte" :value="option.valeur" />
                            <span><strong>{{ NIVEAUX[option.valeur].libelle }}</strong><small>{{ NIVEAUX[option.valeur].description }}</small></span>
                        </label>
                    </div>
                </section>
                <PlacementBateaux :carte="carte" @valider="demarrerPartie" />
                <button type="button" class="retour" @click="allerA('cartes')">← Changer de carte{{ carte ? ` (${carte.nom})` : '' }}</button>
            </template>

            <template v-else>
                <section v-if="etape === 'terminee'" class="bandeau-fin" :class="gagnant === 'moi' ? 'gagne' : 'perdu'">
                    <p>
                        <strong>{{ gagnant === 'moi' ? 'Victoire' : 'Défaite' }}</strong>
                        <span>{{ gagnant === 'moi' ? 'La flotte adverse repose au fond de l’eau.' : 'Votre flotte repose au fond de l’eau.' }}</span>
                    </p>
                    <button v-if="statsFin" type="button" @click="ecranFinVisible = true">Revoir le bilan</button>
                </section>

                <section v-else class="poste-commande" aria-label="Poste de commandement">
                    <div class="tour" :class="aMoiDeJouer ? 'tour-joueur' : 'tour-adverse'">
                        <span class="tour-point" aria-hidden="true"></span>
                        <strong>{{ aMoiDeJouer ? 'À vous de jouer' : reflexionAdverse ? 'L’adversaire réfléchit' : 'L’adversaire joue…' }}</strong>
                        <span v-if="reflexionAdverse" class="points-reflexion" aria-hidden="true"><i></i><i></i><i></i></span>
                    </div>
                    <p class="journal" role="status" aria-live="polite">
                        <span class="journal-etiquette">Journal de bord</span>
                        <span class="journal-texte">{{ message }}</span>
                    </p>
                    <div ref="elementBourse" class="bourse">
                        <img :src="urlPoisson" alt="" aria-hidden="true" />
                        <span class="bourse-chiffres">
                            <strong :key="poissonsAffiches" class="bourse-total">{{ poissonsAffiches }}<span class="sr-seulement"> poissons</span></strong>
                            <small>+{{ REVENU_PAR_TOUR }} par tour</small>
                        </span>
                    </div>
                </section>

                <p v-if="derniereRecherche && etape === 'en_cours'" class="resultat-sonar" role="status">
                    <span aria-hidden="true">◎</span> {{ derniereRecherche }}
                </p>

                <section class="grilles" :class="{ 'outil-actif': !!outilSelectionne }">
                    <figure ref="elementMaFlotte" class="carte-grille"
                        :class="{ 'cible-active': etape === 'en_cours' && aMoiDeJouer && cibleSurMaGrille }">
                        <figcaption><span class="etiquette-grille">VOTRE FLOTTE</span><strong>Le port d’attache</strong><small>{{ mesBateaux.length }} navires en mer</small></figcaption>
                        <Grille3D :cases="maGrille" :bateaux="mesBateaux" :outils="outilsMaGrille" :boucliers="joueur.boucliers"
                            :reparation="reparationEnCours" :impact-bouclier="impactBouclier" :apercu="apercuMaGrille"
                            :interactif="etape === 'en_cours' && aMoiDeJouer && cibleSurMaGrille"
                            @clic-case="utiliserOutilSurCase" @survol-case="survolMaGrille = $event"
                            @reparation-faite="appliquerReparation" @reparation-finie="terminerSequenceDrones"
                            @progres="surProgres('ma', $event)" @pret="surScenePrete('ma')" @echec="surScenePrete('ma')" :carte="carte" />
                    </figure>
                    <figure class="carte-grille"
                        :class="{ 'cible-active': etape === 'en_cours' && aMoiDeJouer && !cibleSurMaGrille }">
                        <figcaption><span class="etiquette-grille">ZONE ENNEMIE</span><strong>Le large inconnu</strong><small>{{ consigneAdversaire }}</small></figcaption>
                        <Grille3D :cases="grilleAdverse" :bateaux="bateauxAdversesCoules" :outils="outilsGrilleAdverse"
                            :boucliers="adverse.boucliers" :reparation="reparationAdverse" :impact-bouclier="impactBouclierAdverse"
                            :apercu="apercuSonar" :interactif="etape === 'en_cours' && aMoiDeJouer"
                            @clic-case="tirer" @survol-case="survolEnnemi = $event"
                            @reparation-faite="appliquerReparationAdverse" @reparation-finie="terminerSequenceDronesAdverse"
                            @progres="surProgres('ennemie', $event)" @pret="surScenePrete('ennemie')" @echec="surScenePrete('ennemie')" :carte="carte" />
                    </figure>
                </section>
                <div v-if="etape === 'terminee'" class="fin">
                    <button type="button" class="principal" @click="recommencer">⚓ Rejouer une partie</button>
                    <button type="button" @click="allerA('accueil')">Menu principal</button>
                </div>

                <ArsenalDock v-if="etape === 'en_cours'" :poissons="poissonsAffiches" :inventaire="joueur.inventaire"
                    :outil-en-main="outilSelectionne" :a-moi-de-jouer="aMoiDeJouer" :recharges="joueur.recharges"
                    :brouilleur-actif="joueur.brouilleurActif" :url-poisson="urlPoisson"
                    @acheter="acheter" @utiliser="utiliser" @reposer="reposerOutil" @hauteur="hauteurDock = $event" />
                <OutilEnMain :outil="etape === 'en_cours' ? outilEnMain : null" />
                <PoissonsVolants ref="volants" :url-poisson="urlPoisson" @arrivee="surArriveePoisson" />

                <Transition name="fondu">
                    <EcranChargement v-if="chargementVisible" :progression="progressionChargement" :etape="etapeChargement" />
                </Transition>
                <Transition name="fondu">
                    <EcranFin v-if="etape === 'terminee' && ecranFinVisible && statsFin" :victoire="gagnant === 'moi'" :stats="statsFin"
                        :url-poisson="urlPoisson" @rejouer="recommencer" @menu="allerA('accueil')" @voir="ecranFinVisible = false" />
                </Transition>
            </template>
        </div>
    </main>
</template>

<style scoped>
.application {
    position: relative;
    isolation: isolate;
    max-width: 1380px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 1.25rem clamp(1rem, 4vw, 3.5rem) 4rem;
}
.entete-application {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem 2rem;
    padding: 0.4rem 0 1.2rem;
    border-bottom: 1px solid var(--ligne);
}
.marque {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--craie);
    text-decoration: none;
}
.marque-icone {
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    place-items: center;
    border: 1px solid rgb(255 198 90 / 60%);
    border-radius: 50%;
    background: rgb(255 198 90 / 12%);
    color: var(--soleil);
    font-size: 1.25rem;
}
.marque-texte {
    font-family: var(--police-titres);
    font-size: 1.2rem;
    font-weight: 700;
}
.marque-texte small {
    display: block;
    color: var(--attenue);
    font-family: var(--police-corps);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.2em;
}
.entete-droite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem 1rem;
}
.badge-etape {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--ligne);
    border-radius: 999px;
    background: rgb(7 38 63 / 40%);
    font-size: 0.78rem;
    font-weight: 650;
}
.point-etat {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--menthe);
    box-shadow: 0 0 10px rgb(111 224 197 / 75%);
}
.etat-partie {
    margin: 0;
    font-size: 0.88rem;
}
.zone-etape {
    scroll-margin-top: 1.25rem;
}
.surtitre {
    margin: 0 0 0.45rem;
    color: var(--soleil);
    font-size: 0.7rem;
    font-weight: 750;
    letter-spacing: 0.22em;
}
.niveau {
    display: grid;
    gap: 0.7rem;
    margin: 1.6rem 0 1.4rem;
}
.niveau h2 {
    margin: 0;
    font-family: var(--police-titres);
    font-size: 1.35rem;
}
.niveau-choix {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7rem;
}
@media (max-width: 560px) {
    .niveau-choix { grid-template-columns: 1fr; }
}
.choix-niveau {
    position: relative;
    cursor: pointer;
}
.choix-niveau input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
}
.choix-niveau span {
    display: grid;
    gap: 0.1rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--ligne);
    border-radius: 14px;
    background: var(--panneau);
    text-align: center;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.choix-niveau strong {
    font-family: var(--police-titres);
    font-size: 1.15rem;
}
.choix-niveau small {
    color: var(--attenue);
    font-size: 0.78rem;
}
.choix-niveau:hover span {
    transform: translateY(-2px);
}
.choix-niveau input:checked + span {
    border-color: rgb(255 198 90 / 80%);
    background: linear-gradient(145deg, rgb(255 198 90 / 24%), rgb(255 198 90 / 8%));
    box-shadow: 0 0 0 1px rgb(255 198 90 / 25%);
}
.choix-niveau input:focus-visible + span {
    outline: 3px solid var(--soleil);
    outline-offset: 2px;
}
.retour {
    display: block;
    margin: 1.6rem 0 0;
}
.sr-seulement {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
.zone-etape.avec-dock {
    padding-bottom: calc(var(--hauteur-dock, 0px) + 1.5rem);
}
.bandeau-fin {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 1rem;
    margin: 1.1rem 0 1rem;
    padding: 0.6rem 0.8rem 0.6rem 1.2rem;
    border: 3px solid var(--cuivre);
    border-radius: 20px;
    background: var(--grain), linear-gradient(180deg, #f8edd1, #ecd9ae);
    box-shadow: 0 14px 34px rgb(3 24 42 / 40%), inset 0 2px 0 rgb(255 255 255 / 55%);
    color: var(--encre);
}
.bandeau-fin.perdu { border-color: #6b7b8c; background: var(--grain), linear-gradient(180deg, #e8e4d8, #cfc9b8); }
.bandeau-fin p {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.8rem;
    margin: 0;
}
.bandeau-fin strong { font-family: var(--police-titres); font-size: 1.4rem; }
.bandeau-fin span { font-family: var(--police-titres); font-style: italic; }
.bandeau-fin button {
    min-height: 2.75rem;
    border: 1.5px solid var(--cuivre-fonce);
    background: rgb(255 250 235 / 60%);
    color: var(--encre);
    font-weight: 700;
}
.fondu-leave-active { transition: opacity 600ms ease; }
.fondu-leave-to { opacity: 0; }

/* Poste de commandement : plaque de cuivre portant le tour, le journal de bord et la bourse. */
.poste-commande {
    position: sticky;
    top: 0.6rem;
    z-index: 20;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem 1rem;
    margin: 1.1rem 0 1rem;
    padding: 0.55rem 0.7rem;
    border: 3px solid var(--cuivre);
    border-radius: 20px;
    background: var(--grain), linear-gradient(180deg, #f8edd1, #ecd9ae);
    box-shadow: 0 14px 34px rgb(3 24 42 / 40%), inset 0 2px 0 rgb(255 255 255 / 55%);
    color: var(--encre);
}
.tour {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.9rem;
    padding: 0 1rem;
    border: 2px solid transparent;
    border-radius: 999px;
    font-size: 0.92rem;
    white-space: nowrap;
    transition: background 300ms ease, border-color 300ms ease, color 300ms ease;
}
.tour-point {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: currentcolor;
}
.tour-joueur {
    border-color: #1f7a6c;
    background: linear-gradient(180deg, #3fae9a, #23806f);
    color: #fff8e6;
}
.tour-adverse {
    border-color: var(--cuivre);
    background: rgb(184 115 51 / 16%);
    color: var(--cuivre-fonce);
}
.tour-adverse .tour-point {
    animation: pulsation 1s ease-in-out infinite;
}
/* Trois points qui s'animent quand l'adversaire réfléchit. */
.points-reflexion {
    display: inline-flex;
    gap: 0.2rem;
}
.points-reflexion i {
    width: 0.32rem;
    height: 0.32rem;
    border-radius: 50%;
    background: currentcolor;
    animation: point-saute 1.1s ease-in-out infinite;
}
.points-reflexion i:nth-child(2) { animation-delay: 0.15s; }
.points-reflexion i:nth-child(3) { animation-delay: 0.3s; }
@keyframes point-saute {
    0%, 70%, 100% { opacity: 0.35; transform: translateY(0); }
    35% { opacity: 1; transform: translateY(-0.28rem); }
}
@keyframes pulsation {
    50% { opacity: 0.2; transform: scale(0.65); }
}
.journal {
    display: grid;
    min-width: 0;
    gap: 0.05rem;
    margin: 0;
}
.journal-etiquette {
    color: var(--cuivre-fonce);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}
.journal-texte {
    min-height: 1.5em;
    font-family: var(--police-titres);
    font-size: 1.02rem;
    font-style: italic;
    line-height: 1.35;
}
.bourse {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.9rem;
    padding: 0 1rem 0 0.7rem;
    border: 2px solid var(--cuivre);
    border-radius: 999px;
    background: rgb(255 250 235 / 75%);
    box-shadow: inset 0 2px 6px rgb(120 80 30 / 18%);
}
.bourse img {
    width: 2.6rem;
    height: 1.7rem;
    object-fit: contain;
}
.bourse-chiffres {
    display: grid;
    line-height: 1.05;
}
.bourse-total {
    display: block;
    font-family: var(--police-titres);
    font-size: 1.6rem;
    font-variant-numeric: tabular-nums;
    transform-origin: left center;
    animation: tic 460ms cubic-bezier(0.2, 1.6, 0.3, 1);
}
@keyframes tic {
    0% { color: var(--cire); transform: scale(1.45); }
    100% { color: var(--encre); transform: scale(1); }
}
.bourse small {
    color: var(--encre-douce);
    font-size: 0.7rem;
}

.resultat-sonar {
    margin: 0 0 1rem;
    padding: 0.55rem 1rem;
    border: 2px solid #1f7a6c;
    border-radius: 14px;
    background: var(--grain), #e4f1e2;
    color: var(--encre);
    font-family: var(--police-titres);
    font-style: italic;
    animation: entre 420ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
}
@keyframes entre {
    from { opacity: 0; transform: translateY(-8px); }
}

.grilles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1rem, 2.5vw, 2rem);
}
.carte-grille {
    position: relative;
    min-width: 0;
    margin: 0;
    padding: 0.7rem 0.7rem 0.8rem;
    border: 3px solid var(--cuivre);
    border-radius: 22px;
    background: var(--grain), linear-gradient(180deg, #f6ebcf, #e9d6aa);
    box-shadow: 0 18px 44px rgb(3 24 42 / 34%), inset 0 2px 0 rgb(255 255 255 / 55%);
    color: var(--encre);
    transition: opacity 280ms ease, filter 280ms ease, transform 280ms ease, box-shadow 280ms ease;
}
/* Rivets aux angles de la plaque. */
.carte-grille::before,
.carte-grille::after {
    position: absolute;
    top: 9px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff0c4, #b88a3c 60%, #6d4a17);
    box-shadow: 0 1px 2px rgb(60 38 12 / 50%);
    content: '';
}
.carte-grille::before { left: 11px; }
.carte-grille::after { right: 11px; }
/* La grille où l'outil en main va servir ressort ; l'autre s'estompe. */
.grilles.outil-actif .carte-grille:not(.cible-active) {
    opacity: 0.55;
    filter: saturate(0.6);
}
.cible-active {
    box-shadow: 0 0 0 4px rgb(255 198 90 / 55%), 0 22px 54px rgb(3 24 42 / 42%), inset 0 2px 0 rgb(255 255 255 / 55%);
}
.grilles.outil-actif .cible-active {
    transform: translateY(-4px);
    animation: cible-halo 1.5s ease-in-out infinite;
}
@keyframes cible-halo {
    50% { box-shadow: 0 0 0 9px rgb(255 198 90 / 22%), 0 22px 54px rgb(3 24 42 / 42%), inset 0 2px 0 rgb(255 255 255 / 55%); }
}
figcaption {
    display: grid;
    gap: 0.1rem;
    margin: 0 0.5rem 0.6rem;
    padding: 0.2rem 1rem 0;
}
figcaption strong {
    font-family: var(--police-titres);
    font-size: 1.3rem;
    font-weight: 700;
}
figcaption small {
    color: var(--encre-douce);
    font-size: 0.82rem;
    font-style: italic;
}
.etiquette-grille {
    color: var(--cuivre-fonce);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.18em;
}
.carte-grille :deep(.grille3d),
.carte-grille :deep(canvas) {
    border-radius: 14px;
}
.fin {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.8rem;
    margin-top: 1.5rem;
}
@media (max-width: 760px) {
    .grilles { grid-template-columns: 1fr; }
    /* Mobile : la zone ennemie, où l'on tire, passe avant sa propre flotte. */
    .grilles .carte-grille:nth-child(2) { order: -1; }
    .poste-commande {
        grid-template-columns: 1fr auto;
    }
    .journal {
        grid-column: 1 / -1;
        order: 3;
    }
}
</style>
