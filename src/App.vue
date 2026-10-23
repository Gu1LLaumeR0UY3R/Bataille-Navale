<script setup lang="ts">
// Démo LOCALE : l'adversaire est simulé dans le navigateur.
// Quand le serveur PHP existera, les trois endroits marqués « SERVEUR » seront remplacés par des appels réseau.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import Grille3D from './components/BoardView3D.vue'
import PlacementBateaux from './components/ShipPlacement.vue'
import EcranAccueil from './components/EcranAccueil.vue'
import EcranOptions from './components/EcranOptions.vue'
import EcranMode from './components/EcranMode.vue'
import EcranCartes from './components/EcranCartes.vue'
import type { Carte } from './maps/types.ts'
import { bateauSurCase, casesBateau, tousCoules, grilleAvecTirs, placerFlotteAleatoirement, resoudreTir } from './game/rules.ts'
import { creerIA, DIFFICULTES, type Difficulte, type IA } from './game/ai.ts'
import { FLOTTE, type CoordCase, type Bateau } from './game/types.ts'
import { acheterOutil, ajouterRevenu, CATALOGUE_OUTILS, creerInventaire, resoudreSonar, REVENU_PAR_TOUR, type IdentifiantOutil, type InventaireOutils } from './game/outils.ts'
import type { OutilVisuel } from './engine/boardScene.ts'

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
const poissons = ref(0)
const inventaire = ref<InventaireOutils>(creerInventaire())
const outilSelectionne = ref<IdentifiantOutil | null>(null)
const boueesLeurres = ref<{ caseGrille: CoordCase, toursRestants: number }[]>([])
const brouilleurActif = ref(false)
const rechargeDrones = ref(0)
const derniereRecherche = ref('')
const boueesRevelees = ref<CoordCase[]>([])
const positionDrone = ref<CoordCase | null>(null)
let ia: IA | null = null
const urlPoisson = `${import.meta.env.BASE_URL}images/poisson.png`

const maGrille = computed(() => grilleAvecTirs(mesBateaux.value, tirsAdversesChezMoi.value, true))
const grilleAdverse = computed(() => grilleAvecTirs(bateauxAdverses.value, mesTirsChezAdversaire.value, false))
const outilsMaGrille = computed<OutilVisuel[]>(() => [
    ...boueesLeurres.value.map(({ caseGrille }, index) => ({
        identifiant: `bouee-${index}`,
        type: 'bouee' as const,
        caseGrille,
        actif: true,
    })),
    { identifiant: 'brouilleur', type: 'brouilleur', actif: brouilleurActif.value },
    ...(positionDrone.value
        ? [{ identifiant: 'drone', type: 'drone' as const, caseGrille: positionDrone.value, actif: true }]
        : []),
])
const outilsGrilleAdverse = computed<OutilVisuel[]>(() => boueesRevelees.value.map((caseGrille, index) => ({
    identifiant: `bouee-revelee-${index}`,
    type: 'bouee',
    caseGrille,
    actif: true,
})))
const bateauxAdversesCoules = computed(() =>
    bateauxAdverses.value.filter((bateau) =>
        casesBateau(bateau).every((caseGrille) =>
            mesTirsChezAdversaire.value.some((tir) => memeCase(tir, caseGrille)))))

let minuterieAdverse: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(minuterieAdverse))

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
    poissons.value = ajouterRevenu(0)
    inventaire.value = creerInventaire()
    outilSelectionne.value = null
    boueesLeurres.value = []
    brouilleurActif.value = false
    rechargeDrones.value = 0
    derniereRecherche.value = ''
    boueesRevelees.value = []
    positionDrone.value = null
    message.value = 'À vous de tirer.'
    etape.value = 'en_cours'
    afficherEtape()
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
    // SERVEUR : POST /api/tirer { colonne, ligne } → { resultat: 'rate' | 'touche' | 'coule' }
    const resultat = resoudreTir(bateauxAdverses.value, mesTirsChezAdversaire.value, caseGrille)
    mesTirsChezAdversaire.value = [...mesTirsChezAdversaire.value, caseGrille]
    message.value = libellesResultat[resultat]
    if (tousCoules(bateauxAdverses.value, mesTirsChezAdversaire.value)) return terminerPartie('moi')
    aMoiDeJouer.value = false
    minuterieAdverse = setTimeout(tirAdverse, 700)
}

