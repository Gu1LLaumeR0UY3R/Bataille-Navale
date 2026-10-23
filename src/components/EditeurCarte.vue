<script setup lang="ts">
// Éditeur de cartes : ouvrir l'application avec /?editeur=carte
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { ECHELLE_MIN, lireCarte, nomSur, type ObjetCarte, type ReglagesCarte, type TypeObjet } from '../game/carte.ts'
import { creerSceneEditeur, type Outil, type SceneEditeur } from '../engine/editeurCarte.ts'
import { ecrireZip, lireZip, type EntreeZip } from '../engine/zip.ts'

const toile = ref<HTMLCanvasElement>()
const scene = shallowRef<SceneEditeur>()
const chargement = ref(true)
const erreur = ref('')
const message = ref('')
const nomCarte = ref('ma-carte')
const champGlb = ref<HTMLInputElement>()
const champZip = ref<HTMLInputElement>()
let estDemonte = false

// Miroir réactif de l'état de la scène (la scène n'est pas réactive).
const outil = ref<Outil>('selection')
const typeAPoser = ref<TypeObjet>('ile')
const selection = ref<ObjetCarte | null>(null)
const nombreObjets = ref(0)
const nombreBloquees = ref(0)
const reglages = reactive<ReglagesCarte>({
    eauTeinte: 0, eauLuminosite: 0, cielTeinte: 0, cielLuminosite: 0, soleilAzimut: 0, soleilHauteur: 0, soleilIntensite: 0,
})
const rotation = ref(0)
const echelle = ref(1)
const positionX = ref(0)
const positionZ = ref(0)

const FORMES: readonly { type: Exclude<TypeObjet, 'modele'>; nom: string }[] = [
    { type: 'ile', nom: 'Île' },
    { type: 'rocher', nom: 'Rocher' },
    { type: 'bouee', nom: 'Bouée' },
]

function synchroniser() {
    const courante = scene.value
    if (!courante) return
    outil.value = courante.etat.outil
    typeAPoser.value = courante.etat.typeAPoser
    const objet = courante.objetSelectionne()
    selection.value = objet
    if (objet) {
        rotation.value = Math.round(objet.rotation)
        echelle.value = Math.round(objet.echelle * 100) / 100
        positionX.value = Math.round(objet.x * 100) / 100
        positionZ.value = Math.round(objet.z * 100) / 100
    }
    nombreObjets.value = courante.objets().length
    nombreBloquees.value = courante.casesBloquees().length
    Object.assign(reglages, courante.reglages)
}

function afficherErreur(texte: string) {
    erreur.value = texte
    message.value = ''
}

onMounted(async () => {
    try {
        const creee = await creerSceneEditeur(toile.value!, {
            surChangement: synchroniser,
            surErreur: afficherErreur,
        })
        if (estDemonte) {
            creee.liberer()
            return
        }
        scene.value = creee
        synchroniser()
    } catch (erreurCapturee) {
        erreur.value = erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee)
    } finally {
        chargement.value = false
    }
    window.addEventListener('keydown', surTouche)
})

onBeforeUnmount(() => {
    estDemonte = true
    window.removeEventListener('keydown', surTouche)
    scene.value?.liberer()
})

function surTouche(evenement: KeyboardEvent) {
    const cible = evenement.target as HTMLElement | null
    if (cible && ['INPUT', 'TEXTAREA'].includes(cible.tagName) && (cible as HTMLInputElement).type !== 'range') return
    if ((evenement.key === 'Delete' || evenement.key === 'Backspace') && selection.value) {
        evenement.preventDefault()
        supprimer()
    }
    if (evenement.key === 'Escape') choisirOutil('selection')
}

function choisirOutil(nouvelOutil: Outil, type?: TypeObjet) {
    scene.value?.definirOutil(nouvelOutil, type)
}

function poserForme(type: TypeObjet) {
    erreur.value = ''
    choisirOutil('poser', type)
}

function reglerSlider(cle: keyof ReglagesCarte, valeur: number) {
    if (!scene.value) return
    scene.value.reglages[cle] = valeur
    reglages[cle] = valeur
    scene.value.appliquerReglages()
}

