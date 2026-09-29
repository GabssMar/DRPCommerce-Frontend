# [DS] Fundação: ativar o Design System, fontes e tema

**Depende de:** task 00 (base Vue) · **Bloqueia todas as demais tasks de DS.** Nenhuma outra refatoração começa antes desta entrar na `main`.

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

A camada de estilo global da aplicação: carregamento de CSS, fontes e tema. Nenhuma tela muda de comportamento. Esta task só liga o sistema e corrige duas classes quebradas.

## Estado atual

> **Situação:** aplicada no código React em 2026-09-28 (`src/main.jsx`, `index.html`, spinners). A task 00 leva esse conteúdo para `src/main.js`. Depois da 00, esta task é só conferência: rode a seção **Verificação**.

- `src/index.css` define um tema **dark neon glassmorphism** (roxo `#7C4DFF`, ciano, `backdrop-filter`, glow) com tokens próprios (`--color-primary`, `--bg-card-glass`, …).
- `index.html` carregava **Inter + Outfit**. O Design System pede **Inter + Poppins**.
- `.spinner` (em `CheckoutModal` e `QueueStatus`) e `.spin-anim` (em `SimulationPanel`) não existem no CSS global. O giro vinha de um `@keyframes spin` injetado por um `<style>` inline dentro do `SimulationPanel`.

## Como implementar

### 1. Importar o sistema

```js
// src/main.js — o DS vem ANTES do CSS legado
import '../design-system/styles/index.css'
import './index.css'
```

### 2. Trocar as fontes no `index.html`

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

Remover `Outfit` da URL. `--ds-font-display` é Poppins, `--ds-font-sans` é Inter.

### 3. Definir o tema padrão

O sistema é **claro por padrão** (é o da referência e reduz atrito no checkout), com alternância:

```js
// src/main.js
import { initTheme } from '../design-system/tokens/tokens.js'

initTheme() // claro por padrão; escuro só se o usuário escolheu (setTheme('dark'))
createApp(App).mount('#root')
```

Se o time decidir manter o escuro como padrão, basta `document.documentElement.setAttribute('data-theme', 'dark')`, e nenhum componente muda. **Decisão do time: registrar no comentário desta issue antes de começar.**

### 4. Corrigir as duas classes fantasma

- `.spinner` → `<span class="ds-spinner" aria-hidden="true" />`, sem inline style (o spinner herda `currentColor`).
- `.spin-anim` → remover, junto do `<style>` que a definia (ver `foundations/motion.md`: loop decorativo é anti-padrão).

### 5. Não apagar `src/index.css` ainda

O tema legado continua carregado até a task de limpeza (`09`). Durante a migração as duas camadas convivem: o DS vence porque as classes `ds-*` são novas e não conflitam.

## Critérios de aceite

- [ ] `npm run dev` sobe sem erro e `var(--ds-surface-canvas)` resolve no DevTools
- [ ] Poppins e Inter carregando (Network → fonts); Outfit removida
- [ ] `initTheme()` chamado antes do `mount`; alternância light/dark funcional em uma tela de teste
- [ ] `.ds-spinner` visível onde antes havia `.spinner`
- [ ] Nenhuma tela quebrada visualmente (o legado ainda manda no visual, e isso é esperado)
- [ ] `npm run lint` passa

## Verificação

```bash
grep -n "design-system/styles/index.css" src/main.js
grep -c "Outfit" index.html                              # deve ser 0
grep -rnE "class=\"spinner\"|spin-anim" src/             # vazio
```

## Referências do Design System

- `design-system/CLAUDE.md`: o contrato (leia antes de tudo)
- `design-system/migration/from-neon-glass.md`: passo 0 e tabela de tokens
- `design-system/foundations/typography.md`: famílias e escala
- `design-system/preview.html`: abra no navegador para ver o alvo

## Para o Claude Code

```
Leia design-system/CLAUDE.md e design-system/migration/from-neon-glass.md (passo 0).
Execute a task 01: em src/main.js, importar o DS antes do CSS legado e chamar initTheme()
antes do mount; trocar as fontes no index.html para Inter+Poppins; substituir .spinner por
<span class="ds-spinner" aria-hidden="true" /> e remover .spin-anim. Não apague
src/index.css. Não toque em mais nada dos componentes.
```
