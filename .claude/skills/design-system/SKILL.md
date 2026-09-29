---
name: design-system
description: Regras e tokens do Design System do DRPCommerce (derivado do Stratus CRM). Use SEMPRE antes de criar ou alterar qualquer UI neste front-end — componente Vue, CSS, tela, cor, espaçamento, tipografia, badge, botão, card, modal, tabela, gráfico ou tema claro/escuro. Também ao revisar UI ou migrar o CSS legado neon/glass.
---

# Design System — DRPCommerce

Este front-end tem um design system completo em `design-system/`. **Não invente estilo: consulte.**

## Ordem de leitura

1. `design-system/CLAUDE.md` — o contrato (regras R1–R8, anti-padrões, checklist).
2. `design-system/tokens/tokens.css` — todos os tokens disponíveis.
3. A spec do que você vai construir, em `design-system/components/<nome>.md`.
4. Se é uma tela inteira: `design-system/patterns/`.

## As cinco regras que mais são quebradas

1. **Nada de hex, px de espaço ou sombra literal em componente.** Só `var(--ds-*)`. Falta token? Crie em `tokens/tokens.json` e replique em `tokens.css` (e `tokens.js` se for usado em gráfico).
2. **Azul de marca `#83A2DB` é superfície, nunca texto** (2.58:1 sobre branco). Texto/link de marca = `--ds-text-brand` (#4A6FB5).
3. **Botão primário é tinta**, não azul: `.ds-btn--primary`. Um por tela.
4. **Light e dark sempre juntos.** Token só no `:root` está incompleto.
5. **Sem glow, glass, gradiente de marca ou sombra colorida.** O tema legado em `src/index.css` tem tudo isso e está em migração — não copie dele.

## Classes prontas (não reescreva)

`ds-card` (+`--inverse --brand --flush --tight --outlined --sunken --interactive`) ·
`ds-btn` (+`--primary --secondary --ghost --brand --danger --sm --lg --block --pill`) ·
`ds-icon-btn` · `ds-badge` (+`--live --waiting --scheduled --done --success`) ·
`ds-field/ds-label/ds-input/ds-hint/ds-error` · `ds-stat` (+`--lg --critical`) · `ds-stat-grid` ·
`ds-meter` · `ds-progress` · `ds-donut` · `ds-avatar` / `ds-avatar-group` · `ds-table` ·
`ds-overlay/ds-modal` · `ds-nav/ds-topbar/ds-topbar__brand/ds-rail/ds-skip-link` · `ds-skeleton/ds-spinner/ds-empty/ds-divider` ·
utilitários `ds-app ds-page ds-shell ds-container ds-stack--N ds-cluster ds-grid--2|3|sidebar ds-sr-only`.

## Checklist antes de concluir

- [ ] Zero literais de cor/espaço/raio
- [ ] Tokens semânticos (não primitivos) no componente
- [ ] Light e dark conferidos
- [ ] `:focus-visible` com `--ds-ring`; alvo ≥ 44px
- [ ] Contraste ≥ 4.5:1 em texto
- [ ] Funciona em 360px sem scroll horizontal
- [ ] Estados de carregando / vazio / erro tratados (`patterns/states.md`)
- [ ] Spec em `components/` criada ou atualizada se o componente é novo

## Contexto do domínio

Drop com fila prioritária: coral = urgência (ao vivo, expirando, estoque baixo), azul = espera normal,
âmbar = agendado, cinza = encerrado, verde = pedido confirmado. O mapa completo de estados da tela de drop
está em `design-system/patterns/drop-page.md`.
