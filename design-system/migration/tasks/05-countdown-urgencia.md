# [DS] Countdown e a linguagem de urgência do drop

**Depende de:** tasks 00 e 01

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

`src/components/Countdown.vue` (portado de `Countdown.jsx`, 157 linhas, 13 estilos inline): o relógio que conta para a abertura da fila, para o fim do drop e para a expiração da janela de checkout. É o componente que define como o produto comunica **tempo acabando**.

## Estado atual

Usa `.glass-card slide-up` e quatro badges legados (`badge-waiting`, `badge-waiting pulse-glow`, `badge-live pulse-scale`, `badge-ended`). A urgência é comunicada por **glow e pulsação**. No DS, urgência é comunicada por **cor e hierarquia**.

## Como implementar

### 1. O countdown é o card em foco da tela

Use `.ds-card--inverse` (fundo tinta, texto branco). É o único `--inverse` permitido na tela de drop, porque é o destaque (`components/card.md`: no máximo um por tela).

```vue
<template>
  <div class="ds-card ds-card--inverse ds-stack--5">
    <div class="ds-card__header">
      <h3 class="ds-card__title">Checkout expira em</h3>
      <span :class="['ds-badge', phase.variant]">
        <span v-if="phase.live" class="ds-badge__dot" />{{ phase.label }}
      </span>
    </div>
    <div :class="['ds-stat', 'ds-stat--lg', { 'ds-stat--critical': remaining < 60 }]">
      <div class="ds-stat__value ds-numeric">{{ mm }}:{{ ss }}</div>
      <div class="ds-stat__label">{{ legenda }}</div>
    </div>
    <div aria-live="polite" class="ds-sr-only">{{ phase.announcement }}</div>
  </div>
</template>
```

`phase`, `mm`, `ss` e `remaining` são `computed` sobre as props `eventData` e `virtualTime`. O `phase.announcement` é um texto fixo por fase ("A fila abriu", "Menos de 1 minuto para expirar"…), **nunca o contador**: senão o leitor de tela anuncia a cada segundo.

### 2. Mapa de badges por fase

| Fase | Variante | Rótulo |
|---|---|---|
| Antes de `queueOpensAt` | `ds-badge--scheduled` | "Abre em HH:MM" |
| Fila aberta, drop ativo | `ds-badge--live` | "AO VIVO" |
| Janela de checkout < 60s | `ds-badge--live` | "Expira em MM:SS" |
| Depois de `dropEndsAt` | `ds-badge--done` | "Encerrado" |

### 3. A regra dos 60 segundos

Abaixo de 60s restantes: o valor vai para `--ds-text-danger` (`.ds-stat--critical`) e o badge vira `--live`. **A mudança de cor é o alerta.** Sem piscar o card, sem aumentar fonte, sem som (`foundations/motion.md`, seção "caso especial: countdown").

### 4. Números não podem tremer

`tabular-nums` já é global no `base.css`, então não sobrescreva. Não use `<Transition>` na troca de dígito: o número é dado, não animação.

### 5. Movimento

Remover `pulse-glow` e `pulse-scale`. A única animação que sobrevive é o pulso do `.ds-badge__dot` dentro de `--live`, que já vem pronto no CSS do sistema.

## Critérios de aceite

- [ ] Countdown em `.ds-card--inverse` com `.ds-stat--lg`
- [ ] Badges remapeados conforme a tabela de fases
- [ ] Abaixo de 60s: valor em `--ds-text-danger` e badge `--live`
- [ ] Dígitos sem tremor (largura estável durante a contagem)
- [ ] `pulse-glow` / `pulse-scale` removidos
- [ ] Mudança de fase anunciada em `aria-live="polite"`
- [ ] Zero hex literal, ≤ 1 estilo inline
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "glass-card|pulse-glow|pulse-scale|badge-live|badge-waiting|#[0-9a-fA-F]{3,6}" src/components/Countdown.vue   # vazio
grep -cE ':?style="' src/components/Countdown.vue   # <= 1
npm run lint
```

Manual: use o `SimulationPanel` para avançar o tempo virtual e conferir as quatro fases, inclusive a virada dos 60s.

## Referências do Design System

- `design-system/foundations/motion.md`: seção "caso especial: countdown"
- `design-system/components/card.md`: regra do `--inverse` único
- `design-system/components/badge.md`: mapa de estados
- `design-system/components/stat.md`: `--lg` e `--critical`

## Para o Claude Code

```
Leia design-system/CLAUDE.md, foundations/motion.md (caso especial countdown),
components/card.md e components/badge.md. Refatore src/components/Countdown.vue:
ds-card--inverse + ds-stat--lg, badges remapeados por fase via computed, e substitua
pulse-glow/pulse-scale pela regra dos 60s (ds-stat--critical + badge --live).
Adicione aria-live="polite" na mudança de fase. Não altere o cálculo de tempo.
Não crie bloco <style>.
```