function acheter(identifiant: IdentifiantOutil) {
    if (etape.value !== 'en_cours') return
    if (identifiant === 'drone' && inventaire.value.drone > 0) {
        message.value = 'Votre escadrille de réparation est déjà disponible.'
        return
    }
    const resultat = acheterOutil(poissons.value, inventaire.value, identifiant)
    if (!resultat) {
        const outil = CATALOGUE_OUTILS.find((item) => item.identifiant === identifiant)
        message.value = `Il vous faut ${outil?.prix ?? 0} poissons pour cet outil.`
        return
    }
    poissons.value = resultat.solde
    inventaire.value = resultat.inventaire
    message.value = `${CATALOGUE_OUTILS.find((item) => item.identifiant === identifiant)?.nom} acheté. L’achat ne consomme pas votre tour.`
}

function utiliser(identifiant: IdentifiantOutil) {
    if (etape.value !== 'en_cours' || !aMoiDeJouer.value) return
    if (inventaire.value[identifiant] < 1) {
        message.value = 'Vous ne possédez pas cet outil.'
        return
    }
    if (identifiant === 'drone' && rechargeDrones.value > 0) {
        message.value = `Les drones seront de nouveau prêts dans ${rechargeDrones.value} tour(s).`
        return
    }
    if (identifiant === 'brouilleur') {
        if (brouilleurActif.value) {
            message.value = 'Le brouilleur est déjà actif.'
            return
        }
        inventaire.value = { ...inventaire.value, brouilleur: inventaire.value.brouilleur - 1 }
        brouilleurActif.value = true
        outilSelectionne.value = null
        message.value = 'Brouilleur activé : il bloque le prochain sonar adverse. Cette action consomme votre tour.'
        finirTourJoueur()
        return
    }
    outilSelectionne.value = identifiant
    message.value = identifiant === 'sonar'
        ? 'Cliquez une case de la grille ennemie pour scanner cette zone 3 × 3.'
        : identifiant === 'bouee'
            ? 'Cliquez une case de votre grille pour y poser la bouée leurre.'
            : 'Cliquez une de vos cases touchées pour la réparer.'
}

function utiliserOutilSurCase(caseGrille: CoordCase) {
    const identifiant = outilSelectionne.value
    if (!identifiant) return

    if (identifiant === 'sonar') {
        const resultat = resoudreSonar(
            bateauxAdverses.value,
            caseGrille,
            [],
            false,
        )
        inventaire.value = { ...inventaire.value, sonar: inventaire.value.sonar - 1 }
        boueesRevelees.value = resultat.boueesRevelees
        derniereRecherche.value = resultat.type === 'presence'
            ? 'Sonar : présence détectée dans la zone.'
            : resultat.type === 'leurre'
                ? `Sonar : leurre détecté en ${resultat.boueesRevelees.map(coordonnees).join(', ')}. Les navires de la zone restent masqués.`
                : resultat.type === 'brouille'
                    ? 'Sonar brouillé : aucune information sur la zone.'
                    : 'Sonar : aucun navire détecté dans la zone.'
        outilSelectionne.value = null
        message.value = `${derniereRecherche.value} Cette action consomme votre tour.`
        finirTourJoueur()
        return
    }

    if (identifiant === 'bouee') {
        if (boueesLeurres.value.some(({ caseGrille: position }) => memeCase(position, caseGrille))) {
            message.value = 'Une bouée leurre occupe déjà cette case.'
            return
        }
        inventaire.value = { ...inventaire.value, bouee: inventaire.value.bouee - 1 }
        boueesLeurres.value = [...boueesLeurres.value, { caseGrille, toursRestants: 2 }]
        outilSelectionne.value = null
        message.value = 'Bouée leurre mouillée pour 2 tours adverses. Cette action consomme votre tour.'
        finirTourJoueur()
        return
    }

    if (identifiant === 'drone') {
        const touche = tirsAdversesChezMoi.value.some((tir) => memeCase(tir, caseGrille))
        if (!touche) {
            message.value = 'Le drone ne peut réparer qu’une case touchée.'
            return
        }
        tirsAdversesChezMoi.value = tirsAdversesChezMoi.value.filter((tir) => !memeCase(tir, caseGrille))
        rechargeDrones.value = 2
        positionDrone.value = caseGrille
        outilSelectionne.value = null
        message.value = `Case réparée en ${coordonnees(caseGrille)}. Les drones rechargent pendant 2 tours. Cette action consomme votre tour.`
        finirTourJoueur()
    }
}

