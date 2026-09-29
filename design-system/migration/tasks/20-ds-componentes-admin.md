# [Design System] Componentes do painel: tabela de dados, paginação, barras temporais e toolbar de filtros

**Depende de:** task 01 (fundação do DS) · **Bloqueia as tasks 23–26** · Não depende do back-end

## Tecnologias

| Camada | Stack |
|---|---|
| Estilo | CSS puro em `design-system/styles/components.css`, tokens `var(--ds-*)` |
| Gráfico | **SVG inline**, sem biblioteca (`components/progress-chart.md`: "não há nenhuma instalada e não instale sem pedido") |
| Docs | uma spec por componente em `design-system/components/`, a partir de `_template.md` |

## Funcionalidade

O painel do administrador é feito de listas longas, filtros e números no tempo — três coisas que o Design System ainda não cobre. Esta task **estende o sistema**, sem tocar em nenhuma tela: é o que as tasks 23–26 vão compor.

## Estado atual

Inventário das classes existentes (`grep -oE "^\.ds-[a-z0-9_-]+" styles/components.css styles/utilities.css`):

| Precisa | Existe? |
|---|---|
| `.ds-table` (hairline, hover, `--numeric`) | ✅ com spec em `components/table.md` |
| `.ds-stat`, `.ds-stat-grid` | ✅ `components/stat.md` |
| `.ds-meter`, `.ds-progress`, `.ds-donut` | ✅ `components/progress-chart.md` |
| `.ds-input` (cobre `<select>` e `<textarea>`), `.ds-field`, `.ds-label`, `.ds-error` | ✅ `components/input.md` |
| `.ds-badge`, `.ds-card--flush`, `.ds-empty`, `.ds-skeleton`, `.ds-rail` | ✅ |
| **Cabeçalho de tabela ordenável** | ❌ `table.md` manda usar `aria-sort`, mas não há estilo nem ícone |
| **Paginação** | ❌ não existe |
| **Barras no tempo** (faturamento por dia) | ❌ `progress-chart.md` diz "SVG puro cobre sparkline e barra", mas não há classe nem spec |
| **Toolbar de filtros** | ❌ hoje seria `.ds-cluster` solto, sem padrão de quebra em mobile |

## Como implementar

Ordem obrigatória da R6: spec em `components/<nome>.md` **primeiro**, CSS em `styles/components.css` depois, `preview.html` no fim.

### 1. `.ds-table__th--sortable` (estende a tabela)

Botão dentro do `<th>` — não `onClick` no `<th>`, para o teclado alcançar:

```vue
<th scope="col" :aria-sort="sort.key === 'total' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
    class="ds-table__th--numeric ds-table__th--sortable">
  <button type="button" class="ds-table__sort" @click="toggleSort('total')">
    Valor
    <ChevronUp v-if="…" class="ds-table__sort-icon" :size="16" :stroke-width="1.5" aria-hidden="true" />
  </button>
</th>
```

O ícone de direção só aparece na coluna ativa; as demais mostram um affordance sutil no `:hover`. Nunca sinalize ordenação **só** por cor.

### 2. `.ds-pagination`

```vue
<nav class="ds-pagination" aria-label="Paginação">
  <button class="ds-icon-btn ds-icon-btn--ghost" :disabled="page === 1" aria-label="Página anterior">…</button>
  <span class="ds-pagination__status" aria-live="polite">
    {{ from }}–{{ to }} de {{ formatNumber(totalItems) }}
  </span>
  <button class="ds-icon-btn ds-icon-btn--ghost" :disabled="page === totalPages" aria-label="Próxima página">…</button>
</nav>
```

Intervalo + total em texto, não uma régua de 12 números. `aria-live="polite"` no status, para o leitor de tela anunciar a troca. Alvo ≥ 44px (R7).

### 3. `.ds-chart-bars` — faturamento no tempo

SVG inline, uma barra por bucket do `sales-summary` (task 19 §3).

```vue
<figure class="ds-chart" role="img" :aria-label="`Faturamento por dia: ${summaryText}`">
  <svg class="ds-chart-bars" :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none" aria-hidden="true">
    <line class="ds-chart__gridline" v-for="g in gridlines" :key="g.v" :x1="0" :x2="w" :y1="g.y" :y2="g.y" />
    <rect v-for="b in bars" :key="b.date" class="ds-chart-bars__bar"
          :x="b.x" :y="b.y" :width="barWidth" :height="b.height" rx="2" />
  </svg>
  <figcaption class="ds-chart__caption">…</figcaption>
</figure>
```

Regras herdadas de `progress-chart.md`, que valem aqui:

