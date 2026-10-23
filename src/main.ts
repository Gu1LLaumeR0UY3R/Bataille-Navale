import { createApp } from 'vue'
import './styles/theme.css'
import Application from './App.vue'
import EssaiModeles from './components/EssaiModeles.vue'
import EditeurCarte from './components/EditeurCarte.vue'

// /?essai=modeles ouvre la page d'essai des modèles 3D à la place du jeu.
// /?editeur=carte ouvre l'éditeur de cartes.
const parametres = new URLSearchParams(window.location.search)
const essaiModeles = parametres.get('essai') === 'modeles'
const editeurCarte = parametres.get('editeur') === 'carte'

createApp(editeurCarte ? EditeurCarte : essaiModeles ? EssaiModeles : Application).mount('#app')