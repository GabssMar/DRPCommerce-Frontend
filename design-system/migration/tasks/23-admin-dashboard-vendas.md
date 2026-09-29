# [Admin · Front-end] Dashboard de vendas: quanto a loja vendeu hoje e no mês

**Depende de:** tasks 20 (componentes), 21 (shell), 22 (camada de dados) · Roda em `VITE_API_MODE=mock`

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (`<script setup>`) + **Vite** |
| Estilo | `.ds-stat`, `.ds-stat-grid`, `.ds-chart-bars`, `.ds-table`, `.ds-card` — tokens `var(--ds-*)` |
| Gráfico | SVG inline (`.ds-chart-bars` da task 20). **Nenhuma biblioteca de gráfico** |
| Dados | `getSalesSummary()` de `src/services/admin/` (task 22) |

## Funcionalidade nova

A primeira tela do painel responde, em ordem: **quanto vendi hoje**, **quanto vendi no mês**, **como foi a curva** e **o que mais saiu**. Drop e vitrine somados, com a decomposição à mão.

## Estado atual

`AdminDashboard.vue` renderiza `.ds-empty` (task 21). Não existe nenhuma tela de números agregados no projeto — o mais próximo é `StockProgress.vue`, que mostra um `.ds-meter` de um drop.

## Como implementar

### 1. Hierarquia da tela (`app-shell.md`, "ordem de leitura projetada")

```
h1 "Painel da loja"                      + seletor de período à direita
┌─────────────────────────────────────────────────────────────┐
│ .ds-stat-grid — 4 KPIs                                      │
│  Hoje        Mês          Ticket médio    Pedidos           │
├─────────────────────────────────────────────────────────────┤
│ .ds-card — Faturamento por dia (.ds-chart-bars)             │
├───────────────────────────────┬─────────────────────────────┤
│ .ds-card — Mais vendidos      │ .ds-card — Por status       │
│ (.ds-table, 5 linhas)         │ (lista + .ds-badge)         │
└───────────────────────────────┴─────────────────────────────┘
```

Os KPIs vêm **antes** do gráfico. Regra 2 do `app-shell.md`: o número que mais importa fica acima da dobra.

### 2. Os quatro KPIs

| KPI | Campo do `sales-summary` | Detalhe |
|---|---|---|
| Vendido hoje | `grossRevenue` com `from = to = hoje` | + variação vs. ontem, em `.ds-badge` ao lado |
| Vendido no mês | `grossRevenue` do mês corrente | + sparkline (`.ds-chart-bars--sparkline`) |
| Ticket médio | `averageTicket` | período selecionado |
| Pedidos | `orderCount` | + `unitCount` como rótulo secundário |

Regras de `components/stat.md` que valem aqui: um stat = um número; a variação é **outro elemento** (badge), não parte do valor; valor ausente é `—`, nunca `0`; `Intl.NumberFormat('pt-BR')` sempre; carregando usa `.ds-skeleton` **da mesma altura** do valor final.

```js
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
```

### 3. "Vendido" e "recebido" não são o mesmo número

O `sales-summary` traz `byPayment` (task 19 §3). O KPI de faturamento usa `grossRevenue`; logo abaixo, em `.ds-text-sm .ds-text-secondary`, mostre quanto está **pago** (`paymentStatusId === 2`) e quanto está **pendente** (`1`).

Vender R$ 10.000 e ter recebido R$ 6.000 é informação de gestão — esconder isso é o defeito clássico de dashboard de e-commerce. Pedidos cancelados (6) e reembolsados (7) **não entram** em nenhum dos dois; o servidor já os exclui.

### 4. Seletor de período

Quatro presets + intervalo livre, em `.ds-toolbar`: **Hoje · 7 dias · Mês · 12 meses**, e dois `<input type="date">` com `<label>`. O preset escolhido define também a `granularity` (`day` até 90 dias, `month` acima). O período selecionado fica no hash (`#/admin/dashboard?from=…&to=…`) para o link ser compartilhável.

