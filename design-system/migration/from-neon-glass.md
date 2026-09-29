# Migração — do tema "neon glass" para o Design System

O `src/index.css` atual implementa um tema **dark neon glassmorphism** (roxo `#7C4DFF`, ciano `#00E5FF`, glow, `backdrop-filter`, gradientes). O Design System substitui esse tema. A boa notícia: a arquitetura já é compatível (custom properties + classes utilitárias), então a migração é **tradução de valores**, não reescrita.

## Passo 0 — ligar o sistema

```js
// src/main.js
import '../design-system/styles/index.css';  // ANTES de './index.css'
import './index.css';
```

Trocar as fontes no `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

Rodar `npm run dev` e conferir `design-system/preview.html` no navegador antes de tocar em componente.

## Passo 1 — tabela de tradução de classes

| Classe legada | Substituir por | Observação |
|---|---|---|
| `.glass-card` | `.ds-card` | remove `backdrop-filter` e borda translúcida |
| `.glass-card-interactive` | `.ds-card .ds-card--interactive` | o brilho deslizante some |
| `.btn` | `.ds-btn` | remove `text-transform: uppercase` e `width: 100%` implícito |
| `.btn-primary` | `.ds-btn--primary` | gradiente roxo→rosa vira tinta sólida |
| `.btn-secondary` | `.ds-btn--secondary` | |
| `.badge` | `.ds-badge` | |
| `.badge-live` | `.ds-badge--live` | ciano com glow vira coral com pulso |
| `.badge-waiting` | `.ds-badge--scheduled` | |
| `.badge-success` | `.ds-badge--success` | |
| `.badge-ended` | `.ds-badge--done` | |
| `.input-field` | `.ds-input` (dentro de `.ds-field` com `.ds-label`) | label passa a ser obrigatório |
| `.container` | `.ds-container` | |
| `.header` | `.ds-topbar` | |
| `.main-grid` | `.ds-grid ds-grid--sidebar` | |
| `.logo-area` | texto em `.ds-title` | gradiente no texto sai |
| `.pulse-glow` | **remover** | glow é anti-padrão |
| `.pulse-scale` | só em `.ds-badge--live` | |
| `.slide-up` | `.ds-animate-in` | |

## Passo 2 — tabela de tradução de tokens

| Token legado | Novo token |
|---|---|
| `--bg-base` (220 18% 5%) | `--ds-surface-canvas` |
| `--bg-card` / `--bg-card-glass` | `--ds-surface-raised` |
| `--border-glass` | `--ds-border-default` |
| `--color-primary` (roxo #7C4DFF) | `--ds-surface-brand` (fundo) ou `--ds-text-brand` (texto) |
| `--color-secondary` (ciano) | `--ds-status-live-*` ou `--ds-chart-1` |
| `--color-accent` (magenta) | **sem equivalente** — reavaliar o uso caso a caso |
| `--color-text-main` | `--ds-text-primary` |
| `--color-text-muted` | `--ds-text-secondary` |
| `--color-success` | `--ds-text-success` / `--ds-status-success-bg` |
| `--color-warning` | `--ds-text-warning` / `--ds-status-scheduled-bg` |
| `--color-danger` | `--ds-text-danger` / `--ds-status-live-bg` |
| `--font-heading` | `--ds-font-display` |
| `--font-body` | `--ds-font-sans` |
| `--shadow-neon` / `--shadow-neon-cyan` | **excluir** |
| `--shadow-card` | `--ds-shadow-sm` |

## Passo 3 — ordem de migração (uma PR por linha)

1. `EventPortal.vue` — grid de cards, baixo risco, valida card + badge.
2. `ProductDetails.vue` + `StockProgress.vue` — valida stat, meter e tipografia.
3. `Countdown.vue` — valida `card--inverse` e a regra de urgência por cor.
4. `QueueStatus.vue` — o componente mais crítico; valida estados e `aria-live`.
5. `CheckoutModal.vue` — valida modal, foco e campos de formulário.
6. `SimulationPanel.vue` — ferramenta interna, migrar por último.
7. **Só então** apagar o que sobrou de `src/index.css`, deixando lá apenas o `@import` do sistema.

## Passo 4 — verificação

```bash
# 1. nenhum hex fora do design-system
grep -rnE "#[0-9a-fA-F]{3,8}" src/ --include=*.vue --include=*.css

# 2. nenhum resquício do tema antigo
grep -rn "glass-card\|pulse-glow\|shadow-neon\|backdrop-filter" src/

# 3. lint
npm run lint
```

Depois, manualmente: light + dark, 360px de largura, navegação inteira por teclado.

## Decisão pendente para o time

O produto nasceu escuro e a referência é clara. O sistema entrega os dois temas. **Recomendação:** tema claro como padrão (é o da referência, e checkout em fundo claro tem menos atrito de leitura), com alternância para escuro — o `data-theme` e `setTheme()`/`initTheme()` de `tokens/tokens.js` já suportam isso. Se o time preferir manter o escuro como padrão, basta `document.documentElement.setAttribute('data-theme', 'dark')` na inicialização; nenhum componente muda.