function coordonnees(caseGrille: CoordCase): string {
    return `${String.fromCharCode(65 + caseGrille.colonne)}${caseGrille.ligne + 1}`
}

function finirTourJoueur() {
    aMoiDeJouer.value = false
    minuterieAdverse = setTimeout(tirAdverse, 700)
}

function tirAdverse() {
    // SERVEUR : l'adversaire jouera depuis un autre navigateur ; on le récupérera par polling.
    if (!ia) return
    const caseGrille = ia.choisirTir()
    const resultat = resoudreTir(mesBateaux.value, tirsAdversesChezMoi.value, caseGrille)
    ia.enregistrerResultat(caseGrille, resultat, resultat === 'coule' ? bateauSurCase(mesBateaux.value, caseGrille) : undefined)
    tirsAdversesChezMoi.value = [...tirsAdversesChezMoi.value, caseGrille]
    boueesLeurres.value = boueesLeurres.value
        .map((bouee) => ({ ...bouee, toursRestants: bouee.toursRestants - 1 }))
        .filter((bouee) => bouee.toursRestants > 0)
    positionDrone.value = null
    message.value = `L’adversaire tire : ${libellesResultat[resultat].toLowerCase()}`
    if (tousCoules(mesBateaux.value, tirsAdversesChezMoi.value)) return terminerPartie('adversaire')
    if (rechargeDrones.value > 0) rechargeDrones.value--
    poissons.value = ajouterRevenu(poissons.value)
    aMoiDeJouer.value = true
}

function terminerPartie(vainqueur: 'moi' | 'adversaire') {
    gagnant.value = vainqueur
    etape.value = 'terminee'
    outilSelectionne.value = null
    message.value = vainqueur === 'moi'
        ? 'Victoire : la flotte adverse est coulée.'
        : 'Défaite : votre flotte est coulée.'
    afficherEtape()
}

function recommencer() {
    clearTimeout(minuterieAdverse)
    // Chaque partie commence par le choix d'une carte.
    etape.value = 'cartes'
    afficherEtape()
}

