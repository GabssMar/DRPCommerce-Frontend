# Componentes — Progress, Meter e Donut

**Classes:** `.ds-progress`, `.ds-meter`, `.ds-donut` · **Status:** estável

> **P2:** a paleta de dados É a paleta de status. Máximo 4 séries cromáticas; acima disso, use tons da rampa azul (`chartSequentialBlue` em `../tokens/tokens.js`).

## 1. Progress segmentado (`.ds-progress`)

Barra dividida em blocos arredondados com 3px de gap — a "task allocation" da referência. Aqui: **composição do estoque** (vendido / reservado / disponível).

```vue
<div class="ds-progress" role="img" aria-label="42 vendidos, 8 reservados, 50 disponíveis">
  <span class="ds-progress__seg ds-progress__seg--1" :style="{ width: '42%' }" />
  <span class="ds-progress__seg ds-progress__seg--3" :style="{ width: '8%' }" />
  <span class="ds-progress__seg" :style="{ width: '50%' }" />
</div>
```

Sempre acompanhe de legenda textual ou stats — a barra sozinha não informa quantidade.

## 2. Meter (`.ds-meter`)

Uma métrica contra um total. Para `StockProgress`.

```vue
<div :class="['ds-meter', { 'ds-meter--critical': pct < 20 }]"
     role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100"
     aria-label="Estoque restante">
  <div class="ds-meter__fill" :style="{ width: pct + '%' }" />
</div>
```

Regra de cor: `> 20%` azul (`--ds-chart-1`); `≤ 20%` coral (`--ds-meter--critical`). A troca de cor é o alerta — não pisque a barra.

## 3. Donut (`.ds-donut`)

Anel fino, furo grande (~55%), pontas arredondadas, rótulo dentro. Use para **proporção de 2 a 3 fatias**. Mais que isso, use barras.

```vue
<script setup>
const R = 52, C = 2 * Math.PI * R;
</script>

<div class="ds-donut-wrap">
  <svg class="ds-donut" width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
    <circle class="ds-donut__track" cx="64" cy="64" :r="R" stroke-width="10" />
    <circle class="ds-donut__arc ds-donut__arc--1" cx="64" cy="64" :r="R"
            stroke-width="10" :stroke-dasharray="`${(pct / 100) * C} ${C}`" />
  </svg>
  <div class="ds-donut-wrap__center">
    <span class="ds-stat__value">{{ pct }}%</span>
    <span class="ds-stat__label">concluído</span>
  </div>
</div>
```

O `<svg>` é `aria-hidden`; o número no centro é o conteúdo acessível.

## Regras de data-viz

1. Comece o eixo de valor no zero. Sem truncar.
2. Sem 3D, sem gradiente de preenchimento, sem sombra em série.
3. Gridline, quando existir, em `--ds-border-subtle`.
4. Rótulo direto na série é melhor que legenda separada (padrão da referência: bolha numérica presa ao arco).
5. Cor nunca é o único diferenciador: rotule as fatias.
6. Máximo 5 categorias; o resto vira "Outros".
7. Animação só na entrada do dado (`--ds-duration-slower`), nunca em loop.

## Biblioteca de gráficos

Não há nenhuma instalada e **não instale sem pedido**. SVG puro cobre donut, sparkline e barra. Se um gráfico complexo for inevitável, use `chartColors` de `../tokens/tokens.js` como paleta — nunca as cores padrão da lib.
