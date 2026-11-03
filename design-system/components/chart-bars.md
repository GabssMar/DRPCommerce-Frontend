# Componente — Chart bars

**Classe:** `.ds-chart` + `.ds-chart-bars` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Valor no tempo (faturamento por dia) em barras, em SVG inline, sem biblioteca.

## Quando NÃO usar

Proporção de um todo é `.ds-progress` ou `.ds-donut`. Um único número é `.ds-stat`.

## Anatomia

```
figure.ds-chart (role="img", aria-label com o resumo)
├── .ds-chart__legend > .ds-chart__key > .ds-swatch(--2)
├── .ds-chart__plot
│   ├── .ds-chart__axis            rótulos do eixo Y (do topo ao zero)
│   └── div
│       ├── svg.ds-chart-bars (aria-hidden)
│       │   ├── line.ds-chart__gridline
│       │   ├── rect.ds-chart-bars__bar(--2)
│       │   └── rect.ds-chart-bars__hit   coluna de foco/hover
│       └── .ds-chart__labels      rótulos do eixo X
├── .ds-chart__tooltip (.ds-card--tight)
└── table.ds-sr-only               os mesmos valores, para leitor de tela
```

## Regras (herdadas de `progress-chart.md`)

1. Eixo começa no zero.
2. Sem 3D, gradiente ou sombra na série. Gridline em `--ds-border-subtle`.
3. Série 1 `--ds-chart-1` (vitrine), série 2 `--ds-chart-2` (drop), empilhadas. Nunca uma terceira.
4. O SVG é `aria-hidden`; a informação acessível é o `aria-label` da figure **e** a tabela `.ds-sr-only`.
5. Bucket zerado desenha 2px: "vazio" não vira "sem dado".
6. Animação só na entrada (`ds-bar-grow`, `--ds-duration-slower`); `prefers-reduced-motion` desliga pelo `base.css`.

## Interação

Cada dia tem um `rect.ds-chart-bars__hit` focável (`tabindex="0"`); foco ou hover abre o tooltip com os valores daquele dia. O último dia começa selecionado.

## Variantes

| Modificador | Uso |
|---|---|
| `.ds-chart-bars--sparkline` | 48px, sem eixo e sem gridline, dentro de um `.ds-stat` |