function modifier(champ: 'rotation' | 'echelle' | 'x' | 'z', valeur: number) {
    if (!selection.value || !Number.isFinite(valeur)) return
    scene.value?.majObjet(selection.value.identifiant, { [champ]: valeur })
}

function multiplierEchelle(facteur: number) {
    if (selection.value) modifier('echelle', selection.value.echelle * facteur)
}

function supprimer() {
    if (selection.value) scene.value?.supprimer(selection.value.identifiant)
}

// ------------------------------------------------------------------- import / export

function nomUnique(nomBrut: string): string {
    const base = nomSur(nomBrut.replace(/\.glb$/i, ''), 'modele')
    const pris = new Set(scene.value?.objets().map((objet) => objet.fichier))
    let nom = `${base}.glb`
    for (let n = 2; pris.has(nom); n++) nom = `${base}-${n}.glb`
    return nom
}

async function importerGlb(evenement: Event) {
    const champ = evenement.target as HTMLInputElement
    const fichiers = [...(champ.files ?? [])]
    champ.value = ''
    erreur.value = ''
    for (const fichier of fichiers) {
        try {
            const donnees = new Uint8Array(await fichier.arrayBuffer())
            await scene.value?.ajouterModele({ fichier: nomUnique(fichier.name), donnees })
            choisirOutil('selection')
            message.value = `« ${fichier.name} » importé. Réduis-le avec le curseur d'échelle si besoin.`
        } catch (erreurCapturee) {
            afficherErreur(erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee))
        }
    }
}

function telecharger(blob: Blob, nomFichier: string) {
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(blob)
    lien.download = nomFichier
    lien.click()
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}

function exporter() {
    const courante = scene.value
    if (!courante) return
    erreur.value = ''
    const nom = nomSur(nomCarte.value, 'ma-carte')
    const carte = courante.exporter(nom)
    const encodeur = new TextEncoder()
    const entrees: EntreeZip[] = [{ chemin: `${nom}/carte.json`, donnees: encodeur.encode(JSON.stringify(carte, null, 2)) }]
    const fichiers = new Set(carte.objets.flatMap((objet) => (objet.fichier ? [objet.fichier] : [])))
    for (const fichier of fichiers) {
        const donnees = courante.donneesModele(fichier)
        if (donnees) entrees.push({ chemin: `${nom}/objets/${fichier}`, donnees })
    }
    telecharger(ecrireZip(entrees), `${nom}.zip`)
    message.value = `Zip « ${nom}.zip » créé. Décompresse-le dans public/cartes/ : le dossier ${nom}/ doit s'y trouver.`
}

async function importerZip(evenement: Event) {
    const champ = evenement.target as HTMLInputElement
    const fichier = champ.files?.[0]
    champ.value = ''
    if (!fichier || !scene.value) return
    erreur.value = ''
    try {
        const entrees = await lireZip(await fichier.arrayBuffer())
        const entreeCarte = entrees.find((entree) => /(^|\/)carte\.json$/.test(entree.chemin))
        if (!entreeCarte) throw new Error('carte.json introuvable dans ce .zip.')
        const carte = lireCarte(new TextDecoder().decode(entreeCarte.donnees))
        const modeles = new Map<string, Uint8Array>()
        for (const entree of entrees) {
            const trouve = /(^|\/)objets\/([^/]+)$/.exec(entree.chemin)
            if (trouve) modeles.set(trouve[2]!, entree.donnees)
        }
        await scene.value.chargerCarte(carte, modeles)
        nomCarte.value = carte.nom
        message.value = `Carte « ${carte.nom} » chargée : ${carte.objets.length} objet(s), ${carte.casesBloquees.length} case(s) bloquée(s).`
    } catch (erreurCapturee) {
        afficherErreur(erreurCapturee instanceof Error ? erreurCapturee.message : String(erreurCapturee))
    }
}