function allerA(ecran: Etape) {
    // Quitter une partie en cours demande confirmation : elle serait perdue.
    if (etape.value === 'en_cours' && !window.confirm('Quitter la partie en cours ?')) return
    clearTimeout(minuterieAdverse)
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
                <p v-if="etape === 'en_cours' || etape === 'terminee'" class="etat-partie" role="status">{{ message }}</p>
            </div>
        </header>

        <div ref="zoneEtape" class="zone-etape">
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
                <section class="intro-partie">
                    <p class="surtitre">EN MER — {{ gagnant ? 'MISSION ACCOMPLIE' : 'À VOUS DE JOUER' }}</p>
                    <h1>{{ gagnant ? (gagnant === 'moi' ? 'Quelle victoire !' : 'La mer aura le dernier mot.') : 'La bataille fait rage' }}</h1>
                    <p>{{ message }}</p>
                </section>
                <section v-if="etape === 'en_cours'" class="arsenal" aria-label="Arsenal et monnaie">
                    <div class="solde-poissons">
                        <img :src="urlPoisson" alt="" aria-hidden="true" />
                        <strong>{{ poissons }}</strong>
                        <small>poissons · +{{ REVENU_PAR_TOUR }} à chaque tour</small>
                    </div>
                    <div class="outils">
                        <article v-for="outil in CATALOGUE_OUTILS" :key="outil.identifiant" class="carte-outil"
                            :class="{ selectionne: outilSelectionne === outil.identifiant }">
                            <div class="outil-texte">
                                <strong>{{ outil.nom }}</strong>
                                <small>{{ outil.description }}</small>
                                <span>En stock : {{ inventaire[outil.identifiant] }}</span>
                                <span v-if="outil.identifiant === 'drone' && rechargeDrones > 0" class="outil-attente">
                                    Recharge : {{ rechargeDrones }} tour(s)
                                </span>
                                <span v-if="outil.identifiant === 'brouilleur' && brouilleurActif" class="outil-attente">
                                    Actif · en attente d’un sonar adverse
                                </span>
                            </div>
                            <div class="outil-actions">
                                <button type="button"
                                    :disabled="outil.identifiant === 'drone' && inventaire.drone > 0"
                                    :aria-label="`Acheter ${outil.nom} pour ${outil.prix} poissons`"
                                    @click="acheter(outil.identifiant)">
                                    Acheter · {{ outil.prix }} poissons
                                </button>
                                <button type="button" class="utiliser-outil"
                                    :disabled="!aMoiDeJouer || inventaire[outil.identifiant] < 1 ||
                                        (outil.identifiant === 'drone' && rechargeDrones > 0) ||
                                        (outil.identifiant === 'brouilleur' && brouilleurActif)"
                                    @click="utiliser(outil.identifiant)">
                                    {{ outilSelectionne === outil.identifiant ? 'Sélectionné' : 'Utiliser' }}
                                </button>
                            </div>
                        </article>
                    </div>
                    <p v-if="outilSelectionne" class="aide-outil">
                        {{ outilSelectionne === 'sonar' ? 'Choisissez la zone à scanner sur la grille ennemie.' : 'Choisissez une case sur votre grille.' }}
                        <button type="button" @click="outilSelectionne = null">Annuler</button>
                    </p>
                    <p v-if="derniereRecherche" class="resultat-sonar" role="status">{{ derniereRecherche }}</p>
                </section>
                <section class="grilles">
                    <figure class="carte-grille">
                        <figcaption><span class="etiquette-grille">VOTRE FLOTTE</span><strong>Le port d’attache</strong><small>{{ mesBateaux.length }} navires en mer</small></figcaption>
                        <Grille3D :cases="maGrille" :bateaux="mesBateaux" :outils="outilsMaGrille"
                            :interactif="etape === 'en_cours' && aMoiDeJouer && (outilSelectionne === 'bouee' || outilSelectionne === 'drone')"
                            @clic-case="utiliserOutilSurCase" :carte="carte" />
                    </figure>
                    <figure class="carte-grille" :class="{ 'cible-active': etape === 'en_cours' && aMoiDeJouer }">
                        <figcaption><span class="etiquette-grille">ZONE ENNEMIE</span><strong>Le large inconnu</strong><small>{{ etape === 'en_cours' ? (aMoiDeJouer ? 'Choisissez une case pour tirer' : 'L’adversaire joue…') : 'Fin de la partie' }}</small></figcaption>
                        <Grille3D :cases="grilleAdverse" :bateaux="bateauxAdversesCoules" :outils="outilsGrilleAdverse"
                            :interactif="etape === 'en_cours' && aMoiDeJouer"
                            @clic-case="tirer" :carte="carte" />
                    </figure>
                </section>
                <div v-if="etape === 'terminee'" class="fin">
                    <button type="button" class="principal" @click="recommencer">⚓ Rejouer une partie</button>
                    <button type="button" @click="allerA('accueil')">Menu principal</button>
                </div>
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
.intro-partie {
    padding: 2rem 0 1.6rem;
}
.intro-partie h1 {
    margin: 0;
    font-family: var(--police-titres);
    font-size: clamp(2rem, 4.5vw, 3.6rem);
    letter-spacing: -0.03em;
    line-height: 1.05;
}
.intro-partie p:last-child {
    margin: 0.7rem 0 0;
    color: #e0f0f4;
}
.grilles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1rem, 2.5vw, 2rem);
}
.arsenal {
    display: grid;
    gap: 0.9rem;
    margin: 0 0 1.5rem;
    padding: 1rem;
    border: 1px solid var(--ligne);
    border-radius: 18px;
    background: rgb(7 38 63 / 72%);
}
.solde-poissons {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    color: var(--soleil);
}
.solde-poissons img {
    width: 2.4rem;
    height: 1.7rem;
    object-fit: contain;
}
.solde-poissons strong { font-family: var(--police-titres); font-size: 1.5rem; }
.solde-poissons small { color: var(--attenue); }
.outils {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.7rem;
}
@media (max-width: 900px) {
    .outils { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
    .outils { grid-template-columns: 1fr; }
}
.carte-outil {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.8rem;
    border: 1px solid var(--ligne);
    border-radius: 13px;
    background: rgb(11 47 74 / 75%);
}
.carte-outil.selectionne {
    border-color: var(--soleil);
    box-shadow: 0 0 0 1px rgb(255 198 90 / 25%);
}
.outil-texte { display: grid; gap: 0.25rem; }
.outil-texte strong { font-family: var(--police-titres); }
.outil-texte small, .outil-texte span { color: var(--attenue); font-size: 0.75rem; }
.outil-texte .outil-attente { color: var(--soleil); }
.outil-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.outil-actions button, .aide-outil button {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--ligne);
    border-radius: 9px;
    color: var(--craie);
    background: rgb(7 38 63 / 80%);
    cursor: pointer;
}
.outil-actions button:disabled { cursor: not-allowed; opacity: 0.45; }
.outil-actions .utiliser-outil {
    border-color: rgb(255 198 90 / 55%);
    color: var(--soleil);
}
.aide-outil, .resultat-sonar { margin: 0; color: var(--soleil); font-size: 0.86rem; }
.aide-outil { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
@media (max-width: 760px) {
    .grilles { grid-template-columns: 1fr; }
}
.carte-grille {
    min-width: 0;
    margin: 0;
    padding: clamp(0.8rem, 2vw, 1.25rem);
    border: 1px solid var(--ligne);
    border-radius: 20px;
    background: var(--panneau);
    box-shadow: 0 18px 50px rgb(3 24 42 / 28%);
    transition: border-color 200ms ease, box-shadow 200ms ease;
}
.cible-active {
    border-color: rgb(255 198 90 / 70%);
    box-shadow: 0 0 0 1px rgb(255 198 90 / 18%), 0 18px 52px rgb(3 24 42 / 38%);
}
figcaption {
    display: grid;
    gap: 0.12rem;
    margin-bottom: 0.8rem;
}
figcaption strong {
    font-family: var(--police-titres);
    font-size: 1.25rem;
    font-weight: 600;
}
figcaption small {
    color: var(--attenue);
    font-size: 0.8rem;
}
.etiquette-grille {
    color: var(--soleil);
    font-size: 0.62rem;
    font-weight: 750;
    letter-spacing: 0.18em;
}
.fin {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.8rem;
    margin-top: 1.5rem;
}
</style>