1. Eixo de valor **começa no zero**, sem truncar.
2. Sem 3D, sem gradiente, sem sombra em série. Gridline em `--ds-border-subtle`.
3. Cor da barra: `--ds-chart-1`. **Uma série só** — comparação com o período anterior é uma segunda série discreta (`--ds-chart-4`), nunca uma terceira.
4. O `<svg>` é `aria-hidden`; a informação acessível é o `aria-label` da `<figure>` **e** uma tabela `.ds-sr-only` com os valores.
5. Bucket zerado desenha barra de altura mínima visível (2px), para "vazio" não virar "sem dado".
6. Animação só na entrada (`--ds-duration-slower`), respeitando `prefers-reduced-motion`.
7. Nunca use `chartColors` fora de `tokens.js`; nada de hex no componente (R1).

Acrescente também `.ds-chart-bars--sparkline` (sem gridline, sem eixo, 48px de altura) para a linha de tendência dentro de um `.ds-stat`.

### 4. `.ds-toolbar`

Faixa de filtros acima de uma tabela: busca à esquerda, selects no meio, ação primária à direita.

```vue
<div class="ds-toolbar">
  <div class="ds-toolbar__search"><input class="ds-input" type="search" …></div>
  <select class="ds-input ds-toolbar__filter">…</select>
  <div class="ds-toolbar__actions"><button class="ds-btn ds-btn--primary">Novo drop</button></div>
</div>
```

Abaixo de 768px vira coluna, com a busca em largura cheia e os filtros em linha rolável horizontal. **Todo filtro tem `<label>`** — visível ou `.ds-sr-only`, nunca só `placeholder` (`components/input.md`).

### 5. Estados, em todos os quatro

Tabela e gráfico precisam dos três estados de `patterns/states.md`: **carregando** (`.ds-skeleton` com a altura final, nunca spinner no meio da tabela), **vazio** (`.ds-empty` com ação sugerida) e **erro** (`.ds-empty` + `--ds-text-danger` + "Tentar de novo"). Atualização em background **não** volta ao esqueleto — troca só os números.

### 6. Tokens

Se faltar um token (largura de barra, altura do gráfico), ele nasce em `tokens/tokens.json` e é replicado em `tokens.css` e `tokens.js` (R2). **Não resolva no componente.**

## Critérios de aceite

- [ ] Specs criadas: `components/pagination.md`, `components/chart-bars.md`, `components/toolbar.md`; `components/table.md` atualizado com a seção de ordenação
- [ ] Classes em `styles/components.css`; zero CSS em `.vue` (R6)
- [ ] Zero hex / px de espaçamento / sombra literal — só `var(--ds-*)` (R1)
- [ ] Light **e** dark conferidos (R5), inclusive gridline e barra
- [ ] `:focus-visible` com `--ds-ring` em `.ds-table__sort`, `.ds-pagination` e filtros; alvo ≥ 44px (R7)
- [ ] Gráfico legível por leitor de tela (tabela `.ds-sr-only` equivalente)
- [ ] `prefers-reduced-motion` respeitado
- [ ] Funciona em 360px: tabela vira cards, toolbar vira coluna, gráfico não estoura
- [ ] `preview.html` mostra os quatro componentes novos, nos três estados
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rnE "#[0-9a-fA-F]{3,8}" design-system/styles/components.css   # só dentro de tokens.css é permitido
grep -c "ds-pagination\|ds-chart-bars\|ds-toolbar" design-system/styles/components.css
ls design-system/components/{pagination,chart-bars,toolbar}.md
# abra design-system/preview.html nos dois temas, a 360px e 1440px
```

## Referências do Design System

- `CLAUDE.md` seções 1 (R1, R2, R5, R6, R7), 3 (fluxo para componente novo) e 5 (checklist)
- `components/_template.md`: molde da spec · `components/table.md`, `components/stat.md`, `components/input.md`
- `components/progress-chart.md`: regras de data-viz que o gráfico de barras herda
- `patterns/states.md`: carregando / vazio / erro / atualizando

## Para o Claude Code

```
Leia design-system/CLAUDE.md, components/_template.md, components/table.md,
components/progress-chart.md e patterns/states.md. Estenda o Design System com quatro
componentes para o painel do administrador: cabeçalho de tabela ordenável
(.ds-table__th--sortable + .ds-table__sort), .ds-pagination, .ds-chart-bars (SVG inline,
com variante sparkline) e .ds-toolbar. Para cada um: spec em components/<nome>.md a partir
do _template, depois as classes em styles/components.css, depois preview.html. Tokens novos
nascem em tokens.json e são replicados em tokens.css e tokens.js. Não toque em nenhum
arquivo de src/ — esta task não altera tela.
```
