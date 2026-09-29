# Análise Sistêmica — Stratus CRM → Design System DRPCommerce

**Referência:** [Stratus CRM — SaaS & UX/UI Dashboard Design](https://www.behance.net/gallery/215887035/Stratus-CRM-SaaS-UX-UI-Dashboard-Design) · Rondesignlab · 2024 · Califórnia · SaaS/CRM
**Escopo da referência:** UX Design, UI Design, Logo Design, branding e landing page.
**Data da análise:** 2026-09-20

---

## 0. Método

A galeria do Behance não publica specs (sem hex, sem escala tipográfica, sem grid). A análise foi feita por **engenharia reversa visual**:

1. Download das 17 peças do projeto em 1400px.
2. Leitura visual de 7 peças-chave (dashboard desktop, app mobile, landing, branding, diagrama problema/solução).
3. **Amostragem de pixels** (histograma exato, sem quantização) sobre as peças de UI para extrair os hex reais.

Resultado da amostragem — as cores que sustentam o sistema inteiro:

| Hex medido | Ocorrências (amostra) | Papel na referência |
|---|---|---|
| `#FFFFFF` | ~1.5M | superfície de card, texto sobre blocos de cor |
| `#EDEEF0` | ~600k | canvas / fundo da aplicação |
| `#83A2DB` | ~240k | **azul-periwinkle de marca** — blocos, gráficos, seleção |
| `#2A292E` | ~51k | tinta: CTA, pill de nav ativa, cards escuros, tipografia |
| `#CAD0DC` | ~18k | bordas e sombras azuladas, separadores |
| `#FD8E8C` | ~9k | **coral** — urgência, "Active", alerta, destaque de data |
| `#FFE880` | residual | âmbar de apoio (segmentos de progresso, anéis de avatar) |

> Tudo o que segue é derivado desses fatos + do que as peças mostram. Onde houve **extrapolação** (ex.: verde de sucesso, que não existe na referência), está marcado como **[extensão]**.

---

## 1. Os cinco princípios do sistema

A referência não declara princípios, mas eles são legíveis na repetição das decisões:

| Princípio | Evidência visual | Consequência de engenharia |
|---|---|---|
| **P1 — O branco é o componente.** Nada é decorado: a hierarquia vem do contraste entre canvas `#EDEEF0` e cards `#FFFFFF`. | Dashboard inteiro é uma pilha de cards brancos sobre cinza. | Superfícies têm apenas 3 níveis. Sem bordas fortes, sem gradientes. |
| **P2 — Cor é semântica, nunca decoração.** Só 2 cromas (azul, coral) em toda a interface. | Donut chart usa exatamente azul (executado) e coral (ativo). Nada mais colorido. | A paleta de dados **é** a paleta de status. Não existe "cor bonita". |
| **P3 — Forma macia, dado duro.** Raios grandes (20–28px), pills, botões circulares — contendo tabelas densas e números exatos. | Cards de journey, FAB preto, chips "Executed"/"Scheduled". | Escala de raio generosa; densidade tipográfica compacta dentro dela. |
| **P4 — Ação é preta.** O elemento mais importante da tela é sempre quase-preto, não colorido. | Pill "Cases" ativa, FAB `+`, botão de confirmar, card "Request Processing". | Resolve contraste (14.4:1) e libera o azul para superfícies. |
| **P5 — Pessoas antes de campos.** Avatares circulares empilhados são o identificador primário de cada registro. | Toda linha, card e etapa começa com um avatar. | `avatar-group` é componente de primeira classe, não enfeite. |

---

## 2. Decomposição sistêmica

### 2.1 Cor — estrutura de 3 camadas

```
primitivos      blue-50..800 · coral-50..700 · ink-50..900 · amber · [extensão] success
    |  (mapeamento semântico — único ponto onde light/dark divergem)
semânticos      surface-* · text-* · border-* · action-* · status-* · chart-*
    |
componentes     --ds-btn-*, --ds-card-*  (só quando o componente precisa de exceção)
```

**Achado crítico de acessibilidade.** O azul de marca medido (`#83A2DB`) tem **2.58:1** sobre branco — reprova até para texto grande. O coral (`#FD8E8C`) tem **2.23:1**. Na referência isso não aparece como problema porque ambos são usados **como fundo com texto branco em display grande** ou **como preenchimento de gráfico**, nunca como texto pequeno.

Para uma aplicação real isso exige um degrau extra que a referência não tem:

| Uso | Token | Hex | Contraste sobre branco |
|---|---|---|---|
| Superfície/bloco de marca | `--ds-surface-brand` | `#83A2DB` | — (fundo) |
| **Texto/link/ícone de marca** | `--ds-text-brand` | `#4A6FB5` | **4.97:1** ✔ |
| Preenchimento de status crítico | `--ds-status-critical-bg` | `#FD8E8C` | — (fundo) |
| **Texto crítico** | `--ds-text-danger` | `#C5453F` | **4.91:1** ✔ |
| Texto principal | `--ds-text-primary` | `#2A292E` | **14.45:1** ✔ |
| Texto secundário | `--ds-text-secondary` | `#6B6B73` | **5.32:1** ✔ |

→ **As regras R3 e R4 do `CLAUDE.md` nascem daqui.**

### 2.2 Tipografia

A referência usa um **sans geométrico** (formas circulares, terminais retos, altura-x média), tanto no logotipo `stratus`**crm** — que joga peso regular + light na mesma palavra — quanto na UI. O arquivo de fonte não é público.

Equivalentes livres adotados:

- **Display** (`--ds-font-display`): **Poppins** — títulos de tela, números de KPI, marca.
- **UI/corpo** (`--ds-font-sans`): **Inter** — rótulos, tabelas, parágrafos (mais legível em 12–14px que um geométrico puro).

Padrões observados e codificados:

- Títulos de tela grandes (28–34px) com `letter-spacing: -0.02em`, peso 500–600 — **nunca 700+**. A referência evita negrito pesado.
- Rótulo de dado em 11–12px, cinza `#6B6B73`, imediatamente abaixo do número.
- KPI: número em display 20–24px preto + unidade em cinza menor na mesma linha (`134 hrs.`, `12,310 $`).
- Hierarquia por **cor e tamanho**, quase nunca por peso.

### 2.3 Espaço e grid

- Base **4px**, com passos reais observados em 8/12/16/20/24/32/40.
- Padding interno de card: **20–24px**; gap entre cards: **16–24px**.
- Shell: **rail vertical de ícones** (~72px, botões circulares de 40px) + topbar (~64px) + conteúdo em cards.
- Nav horizontal com item ativo em **pill preta** — não sublinhado, não borda.
- Landing: coluna de texto estreita (~560px) contra bloco de cor/imagem sangrado.

### 2.4 Forma (raio) e profundidade

| Elemento | Raio observado | Token |
|---|---|---|
| Card de conteúdo | 20–24px | `--ds-radius-xl` / `2xl` |
| Container de seção | 24–32px | `--ds-radius-2xl` / `3xl` |
| Input, botão retangular | 12–14px | `--ds-radius-md` |
| Chip/badge/pill de nav | 999px | `--ds-radius-pill` |
| Botão de ícone, avatar, FAB | círculo | `--ds-radius-circle` |

Profundidade: **sem borda definida**. A separação vem de sombra muito difusa e levemente azulada (`#CAD0DC`), deslocamento vertical baixo, blur alto. Nunca sombra dura, nunca sombra colorida saturada.

### 2.5 Movimento

Não observável em imagens estáticas. Codificado por coerência com a forma (macia, contida): durações 120–320ms, easing `cubic-bezier(0.2, 0, 0, 1)`, deslocamento máximo de 4px em hover. Ver `foundations/motion.md`.

### 2.6 Visualização de dados

- **Donut de anel fino**, furo grande (~55%), pontas arredondadas, rótulo dentro do arco.
- Contagem numérica em **bolha circular** presa à borda do arco — não legenda lateral.
- Barra de alocação **segmentada** em blocos arredondados (azul / âmbar / coral / azul-claro).
- Paleta de série = paleta de status. Máximo 4 séries; acima disso, use tons da rampa azul.
- Sem gridlines pesadas, sem 3D, sem gradiente de preenchimento.

### 2.7 Inventário de componentes da referência

`icon-rail` · `topbar` · `nav-pill` · `search` · `avatar` / `avatar-group` (com badge numérico e anel colorido) · `card` · `card--inverse` (preto) · `task-card` (avatar + texto + ações) · `stat` (número + unidade + rótulo) · `segmented-progress` · `status-badge` · `table` (sem zebra, linhas separadas por hairline) · `donut-chart` · `calendar/date-range` (tema escuro, range em coral) · `fab` · `icon-button` (circular, outline fino) · `modal/sheet` · `flow-connector` (linhas pontilhadas entre cards).

---

## 3. Adaptação para o DRPCommerce

O produto não é um CRM: é um **drop com fila prioritária de checkout** (tensão temporal alta, evento ao vivo, estoque escasso). A tradução:

| Elemento do CRM | Equivalente no DRPCommerce |
|---|---|
| Pipeline de casos | Evento de drop e sua linha do tempo |
| Chip "Active" (coral) | **Drop AO VIVO** / posição crítica na fila |
| Chip "Scheduled" (azul) | Fila aberta, aguardando |
| Chip "Executed" (cinza/azul) | Pedido concluído / drop encerrado |
| Barra de alocação segmentada | **Estoque restante** (`StockProgress`) |
| Bolha numérica no donut | **Sua posição na fila** (`QueueStatus`) |
| Calendário com range coral | **Countdown** e janela de checkout |
| FAB preto | CTA "Entrar na fila" / "Finalizar compra" |

Decisões de adaptação (todas registradas como token ou spec):

1. **Coral vira o canal de urgência do produto** — countdown < 60s, últimas unidades, fila crítica. Por isso ganha rampa completa e par de texto acessível.
2. **[extensão] Verde de sucesso** (`#1F7A5C` texto / `#DFF3EB` fundo): a referência não tem estado de sucesso, mas checkout exige confirmação inequívoca. Escolhido com saturação percebida próxima à do azul para não destoar.
3. **Dark mode**: a referência só mostra superfícies escuras pontuais (calendário, FAB, card "Request Processing"), mas o produto roda em eventos noturnos e o app legado já é escuro. O sistema define os dois temas; sobre canvas escuro `#83A2DB` passa a **6.6:1**, então no dark o azul **pode** ser texto.
4. **Densidade**: a referência é espaçosa (SaaS desktop). Para fila/checkout mobile o sistema prevê escala de espaço compacta em `@media`, mantendo os mesmos raios.

---

## 4. Lacunas da referência (o que foi inventado — e por quê)

| Lacuna | Decisão | Risco se ignorada |
|---|---|---|
| Sem tokens publicados | Extraídos por amostragem de pixel | Deriva de cor entre telas |
| Sem estado de foco visível | Ring de 3px `rgba(74,111,181,.28)` + offset 2px | Inacessível via teclado |
| Sem disabled/loading/erro | Definidos em `patterns/states.md` | Cada dev inventa o seu |
| Sem escala tipográfica declarada | Escala de 11 degraus derivada dos tamanhos vistos | Títulos aleatórios |
| Sem verde/sucesso | **[extensão]** | Confirmação de pedido ambígua |
| Sem breakpoints | 480 / 768 / 1024 / 1280 / 1440 | Layout quebra no mobile |
| Sem regra de contraste | Rampas `-600` para texto | Reprovação em WCAG AA |
| Fonte não divulgada | Poppins + Inter | Identidade inconsistente |

---

## 5. Diagnóstico do código atual (`src/index.css`)

O front hoje implementa um tema **dark neon glassmorphism** (roxo `#7C4DFF`, ciano, glow, `backdrop-filter`) — **sistemicamente incompatível** com a referência nos cinco princípios: usa cor como decoração (contra P2), profundidade por brilho em vez de sombra (contra P1), CTA em gradiente colorido (contra P4).

Pontos positivos a preservar: já usa custom properties no `:root`, já isola `.btn` / `.badge` / `.glass-card` / `.input-field` como classes reutilizáveis, e já tem escala de raio coerente (12/16px). A migração é, portanto, **substituição de valores + renomeação de classes**, não reescrita de arquitetura. Mapa completo em `migration/from-neon-glass.md`.

---

## 6. Governança

- **Fonte da verdade:** `tokens/tokens.json`. CSS e JS são derivados.
- **Mudar token semântico** é decisão de sistema: exige atualizar `tokens.json`, `tokens.css`, `tokens.js`, o doc da foundation e `preview.html`.
- **Mudar primitivo** exige rechecar a tabela de contraste da seção 2.1.
- **Componente novo** só entra com spec em `components/` (use `_template.md`).
- Todo agente que tocar em UI lê `CLAUDE.md` primeiro.