const aide = computed(() => {
    if (outil.value === 'poser') return 'Clique dans la mer pour poser. Maj + clic : en poser plusieurs. Échap : annuler.'
    if (outil.value === 'peindre') return 'Clique ou glisse sur les cases pour les bloquer (rouge). Repeindre une case rouge la débloque.'
    return 'Clique un objet pour le choisir, glisse pour le déplacer. Glisse dans la mer ou clic droit pour tourner la vue, molette pour zoomer.'
})

const NOMS_TYPE: Record<TypeObjet, string> = { ile: 'Île', rocher: 'Rocher', bouee: 'Bouée', modele: 'Modèle .glb' }
</script>

<template>
    <main class="editeur">
        <header class="entete">
            <h1>Éditeur de carte</h1>
            <label class="nom">
                Nom
                <input v-model="nomCarte" type="text" maxlength="40" />
            </label>
            <span class="boutons">
                <button type="button" :disabled="!scene" @click="champZip?.click()">Importer</button>
                <button type="button" class="principal" :disabled="!scene" @click="exporter">Exporter</button>
            </span>
            <input ref="champZip" type="file" accept=".zip,application/zip" hidden @change="importerZip" />
            <input ref="champGlb" type="file" accept=".glb,model/gltf-binary" multiple hidden @change="importerGlb" />
        </header>

        <div class="barre" role="toolbar" aria-label="Outils">
            <button
                v-for="forme in FORMES"
                :key="forme.type"
                type="button"
                :class="{ actif: outil === 'poser' && typeAPoser === forme.type }"
                :disabled="!scene"
                @click="poserForme(forme.type)"
            >{{ forme.nom }}</button>
            <button type="button" :disabled="!scene" @click="champGlb?.click()">Importer un .glb</button>
            <span class="separateur" />
            <button type="button" :class="{ actif: outil === 'selection' }" :disabled="!scene" @click="choisirOutil('selection')">Sélection</button>
            <button type="button" :class="{ actif: outil === 'peindre' }" :disabled="!scene" @click="choisirOutil('peindre')">Bloquer des cases</button>
        </div>

        <div class="zone">
            <div class="cadre">
                <canvas ref="toile" class="toile" />
                <p v-if="chargement" class="voile">Chargement de l'éditeur…</p>
                <p v-else-if="erreur && !scene" class="voile erreur" role="alert">{{ erreur }}</p>
            </div>

            <aside class="panneau">
                <p class="aide">{{ aide }}</p>
                <p v-if="erreur && scene" class="erreur" role="alert">{{ erreur }}</p>
                <p v-if="message" class="message" role="status">{{ message }}</p>

                <section>
                    <h2>Objet choisi</h2>
                    <template v-if="selection">
                        <p><strong>{{ NOMS_TYPE[selection.type] }}</strong><span v-if="selection.fichier"> · {{ selection.fichier }}</span></p>
                        <label>
                            Rotation : {{ rotation }}°
                            <input type="range" min="0" max="359" step="1" :value="rotation" @input="modifier('rotation', Number(($event.target as HTMLInputElement).value))" />
                        </label>
                        <label class="court">
                            Degrés
                            <input type="number" min="0" max="359" step="1" :value="rotation"
                                @change="modifier('rotation', Number(($event.target as HTMLInputElement).value))" />
                        </label>
                        <label>
                            Taille : ×{{ echelle }}
                            <input type="range" min="0.1" max="4" step="0.05" :value="Math.min(echelle, 4)" @input="modifier('echelle', Number(($event.target as HTMLInputElement).value))" />
                        </label>
                        <label class="court">
                            Valeur ×
                            <input type="number" :min="ECHELLE_MIN" step="any" :value="echelle"
                                @change="modifier('echelle', Number(($event.target as HTMLInputElement).value))" />
                        </label>
                        <span class="boutons">
                            <button type="button" @click="multiplierEchelle(0.5)">Réduire de moitié</button>
                            <button type="button" @click="multiplierEchelle(1 / 0.9)">+ 10 %</button>
                            <button type="button" @click="multiplierEchelle(0.9)">− 10 %</button>
                        </span>
                        <span class="boutons">
                            <label class="court">X <input type="number" step="0.1" :value="positionX" @change="modifier('x', Number(($event.target as HTMLInputElement).value))" /></label>
                            <label class="court">Z <input type="number" step="0.1" :value="positionZ" @change="modifier('z', Number(($event.target as HTMLInputElement).value))" /></label>
                        </span>
                        <button type="button" class="danger" @click="supprimer">Supprimer (Suppr)</button>
                    </template>
                    <p v-else class="vide">Aucun objet choisi. {{ nombreObjets }} objet(s) sur la carte.</p>
                </section>

                <section>
                    <h2>Cases bloquées</h2>
                    <p>{{ nombreBloquees }} case(s). Aucun bateau ne s'y place, aucun tir n'y va.</p>
                    <button type="button" :disabled="nombreBloquees === 0" @click="scene?.viderCasesBloquees()">Tout débloquer</button>
                </section>

                <section>
                    <h2>Eau</h2>
                    <label>Teinte <input type="range" min="0" max="360" step="1" :value="reglages.eauTeinte" @input="reglerSlider('eauTeinte', Number(($event.target as HTMLInputElement).value))" /></label>
                    <label>Clarté <input type="range" min="0.05" max="0.6" step="0.01" :value="reglages.eauLuminosite" @input="reglerSlider('eauLuminosite', Number(($event.target as HTMLInputElement).value))" /></label>
                </section>

                <section>
                    <h2>Ciel</h2>
                    <label>Teinte <input type="range" min="0" max="360" step="1" :value="reglages.cielTeinte" @input="reglerSlider('cielTeinte', Number(($event.target as HTMLInputElement).value))" /></label>
                    <label>Clarté <input type="range" min="0.02" max="0.85" step="0.01" :value="reglages.cielLuminosite" @input="reglerSlider('cielLuminosite', Number(($event.target as HTMLInputElement).value))" /></label>
                </section>

                <section>
                    <h2>Soleil</h2>
                    <label>Direction <input type="range" min="0" max="360" step="1" :value="reglages.soleilAzimut" @input="reglerSlider('soleilAzimut', Number(($event.target as HTMLInputElement).value))" /></label>
                    <label>Hauteur <input type="range" min="5" max="90" step="1" :value="reglages.soleilHauteur" @input="reglerSlider('soleilHauteur', Number(($event.target as HTMLInputElement).value))" /></label>
                    <label>Intensité <input type="range" min="0" max="2" step="0.05" :value="reglages.soleilIntensite" @input="reglerSlider('soleilIntensite', Number(($event.target as HTMLInputElement).value))" /></label>
                </section>
            </aside>
        </div>
    </main>
