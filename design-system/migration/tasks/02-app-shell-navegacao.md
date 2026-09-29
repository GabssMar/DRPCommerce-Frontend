# [DS] App shell: layout, cabeçalho e navegação entre portal e drop

**Depende de:** tasks 00 (base Vue) e 01 (fundação)

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

A moldura da aplicação em `src/App.vue`: cabeçalho com marca, botão de voltar, badge de tempo virtual e o grid de duas colunas que sustenta a tela de drop. Também a navegação entre as duas telas (`portal` ↔ detalhe do evento), que é controlada por `currentPage`.

O comportamento de navegação **não muda**. Muda a estrutura visual e semântica.

## Estado atual

`src/App.vue` (portado 1:1 de `App.jsx`, 396 linhas) usa `.container`, `.header`, `.logo-area`, `.main-grid`, `.glass-card slide-up`, `.btn btn-primary`, `.badge`, `.pulse-scale`, e **29 estilos inline** (`:style`), vários com hex e `var(--color-*)` legados. A logo usa gradiente em texto (`-webkit-background-clip`), que sai do sistema.

## Como implementar

### Tradução de classes

| Hoje | Vira |
|---|---|
| `.container` | `.ds-container` |
| `.header` | `.ds-topbar` |
| `.main-grid` | `.ds-grid ds-grid--sidebar` |
| `.glass-card slide-up` | `.ds-card ds-animate-in` |
| `.btn btn-primary` | `.ds-btn ds-btn--primary` |
| `.badge` | `.ds-badge` + variante do estado |
| `.logo-area` | `.ds-topbar__brand` (display, peso 500); **sem gradiente no texto** |
| `.pulse-scale` | remover (só `.ds-badge--live` anima) |

### Estrutura alvo

Monte conforme `design-system/patterns/app-shell.md`:

```vue
<template>
  <div class="ds-app">
  <a href="#main" class="ds-skip-link">Pular para o conteúdo</a>
  <header class="ds-topbar ds-container">…</header>
  <main id="main" tabindex="-1" class="ds-container ds-page ds-stack--8">
    <div class="ds-cluster ds-cluster--between">
      <h1 class="ds-title">{{ event.name }}</h1>
      <span class="ds-badge ds-badge--live">…</span>
    </div>
    <section class="ds-grid ds-grid--sidebar">…</section>
  </main>
  </div>
</template>
```

### Regras que a tela precisa passar a respeitar

1. **Uma `<h1>` por tela.** Hoje o título do drop não é heading semântico.
2. **Skip link** como primeiro elemento focável.
3. O botão "voltar" é `<button class="ds-btn ds-btn--secondary">` ou `.ds-icon-btn` com `aria-label`, nunca `<div @click>`.
4. A marca é texto com `--ds-font-display`, peso 500, sem gradiente.
5. O badge de tempo virtual (simulação) usa `.ds-badge--inverse`: é informação de sistema, não status do drop.
6. Os 29 inline styles viram classes utilitárias (`ds-stack--N`, `ds-cluster`, `ds-grid--*`). `:style` só sobrevive para valor calculado em runtime (ex.: `:style="{ width: pct + '%' }"`).

## Critérios de aceite

- [ ] Nenhuma classe legada (`container`, `header`, `logo-area`, `main-grid`, `glass-card`) em `App.vue`
- [ ] Zero hex literal e zero `var(--color-*)` legado no arquivo
- [ ] ≤ 3 estilos inline, todos com valor calculado em runtime
- [ ] `<h1>` único, skip link funcional, `<main id="main">`
- [ ] Navegação portal ↔ drop funcionando igual a antes
- [ ] Layout correto em 360px, 768px e 1440px
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "glass-card|logo-area|main-grid|#[0-9a-fA-F]{3,6}|var\(--color-" src/App.vue   # vazio
grep -cE ':?style="' src/App.vue   # <= 3
npm run lint
```

## Referências do Design System

- `design-system/patterns/app-shell.md`: estrutura e ordem de leitura da tela
- `design-system/components/navigation.md`: topbar, pill ativa, skip link
- `design-system/foundations/space-layout.md`: `ds-container`, `ds-grid--sidebar`, breakpoints

## Para o Claude Code

```
Leia design-system/CLAUDE.md, patterns/app-shell.md e components/navigation.md.
Refatore src/App.vue para o app shell do DS: ds-container, ds-topbar, ds-grid--sidebar,
skip link, <main id="main"> e h1 único. Converta os 29 estilos inline em utilitários
(ds-stack--N, ds-cluster, ds-grid--*), mantendo :style apenas para valores calculados.
Não crie bloco <style>. Não altere a lógica de estado (refs, watchers) nem as chamadas de API.
```