### 5. Drop × Vitrine

São dois serviços e dois endpoints (`sales-summary` de cada lado). A tela:

- soma os dois nos KPIs;
- mostra a **decomposição** ("Drops R$ X · Vitrine R$ Y") sob o valor;
- deixa o gráfico com um filtro de origem: Tudo | Drops | Vitrine.

Se **um** dos dois falhar, mostre o que veio, marque a origem que falhou em `--ds-text-danger` com "Tentar de novo", e **não** apresente um total parcial como se fosse o total. Total incompleto é pior que total ausente.

### 6. Gráfico

`.ds-chart-bars` da task 20, uma barra por bucket. Eixo no zero, sem gradiente, sem 3D. Bucket zerado desenha barra mínima. Tabela `.ds-sr-only` equivalente ao lado do `<figure>`. `aria-label` da figura resume: "Faturamento por dia, 1 a 30 de setembro, máximo R$ 4.120 em 12/09".

### 7. Estados

`patterns/states.md`: esqueleto na primeira carga (KPIs e gráfico com a altura final — a tela não pode pular quando os dados chegam); `.ds-empty` "Nenhuma venda no período" com sugestão de ampliar o intervalo; erro com "Tentar de novo". Ao trocar o período, **não** volte ao esqueleto: mantenha os números antigos esmaecidos com `aria-busy="true"`.

## Critérios de aceite

- [ ] Quatro KPIs com valor, rótulo e variação; formato pt-BR; `—` para ausente
- [ ] Pago × pendente visível no KPI de faturamento
- [ ] Gráfico de barras com eixo no zero, buckets sem buraco e equivalente acessível
- [ ] Presets de período + intervalo livre, refletidos no hash
- [ ] Decomposição Drops × Vitrine, com falha parcial sinalizada e sem total enganoso
- [ ] Tabela "Mais vendidos" com 5 linhas, valores à direita (`--numeric`)
- [ ] Somar os pedidos do período em "Pedidos" (task 26) bate com o KPI
- [ ] Três estados tratados; troca de período não volta ao esqueleto
- [ ] Zero estilo inline (exceto altura/largura calculada das barras), zero hex, zero `<style>`
- [ ] Light e dark; 360px sem scroll horizontal (KPIs em 2×2, gráfico rolável)
- [ ] `prefers-reduced-motion`: sem animação de entrada das barras
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rnE "#[0-9a-fA-F]{3,8}" src/components/admin/AdminDashboard.vue   # vazio
grep -rn ":style" src/components/admin/AdminDashboard.vue               # só width/height de barra
# no navegador: troque o período, confira o total contra a tela de Pedidos,
# force erro em uma das origens (desligue o mock de uma delas) e veja a falha parcial
```

## Referências do Design System

- `components/stat.md`: anatomia do KPI, formatação, o que não fazer
- `components/chart-bars.md` (task 20) e `components/progress-chart.md`: regras de data-viz
- `components/table.md`: "Mais vendidos" · `components/badge.md`: variação e status
- `patterns/app-shell.md`: ordem de leitura · `patterns/states.md`: carregando / vazio / erro

## Para o Claude Code

```
Leia design-system/components/stat.md, components/progress-chart.md, components/table.md,
patterns/app-shell.md e patterns/states.md, e a task 22. Implemente AdminDashboard.vue:
quatro KPIs (hoje, mês, ticket médio, pedidos) com variação em badge e pago x pendente,
gráfico .ds-chart-bars de faturamento por bucket com equivalente .ds-sr-only, tabela dos 5
mais vendidos e quebra por status. Período por presets + intervalo livre no hash. Some Drop
e Vitrine mostrando a decomposição, e trate falha parcial sem exibir total incompleto.
Dados só por getSalesSummary() de src/services/admin/. Não crie classe CSS: se faltar,
PARE e reporte — pertence à task 20.
```
