// Primeiro import: converte os endereços de retorno (/admin/…, /{loja}/pagamento) em rota
// do hash antes de o roteador ler a URL.
import './services/entry-url'
import { createApp } from 'vue'
import '../design-system/styles/index.css'
import { initTheme } from '../design-system/tokens/tokens.js'
import { ADMIN_ENABLED, HAS_STORE, IS_MOCK } from './services/config'
import { restoreSession } from './services/auth'
import { REALMS } from './services/session'
import App from './App.vue'

// Tema claro por padrão; restaura a preferência salva ou segue o SO.
initTheme()

// Modo http: o access token vive só na memória; depois de um F5 as sessões
// voltam pelo cookie de refresh antes de a loja montar. A da equipe também,
// porque a página inicial leva o lojista logado direto ao dashboard.
// A sessão de cliente é da loja do endereço: fora de uma loja não há o que restaurar.
const restore = (realm) => restoreSession(realm).catch(() => false)
const boot = IS_MOCK
  ? Promise.resolve()
  : Promise.all([HAS_STORE ? restore(REALMS.storefront) : null, ADMIN_ENABLED ? restore(REALMS.backoffice) : null])

boot.finally(() => createApp(App).mount('#root'))
