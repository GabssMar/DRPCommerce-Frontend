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
├── main.js               entrada: Design System, initTheme(), restaura sessão (modo http), monta o App
├── router.js             rotas por hash (#/conta, #/admin/pedidos…), sem Vue Router
├── App.vue               shell da loja; #/admin/* monta components/admin/AdminApp.vue
├── index.css             tema LEGADO (neon/glass) — em migração
├── components/
│   ├── *.vue             portal, detalhe do drop, fila, vitrine, sacola, StoreCheckout (C10)
│   ├── drop/             DropRegistration (C3) · DropWaitlist (C6)
│   ├── account/          AccountProfile (C11) · AccountOrders (C12) · AccountNotifications (C13)
│   ├── admin/            painel da loja (E1–E13), AdminApp é o shell com rail
│   └── ui/               StatusBadge · LoadState · PaginationNav · ModalDialog · StepsBar
├── composables/          useAsync/useAction (estados de carga) · useNow · useBag
└── services/
    ├── api.js            simulador antigo (portal, detalhe, vitrine) — sai nas tasks 15–18
    ├── http.js · auth.js · resources.js · client-api.js · admin-api.js · status.js · sales.js
    └── mock/             seed + servidor falso nas MESMAS rotas do back (VITE_API_MODE=mock)
design-system/            o Design System (docs + CSS + tokens)
```

Telas do design e rotas do back-end: `design-system/migration/tasks/TELAS-DESIGN.md`.
Nenhum componente chama `fetch`: tudo passa por `src/services/`.

O back-end fica em `../backend` (repositório separado).