</template>

<style scoped>
.editeur {
    max-width: 82rem;
    margin: 0 auto;
    padding: 1rem;
}
.entete {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
}
.entete h1 {
    margin: 0;
    font-size: 1.4rem;
}
.nom {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.boutons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.barre {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.75rem 0;
}
.separateur {
    width: 1px;
    align-self: stretch;
    background: currentColor;
    opacity: 0.3;
}
button.actif {
    outline: 2px solid #f0c93a;
}
button.principal {
    font-weight: 600;
}
button.danger {
    color: #f4a69a;
}
.zone {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(17rem, 1fr);
    gap: 1rem;
}
.cadre {
    position: relative;
}
.toile {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 6px;
    background: #05101e;
    touch-action: none;
}
.voile {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1.5rem;
    text-align: center;
    background: rgb(5 16 30 / 0.85);
    border-radius: 6px;
}
.erreur {
    color: #f4c9bd;
}
.message {
    color: #b8e6c1;
}
.panneau {
    display: grid;
    align-content: start;
    gap: 0.75rem;
}
.panneau section {
    display: grid;
    gap: 0.4rem;
}
.panneau h2 {
    margin: 0;
    font-size: 1rem;
}
.panneau p {
    margin: 0;
}
.panneau label {
    display: grid;
    gap: 0.15rem;
}
.panneau label.court {
    display: flex;
    align-items: center;
    gap: 0.3rem;
}
.panneau label.court input {
    width: 5rem;
}
.vide {
    opacity: 0.7;
}
@media (max-width: 800px) {
    .zone {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
