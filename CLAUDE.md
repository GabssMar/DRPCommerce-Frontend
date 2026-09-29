# DRPCommerce — Frontend

Vue 3 (Composition API, `<script setup>`) + Vite 8, JavaScript (sem TypeScript), CSS puro com custom properties.
Ícones: `@lucide/vue`. Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, sem bloco `<style>` nos `.vue`.

## Antes de qualquer trabalho de UI

**Leia [`design-system/CLAUDE.md`](./design-system/CLAUDE.md).** É o contrato do Design System:
tokens, componentes, anti-padrões e checklist. Nada de UI é escrito sem ele.

Atalhos:

| Preciso de… | Arquivo |
|---|---|
| Tokens (cor, espaço, raio, sombra) | `design-system/tokens/tokens.css` |
| Spec de um componente | `design-system/components/<nome>.md` |
| Montar uma tela | `design-system/patterns/` |
| Entender de onde veio o visual | `design-system/ANALYSIS.md` |
| Refatorar o CSS legado | `design-system/migration/from-neon-glass.md` |
| Ver renderizado | abra `design-system/preview.html` |

## Regras rápidas

- Nunca hex/px/sombra literal em componente — só `var(--ds-*)`.
- Azul de marca é superfície; texto de marca é `--ds-text-brand`.
- Botão primário é tinta (`.ds-btn--primary`), não azul.
- Todo interativo tem `:focus-visible` com `--ds-ring` e alvo ≥ 44px.
- Light e dark sempre juntos.

## Comandos

```bash
npm install
npm run dev      # Vite
npm run build
npm run lint     # ESLint
```

Commits seguem Conventional Commits (validado por commitlint + husky).

## Estrutura

```
src/
├── main.js               entrada: importa o Design System, initTheme(), monta o App
├── App.vue               roteamento por estado (portal ↔ detalhe do drop)
├── index.css             tema LEGADO (neon/glass) — em migração
├── components/           (.vue) Countdown · QueueStatus · StockProgress ·
│                         ProductDetails · CheckoutModal · EventPortal · SimulationPanel
└── services/api.js       cliente HTTP + simulação de tempo virtual
design-system/            o Design System (docs + CSS + tokens)
```

O back-end fica em `../backend` (repositório separado).
