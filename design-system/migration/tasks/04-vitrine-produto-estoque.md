# [DS] Vitrine do produto e indicador de estoque

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

Duas peças que sempre aparecem juntas na tela de drop:

- `src/components/ProductDetails.vue` (portado de `ProductDetails.jsx`, 115 linhas, 15 estilos inline): imagem, nome, preço e descrição do produto
- `src/components/StockProgress.vue` (portado de `StockProgress.jsx`, 101 linhas, 10 estilos inline): barra de estoque restante

## Estado atual

`ProductDetails` usa `.glass-card`, `.glass-card-interactive` e dois `.badge` sem variante semântica. `StockProgress` usa `.glass-card slide-up` com `.pulse-scale` condicional e `.pulse-glow`. Ou seja, **comunica escassez por brilho e pulsação**, que é exatamente o anti-padrão que o Design System proíbe (`foundations/radius-elevation.md` e `foundations/motion.md`).

## Como implementar

### ProductDetails

| Hoje | Vira |
|---|---|
| `.glass-card` | `.ds-card` |
| `.glass-card-interactive` (imagem) | `.ds-card ds-card--flush` com a imagem sangrada |
| nome do produto | `<h2 class="ds-card__title">` |
| preço | `.ds-stat` → `ds-stat__value` + `ds-stat__unit` ("R$") |
| `.badge` genérico | variante semântica (`--waiting`, `--done`, …) conforme o significado real |

Preço formatado num `computed` com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` (ver `components/stat.md`).

### StockProgress

Trocar brilho por **cor e número**:

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  unitsAllocated: { type: Number, default: 100 },
  unitsSold: { type: Number, default: 0 },
})
const available = computed(() => props.unitsAllocated - props.unitsSold)
const pct = computed(() => Math.round((available.value / props.unitsAllocated) * 100))
</script>

<template>
  <div
    :class="['ds-meter', { 'ds-meter--critical': pct <= 20 }]"
    role="progressbar"
    :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"
    aria-label="Estoque restante"
  >
    <div class="ds-meter__fill" :style="{ width: pct + '%' }" />
  </div>
</template>
```

Regra fixa: **> 20% azul (`--ds-chart-1`); ≤ 20% coral (`.ds-meter--critical`)**. A troca de cor é o alerta: sem pulsar, sem brilhar. O `watch` que hoje liga um "pulse" quando `unitsSold` muda sai junto.

Se houver composição (vendido / reservado / disponível), use `.ds-progress` segmentado em vez do meter simples, com os stats abaixo em `.ds-stat-grid`. O padrão está em `components/progress-chart.md`.

### Escassez é informação, não pressão

A barra sozinha não informa quantidade: sempre acompanhe de `.ds-stat` com o número absoluto ("34 un. disponíveis"). Nada de contador inventado ou "X pessoas vendo agora" sem dado real por trás (`patterns/drop-page.md`, regra 3).

## Critérios de aceite

- [ ] `.pulse-glow` e `.pulse-scale` removidos dos dois componentes
- [ ] Meter troca de cor em ≤ 20%, sem animação de loop
- [ ] `role="progressbar"` com `aria-valuenow`/`aria-label`
- [ ] Preço formatado em pt-BR
- [ ] Número absoluto de estoque visível junto da barra
- [ ] Zero `.glass-card`, zero hex literal; `:style` só para a largura calculada
- [ ] `prefers-reduced-motion` respeitado
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "glass-card|pulse-glow|pulse-scale|#[0-9a-fA-F]{3,6}" src/components/ProductDetails.vue src/components/StockProgress.vue   # vazio
grep -cE ':?style="' src/components/ProductDetails.vue src/components/StockProgress.vue   # 0 e 1
npm run lint
```

Manual: simule estoque em 50%, 20% e 5% (painel de simulação) e confirme a troca de cor no limiar certo.

## Referências do Design System

- `design-system/components/progress-chart.md`: meter, progress segmentado, regra dos 20%
- `design-system/components/stat.md`: número + unidade + rótulo
- `design-system/components/card.md`: `--flush` para imagem sangrada
- `design-system/foundations/motion.md`: por que o pulso decorativo sai

## Para o Claude Code

```
Leia design-system/CLAUDE.md, components/progress-chart.md, components/stat.md e
foundations/motion.md. Refatore src/components/ProductDetails.vue e StockProgress.vue:
cards do DS, preço em ds-stat com Intl pt-BR num computed, e substitua o pulse-glow/
pulse-scale do estoque pela regra de cor do ds-meter (:class com ds-meter--critical em
<= 20%), com role=progressbar e o número absoluto de unidades ao lado. :style só para a
largura calculada. Não crie bloco <style>.
```
