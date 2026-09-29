# [Vue] Migração da base: de React para Vue 3, sem mudança visual

**Bloqueia todas as demais tasks.** Port 1:1: mesmo comportamento, mesmo visual, mesmas classes legadas. O Design System é aplicado nas tasks 01–09, já em Vue.

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | CSS puro + Design System (`design-system/`: classes `ds-*` e tokens `var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` (`<X :size="20" :stroke-width="1.5" />`), tamanhos 16/20/24 |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API (MediatR, FluentValidation, EF Core + PostgreSQL), em `../backend` |
| Integração | HTTP/JSON com a API do back-end via `src/services/api.js` (JS puro, independente de framework) |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

A aplicação inteira, no nível do framework. Nenhuma tela muda de comportamento nem de aparência: esta task troca React por Vue e deixa a base pronta para as tasks de Design System.

## Estado atual

- React 19 + Vite 8, `@vitejs/plugin-react`, `lucide-react`, ESLint com `eslint-plugin-react-hooks` e `eslint-plugin-react-refresh`.
- 8 componentes `.jsx` (1 957 linhas): `App.jsx` (396), `SimulationPanel.jsx` (439), `CheckoutModal.jsx` (304), `QueueStatus.jsx` (226), `EventPortal.jsx` (219), `Countdown.jsx` (157), `ProductDetails.jsx` (115), `StockProgress.jsx` (101).
- `src/services/api.js` (492 linhas) **não importa React**: é reaproveitado sem mudança.
- `npm run lint` tem 31 erros pré-existentes (imports não usados, `set-state-in-effect`, `no-useless-assignment`, `immutability`). São quase todos específicos de React e somem no port.
- A task 01 já foi aplicada no código React (`src/main.jsx`: imports do DS + `initTheme()`). Esse conteúdo precisa ser levado para `src/main.js`.

## Como implementar

### 1. Dependências

```bash
npm uninstall react react-dom lucide-react @types/react @types/react-dom \
  @vitejs/plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh
npm install vue @lucide/vue
npm install -D @vitejs/plugin-vue eslint-plugin-vue
```

Não use `lucide-vue-next`: o pacote está depreciado em favor de `@lucide/vue`.

### 2. Configuração

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
})
```

```js
// eslint.config.js
import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  { languageOptions: { globals: globals.browser } },
])
```

### 3. Ponto de entrada

`src/main.jsx` vira `src/main.js`, mantendo o que a task 01 já colocou:

```js
// src/main.js — o DS vem ANTES do CSS legado
import { createApp } from 'vue'
import '../design-system/styles/index.css'
import './index.css'
import { initTheme } from '../design-system/tokens/tokens.js'
import App from './App.vue'

