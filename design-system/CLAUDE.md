# Design System — DRPCommerce (contrato para agentes)

> Este arquivo é o **contrato**. Qualquer trabalho de UI em `frontend/` deve segui-lo.
> Base visual: análise sistêmica do projeto **Stratus CRM** (Rondesignlab, 2024) — ver `ANALYSIS.md`.

## 1. Regras inegociáveis

| # | Regra | Verificação |
|---|-------|-------------|
| R1 | **Nunca** escreva um hex, rgb(), px de espaçamento ou sombra literal em componente. Use `var(--ds-*)`. | `grep -rE "#[0-9a-fA-F]{3,8}" src/` só pode dar match em `design-system/` |
| R2 | Todo token novo nasce em `tokens/tokens.json`, é replicado em `tokens/tokens.css` e (se usado em JS/charts) em `tokens/tokens.js`. Nunca só no CSS. | 3 arquivos em sincronia |
| R3 | Azul de marca (`--ds-blue-400 #83A2DB`) é cor de **superfície**, nunca de texto sobre branco (2.58:1). Para texto/link use `--ds-text-brand` (#4A6FB5). | contraste ≥ 4.5:1 |
| R4 | CTA primário é **tinta** (`--ds-action-primary-bg`, quase-preto), não azul. Isso vem da referência e resolve contraste. | ver `components/button.md` |
| R5 | Toda cor tem par light/dark. Se você adicionou só no `:root`, está incompleto. | `[data-theme="dark"]` |
| R6 | Componente novo = classe `ds-*` em `styles/components.css` + spec em `components/<nome>.md`. Sem CSS solto nos `.vue` (nem bloco `<style>`). | 2 arquivos |
| R7 | Estados obrigatórios em qualquer interativo: `:hover :active :focus-visible :disabled` + `aria-*`. | `foundations/motion.md` |
| R8 | Ícones: só `@lucide/vue`, tamanhos 16/20/24, `stroke-width: 1.5`. | `foundations/iconography.md` |

## 2. Onde olhar (roteiro de leitura)

| Vou fazer… | Leia nesta ordem |
|---|---|
| Qualquer coisa de UI | este arquivo → `tokens/tokens.css` |
| Escolher/criar cor | `foundations/color.md` |
| Texto, tamanho, peso | `foundations/typography.md` |
| Margens, grid, largura | `foundations/space-layout.md` |
| Raio, sombra, elevação | `foundations/radius-elevation.md` |
| Animação, transição | `foundations/motion.md` |
| Botão / card / badge / input / tabela / modal / gráfico… | `components/<nome>.md` |
| Montar uma tela inteira | `patterns/app-shell.md`, `patterns/drop-page.md`, `patterns/states.md` |
| Refatorar CSS legado (neon/glass) | `migration/from-neon-glass.md` |
| Ver o sistema renderizado | abra `preview.html` no navegador |

## 3. Fluxo obrigatório para "crie o componente X"

1. Procure em `components/` — se existir spec, **implemente a spec**, não invente.
2. Não existe? Verifique se é variante de um existente (ex.: "chip de status" = `badge`).
3. É realmente novo? Copie `components/_template.md`, preencha, **depois** escreva o CSS em `styles/components.css`.
4. Só use tokens semânticos (`--ds-surface-*`, `--ds-text-*`, `--ds-action-*`). Primitivos (`--ds-blue-400`) só dentro de `tokens.css`.
5. Rode o checklist da seção 5.

## 4. Anti-padrões (rejeite mesmo se pedirem "rápido")

- ❌ `:style="{ color: '#83A2DB' }"` → ✅ `class="ds-text-brand"` ou `var(--ds-text-brand)`
- ❌ `border-radius: 8px` avulso → ✅ `var(--ds-radius-sm)`
- ❌ Glassmorphism, neon glow, gradiente de marca → o sistema é **flat, claro, com sombra difusa**. (O CSS antigo em `src/index.css` é legado; ver `migration/`.)
- ❌ Nova família tipográfica → só `--ds-font-display` e `--ds-font-sans`.
- ❌ Sombra colorida (`0 0 20px azul`) → sombras são sempre neutras e verticais.
- ❌ `!important` (a única ocorrência legítima no sistema é o bloco `prefers-reduced-motion` em `styles/base.css`).
- ❌ Texto abaixo de 12px, ou cinza claro sobre branco para conteúdo.

## 5. Checklist antes de dar a tarefa por pronta

- [ ] Zero literais de cor/espaço/raio no componente
- [ ] Tokens semânticos (não primitivos) usados
- [ ] Light **e** dark verificados
- [ ] `:focus-visible` com `--ds-ring` visível
- [ ] Contraste ≥ 4.5:1 (texto) / ≥ 3:1 (bordas e ícones funcionais)
- [ ] Funciona em 360px de largura (sem scroll horizontal)
- [ ] `prefers-reduced-motion` respeitado
- [ ] Spec em `components/` criada ou atualizada
- [ ] `preview.html` atualizado se o componente é novo

## 6. Convenções de nome

```
--ds-<categoria>-<papel>-<variante>     tokens       ex.: --ds-surface-raised, --ds-action-primary-bg-hover
.ds-<bloco>__<elemento>--<modificador>  componentes  ex.: .ds-card__header, .ds-btn--ghost
.ds-<utilitário>--<escala>              utilitários  ex.: .ds-stack--6, .ds-grid--sidebar
```

Componentes vivem em `styles/components.css`; utilitários em `styles/utilities.css`. Se você não sabe em qual arquivo colocar, pergunte: "isto tem anatomia e estados?" Se sim, é componente.

## 7. Estado atual do projeto (fatos, não suposições)

- Vue 3 (Composition API, `<script setup>`) + Vite 8, CSS puro (sem Tailwind, sem CSS-in-JS). **Não introduza** framework de estilo sem pedido explícito.
- Ícones: `@lucide/vue` já instalado.
- `src/index.css` contém o tema legado *dark neon glass* (roxo/ciano). O Design System **substitui** esse tema — migração em `migration/from-neon-glass.md`.
- Fontes carregadas no `index.html`: **Poppins** (display) + **Inter** (UI), desde a task 01. O tema legado ainda declara `Outfit` em `--font-heading` até a task 09.
