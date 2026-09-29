# Foundation — Tipografia

> A referência cria hierarquia por **tamanho e cor**, quase nunca por peso. Peso 700+ é anti-padrão aqui.

## Famílias

| Token | Fonte | Uso |
|---|---|---|
| `--ds-font-display` | **Poppins** (300/400/500/600) | títulos de tela, valores de KPI, countdown, marca |
| `--ds-font-sans` | **Inter** (400/500/600) | tudo o mais: corpo, rótulo, tabela, botão, input |
| `--ds-font-mono` | JetBrains Mono | código, IDs de pedido |

Carregar no `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

## Escala

| Token | px | Papel | Família |
|---|---|---|---|
| `--ds-text-6xl` | 48 | hero de landing | display |
| `--ds-text-5xl` | 36 | número de destaque (posição na fila, countdown) | display |
| `--ds-text-4xl` | 30 | título de página (`h1`) | display |
| `--ds-text-3xl` | 24 | título de seção (`h2`), valor de KPI | display |
| `--ds-text-2xl` | 20 | título de card grande / modal | display |
| `--ds-text-xl` | 18 | subtítulo | display |
| `--ds-text-lg` | 16 | título de card, corpo confortável | sans |
| `--ds-text-md` | 14 | **corpo padrão**, botão, tabela, input | sans |
| `--ds-text-sm` | 13 | texto denso, célula secundária | sans |
| `--ds-text-xs` | 12 | rótulo, legenda, badge, hint | sans |
| `--ds-text-2xs` | 11 | overline em caixa alta | sans |

**Piso: 11px, e só em caixa alta com `letter-spacing` aberto.** Nada abaixo disso.

## Regras de composição

1. Título grande sempre com `letter-spacing: var(--ds-tracking-tight)` (-0.02em). Quanto maior, mais fechado.
2. Texto pequeno em caixa alta sempre com `--ds-tracking-caps` (0.06em).
3. Peso: `medium` (500) para títulos, `regular` (400) para corpo, `semibold` (600) só em números que precisam saltar. Nunca `bold` (700).
4. Número + unidade: número em display, unidade em `--ds-text-xs` cinza, alinhados por `baseline` (ver `.ds-stat`).
5. Rótulo **sempre** em `--ds-text-secondary`, nunca na mesma cor do valor.
6. Comprimento de linha em texto corrido: 60–75 caracteres (`max-width: 65ch`).
7. `font-variant-numeric: tabular-nums` em contadores — já é padrão global no `base.css`, não remova.

## Padrões prontos

```html
<!-- KPI -->
<div class="ds-stat">
  <div class="ds-stat__value">134<span class="ds-stat__unit">un.</span></div>
  <div class="ds-stat__label">Estoque restante</div>
</div>

<!-- Título de seção -->
<h2 class="ds-title">Drops ao vivo</h2>

<!-- Overline -->
<span class="ds-label-caps">Fila prioritária</span>
```
