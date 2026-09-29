# [DS] Portal de drops: grid de eventos, status e estados de tela

**Depende de:** tasks 00 e 01 · **Recomendado depois de:** task 02

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

A tela inicial (`src/components/EventPortal.vue`): listagem de todos os drops disponíveis, cada um como card clicável que leva ao detalhe do evento (evento `select-event`). É a primeira tela que o usuário vê, e a de menor risco para validar o sistema na prática.

## Estado atual

Portado 1:1 de `EventPortal.jsx` (219 linhas), com **24 estilos inline**. Usa `.glass-card glass-card-interactive` (com o brilho deslizante), `.btn btn-secondary`, `.slide-up` e um badge com classe dinâmica (`` :class="`badge ${status.badgeClass}`" ``) que mapeia os estados do drop para as classes legadas `badge-live` / `badge-waiting` / `badge-ended`.

## Como implementar

### 1. Grid e cards

```vue
<section class="ds-grid ds-grid--3">
  <article
    v-for="e in events"
    :key="e.id"
    class="ds-card ds-card--interactive ds-animate-in"
  >…</article>
</section>
```

O brilho deslizante de `.glass-card-interactive` **sai**. O hover do sistema é `translateY(-2px)` + `--ds-shadow-md`, já embutido em `.ds-card--interactive`.

### 2. Remapear o badge de status

A função que hoje devolve `badgeClass` (no `<script setup>`) passa a devolver as variantes do DS. Use exatamente o mapa de `design-system/components/badge.md`:

| Estado do evento | Variante | Rótulo |
|---|---|---|
| `queueOpensAt` no futuro | `ds-badge--scheduled` | "Abre em HH:MM" |
| fila aberta e `dropEndsAt` no futuro | `ds-badge--live` + `ds-badge__dot` | "AO VIVO" |
| `dropEndsAt` no passado | `ds-badge--done` | "Encerrado" |
| estoque zerado | `ds-badge--done` | "Esgotado" |

```vue
<span :class="['ds-badge', status.variant]">
  <span v-if="status.live" class="ds-badge__dot" />{{ status.label }}
</span>
```

### 3. Conteúdo do card

- Imagem do produto em `.ds-card--flush` (ou topo do card com `--ds-radius-lg`)
- Nome do drop como `<h3 class="ds-card__title">`
- Preço em `.ds-stat` (valor + `ds-stat__unit`)
- Badge no `.ds-card__header`, alinhado à direita
- CTA "Ver drop" em `.ds-btn--secondary`

### 4. Estados de tela (hoje inexistentes)

Implementar os três de `design-system/patterns/states.md`, com `v-if` / `v-else-if` / `v-else`:

- **Carregando:** 3 cards de `.ds-skeleton` com a mesma altura do card final
- **Vazio:** `.ds-empty` com "Nenhum drop ativo agora." e uma ação
- **Erro:** `.ds-empty` com texto em `--ds-text-danger` + botão "Tentar de novo"

Hoje o `catch` do `loadPortalData` só faz `console.error`, e o usuário vê tela vazia sem explicação. Isso precisa mudar nesta task: guarde o erro num `ref` e renderize o estado.

## Critérios de aceite

- [ ] Grid responsivo: 3 colunas em desktop, 1 em mobile, sem scroll horizontal em 360px
- [ ] Badges usando as variantes do DS conforme o mapa acima
- [ ] Estados carregando / vazio / erro implementados e testáveis (derrubar a API para conferir)
- [ ] Zero `.glass-card`, zero hex literal, ≤ 2 estilos inline
- [ ] Card inteiro acessível por teclado (foco visível, `Enter` navega)
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "glass-card|badge-live|badge-waiting|badge-ended|#[0-9a-fA-F]{3,6}" src/components/EventPortal.vue   # vazio
grep -cE ':?style="' src/components/EventPortal.vue   # <= 2
npm run lint
```

Manual: desligue o back-end (API .NET em `../backend`) e confirme que aparece o estado de erro com botão de retry.

## Referências do Design System

- `design-system/components/card.md`: variantes e anatomia
- `design-system/components/badge.md`: **mapa de estados do drop**
- `design-system/patterns/states.md`: os cinco estados de tela
- `design-system/foundations/space-layout.md`: `ds-grid--3`

## Para o Claude Code

```
Leia design-system/CLAUDE.md, components/card.md, components/badge.md e patterns/states.md.
Refatore src/components/EventPortal.vue: grid ds-grid--3 de ds-card--interactive com v-for,
badges remapeados para as variantes do DS conforme o mapa de estados do drop, e implemente
os estados de carregando (skeleton), vazio e erro com v-if/v-else-if/v-else; hoje o catch
só faz console.error. Mantenha o evento select-event para o detalhe do drop. Não crie bloco <style>.
```
