# [DS] Painel de simulação: converter a ferramenta interna para o Design System

**Depende de:** tasks 00 e 01 · **Maior volume de inline styles, menor risco de produto**

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

`src/components/SimulationPanel.vue` (portado de `SimulationPanel.jsx`, 439 linhas, o maior arquivo do front): painel de controle que manipula o tempo virtual, dispara eventos do drop e permite testar os estados da fila sem esperar o relógio real. É ferramenta interna de time, mas é **a principal ferramenta de QA das outras tasks**. Por isso vale converter, não descartar.

## Estado atual

**50 estilos inline e praticamente nenhuma classe**: o componente inteiro foi estilizado inline. É o arquivo com maior densidade de valores literais do projeto. (A `.spin-anim` e o `<style>` que a definia já saíram na task 01.)

## Como implementar

### 1. Estrutura

Painel é superfície secundária: use `.ds-card ds-card--sunken` (ou `--outlined` se ficar sobre fundo branco). Cabeçalho com `.ds-card__header` e botão de colapsar em `.ds-icon-btn ds-icon-btn--ghost` com `:aria-expanded="isOpen"` e `aria-controls` apontando para o corpo do painel.

### 2. Controles

| Hoje (inline) | Vira |
|---|---|
| inputs estilizados inline | `.ds-field` + `.ds-label` + `.ds-input` (com `v-model`) |
| botões de ação inline | `.ds-btn ds-btn--ghost ds-btn--sm` |
| grupos de botões | `.ds-cluster ds-cluster--2` |
| seções empilhadas | `.ds-stack--4` |
| rótulos de seção | `.ds-label-caps` |
| valores de estado | `.ds-stat` (pequeno) ou `.ds-badge--inverse` |

### 3. Conversão dos 50 inline styles

Regra de decisão, nesta ordem:

1. É espaçamento/alinhamento? → utilitário (`ds-stack--N`, `ds-cluster`, `ds-grid--*`)
2. É cor/tipografia/borda? → classe do DS ou `var(--ds-*)`
3. É valor calculado em runtime (largura de barra, offset)? → **pode ficar em `:style`**, usando `var(--ds-*)` para a parte fixa
4. Nada disso? → provavelmente o layout está errado; revise com `foundations/space-layout.md`

Estado visual condicional (ativo/inativo, aberto/fechado) vai em `:class`, não em `:style` com ternário.

Meta: **≤ 5 estilos inline** ao final, todos do caso 3.

### 4. Deixe claro que é ferramenta interna

O painel não deve parecer parte do produto: `--sunken`, sem `--inverse`, sem badge `--live`, título com `.ds-label-caps` ("Simulação"). Esconda em produção com a flag do Vite: `v-if="import.meta.env.DEV"` no ponto onde o `App.vue` monta o painel (ou uma variável `VITE_*` se o time quiser o painel em homologação).

## Critérios de aceite

- [ ] ≤ 5 estilos inline, todos com valor calculado
- [ ] Zero hex literal e zero token legado (`--color-*`, `--bg-*`)
- [ ] Todos os inputs com `<label>` visível
- [ ] Botão de colapsar com `aria-expanded`
- [ ] Visualmente distinto do produto (superfície `--sunken`)
- [ ] Oculto no build de produção
- [ ] Todas as funções de simulação continuam funcionando igual
- [ ] Light e dark conferidos

## Verificação

```bash
grep -cE ':?style="' src/components/SimulationPanel.vue        # <= 5
grep -nE "#[0-9a-fA-F]{3,6}|var\(--color-|spin-anim|<style" src/components/SimulationPanel.vue   # vazio
npm run lint
```

Manual: avançar tempo virtual, abrir/fechar fila, esgotar estoque, e confirmar que as telas refatoradas reagem. Rodar `npm run build && npm run preview` e confirmar que o painel não aparece.

## Referências do Design System

- `design-system/components/input.md`: campos e labels
- `design-system/components/card.md`: `--sunken` e `--outlined`
- `design-system/foundations/space-layout.md`: utilitários de composição
- `design-system/CLAUDE.md`: seção 4, anti-padrões

## Para o Claude Code

```
Leia design-system/CLAUDE.md, components/card.md, components/input.md e
foundations/space-layout.md. Refatore src/components/SimulationPanel.vue para o DS:
ds-card--sunken, campos em ds-field com label visível e v-model, botões ds-btn--ghost
ds-btn--sm, e converta os 50 estilos inline em utilitários (ds-stack--N, ds-cluster,
ds-grid) e :class, deixando :style apenas para valores calculados em runtime (meta: <= 5).
Esconda o painel em produção com import.meta.env.DEV. Não altere nenhuma função de
simulação. Não crie bloco <style>.
```
