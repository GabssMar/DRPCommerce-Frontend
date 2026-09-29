import { createApp } from 'vue'
import '../design-system/styles/index.css'
import './index.css'
import { initTheme } from '../design-system/tokens/tokens.js'
import App from './App.vue'

// Tema claro por padrão; restaura a preferência salva ou segue o SO.
initTheme()

createApp(App).mount('#root')
