import { createApp } from 'vue'
import '../design-system/styles/index.css'
import './index.css'
import { initTheme } from '../design-system/tokens/tokens.js'
import { IS_MOCK } from './services/config'
import { restoreSession } from './services/auth'
import { REALMS } from './services/session'
import App from './App.vue'

// Tema claro por padrão; restaura a preferência salva ou segue o SO.
initTheme()

// Modo http: o access token vive só na memória; depois de um F5 a sessão do
// cliente volta pelo cookie de refresh antes de a loja montar.
const boot = IS_MOCK ? Promise.resolve() : restoreSession(REALMS.storefront).catch(() => false)

boot.finally(() => createApp(App).mount('#root'))
