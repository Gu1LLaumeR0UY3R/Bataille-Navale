import { createApp } from 'vue'
import './styles/theme.css'
import Application from './App.vue'
import EssaiModeles from './components/EssaiModeles.vue'

// /?essai=modeles ouvre la page d'essai des modèles 3D à la place du jeu.
const essaiModeles = new URLSearchParams(window.location.search).get('essai') === 'modeles'

createApp(essaiModeles ? EssaiModeles : Application).mount('#app')