initTheme()
createApp(App).mount('#root')
```

No `index.html`: `<script type="module" src="/src/main.js"></script>`.

### 4. Arquivos

| React | Vue |
|---|---|
| `src/main.jsx` | `src/main.js` |
| `src/App.jsx` | `src/App.vue` |
| `src/components/<Nome>.jsx` | `src/components/<Nome>.vue` (os 7 componentes) |
| `EventCard` (função interna de `EventPortal.jsx`) | absorvido no `v-for` de `EventPortal.vue`; o cálculo de status vira função no `<script setup>` |
| `src/services/api.js` | sem mudança |

### 5. Tradução de padrões

| React | Vue |
|---|---|
| `useState(x)` | `ref(x)` |
| estado derivado recalculado em `useEffect` | `computed(() => …)` |
| `useEffect(fn, [deps])` | `watch(deps, fn)` (`{ immediate: true }` se rodava na montagem) |
| `useEffect(fn, [])` + cleanup | `onMounted` + `onUnmounted` |
| cleanup dentro de `useEffect` com deps | `onWatcherCleanup(() => …)` |
| `useRef` de elemento | `ref` de template (`ref="el"` + `const el = useTemplateRef('el')`) |
| props `({ a, b })` | `defineProps({ a: …, b: … })` |
| props de callback (`onClose`, `onSubmit`…) | eventos: `defineEmits(['close', 'submit'])`, e no pai `@close="…"` |
| `className="…"` · `htmlFor` | `class="…"` · `for` |
| `style={{ a: b }}` | `:style="{ a: b }"` (mantido como está; sai nas tasks de DS) |
| `{cond && <X />}` · ternário | `v-if` / `v-else-if` / `v-else` |
| `{lista.map(e => <X key={e.id} />)}` | `v-for="e in lista" :key="e.id"` |
| `onClick={fn}` · `onChange` em input | `@click="fn"` · `v-model` |
| `<Icon size={16} />` (`lucide-react`) | `<Icon :size="16" />` (`@lucide/vue`) |
| `<style dangerouslySetInnerHTML>` | proibido: sem bloco `<style>` nos `.vue` |

Callbacks que viram eventos:

| Componente | Props de callback hoje | Eventos no Vue |
|---|---|---|
| `EventPortal` | `onSelectEvent` | `select-event` |
| `QueueStatus` | `onJoinQueue`, `onCheckout` | `join-queue`, `checkout` |
| `CheckoutModal` | `onClose`, `onSubmit` | `close`, `submit` |

`subscribeToSimState` (em `App` e `SimulationPanel`): assinar em `onMounted` e cancelar em `onUnmounted`. Todo `setInterval` (polling da fila, relógio) precisa de `clearInterval` em `onUnmounted`.

### 6. Documentação de stack

Atualizar o que ainda descreve React:

- `frontend/CLAUDE.md`: stack, comandos e estrutura (`main.js`, `App.vue`, `components/*.vue`)
- `design-system/CLAUDE.md`: seção 7 ("React 19 + Vite 8") e R8 (`lucide-react` → `@lucide/vue`)
- `frontend/.claude/skills/design-system/SKILL.md`: referências a "componente React"
- Exemplos JSX em `design-system/README.md` e `design-system/components/*.md`: converter para template Vue (`class`, `:prop`, `v-if`)

### O que NÃO fazer nesta task

- Não trocar nenhuma classe legada por `ds-*` nem remover inline styles: isso é das tasks 02–08.
- Não alterar `src/services/api.js` nem nenhuma regra de negócio.
- Não introduzir Vue Router, Pinia nem outra dependência além das listadas. A navegação continua por estado (`currentPage`).

## Critérios de aceite

- [ ] Zero arquivo `.jsx` e zero import de `react`, `react-dom` ou `lucide-react`
- [ ] `package.json` sem dependências React; `vue`, `@lucide/vue`, `@vitejs/plugin-vue`, `eslint-plugin-vue` presentes
- [ ] `npm run dev`, `npm run build` e `npm run lint` passam
- [ ] Fluxo completo igual ao de antes: portal → drop → entrar na fila → vez → checkout → sucesso, e voltar ao portal
- [ ] Painel de simulação funcionando (tempo virtual, fila, estoque)
- [ ] Nenhum vazamento de timer: sair e voltar ao drop várias vezes não duplica polling (conferir a aba Network)
- [ ] Visual idêntico ao React (comparar screenshots de portal, drop, fila e checkout)
- [ ] Nenhum bloco `<style>` em `.vue`
- [ ] Documentação de stack atualizada (passo 6)

## Verificação

```bash
find src -name "*.jsx" | wc -l                                      # 0
grep -rnE "from 'react'|react-dom|lucide-react" src/ package.json   # vazio
grep -rln "<style" src/ --include=*.vue                             # vazio
grep -n "main.js" index.html
npm run lint && npm run build
```

## Referências

- `design-system/CLAUDE.md`: o contrato (as regras valem igual em Vue)
- Documentação oficial: Vue 3 Composition API e `<script setup>`, `@vitejs/plugin-vue`, `eslint-plugin-vue`

## Para o Claude Code

```
Execute a task 00: migre o front-end de React 19 para Vue 3 (Composition API, <script setup>),
port 1:1 sem mudança visual. Troque as dependências (react, lucide-react, plugin-react,
eslint react) por vue, @lucide/vue, @vitejs/plugin-vue e eslint-plugin-vue; reescreva
vite.config.js e eslint.config.js; converta main.jsx em main.js mantendo os imports do DS
e initTheme(); converta App e os 7 componentes para .vue, com callbacks virando eventos
(defineEmits) e timers/assinaturas limpos em onUnmounted. Mantenha as classes legadas e
os inline styles (viram :style). Não altere src/services/api.js nem regras de negócio,
não adicione router/store, não crie bloco <style> nos .vue. Atualize a documentação de
stack listada no passo 6.
```
