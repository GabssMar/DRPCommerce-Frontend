# Componente — Navegação (Topbar, Nav pill, Rail)

**Classes:** `.ds-topbar`, `.ds-nav`, `.ds-nav__item`, `.ds-topbar__brand`, `.ds-rail`, `.ds-skip-link` · **Status:** estável

## A assinatura: pill de tinta

O item ativo é uma **pill quase-preta** com texto branco. Nunca sublinhado, nunca borda inferior, nunca texto colorido. É o padrão mais reconhecível da referência.

```vue
<nav class="ds-nav" aria-label="Principal">
  <a class="ds-nav__item" href="/drops">Drops</a>
  <a class="ds-nav__item" href="/fila" aria-current="page">Minha fila</a>
  <a class="ds-nav__item" href="/pedidos">Pedidos</a>
</nav>
```

`aria-current="page"` **é** o seletor do estado ativo — não precisa de classe extra (`--active` existe só para casos sem roteador).

## Topbar

Altura `--ds-topbar` (64px). Esquerda: marca. Centro: `.ds-nav`. Direita: `.ds-icon-btn` (busca, notificações) + avatar.

A marca usa `.ds-topbar__brand` (display, peso 500, sem gradiente, não quebra linha, alvo ≥ 44px). Pode ser `<a>` ou `<button>`; o ícone vai com `aria-hidden="true"`. Em telas estreitas a topbar quebra: marca na primeira linha, ações na segunda.

```vue
<header class="ds-topbar ds-container">
  <button type="button" class="ds-topbar__brand" @click="goHome">
    <Layers :size="24" :stroke-width="1.5" aria-hidden="true" />
    VELOCE // LABS
  </button>
  <span class="ds-badge ds-badge--inverse">Simulação</span>
</header>
```

Em telas de drop ao vivo, a topbar é o lugar do countdown global + `.ds-badge--live`.

## Rail de ícones

Coluna de 72px com `.ds-icon-btn--ghost` de 40px empilhados (`--ds-space-3`). Só ícone, sempre com `aria-label`. Some abaixo de 768px — no mobile use uma tab bar inferior ou menu.

## Regras

1. Máximo 6 itens de navegação primária.
2. Rótulos são substantivos do domínio ("Drops", "Fila", "Pedidos"), nunca verbos.
3. Um único item com `aria-current` por vez.
4. `<nav aria-label="...">` distinto para cada navegação da página.
5. Skip link como primeiro elemento focável. `.ds-skip-link` fica fora da tela e aparece (pill de tinta, com `--ds-ring`) quando recebe foco pelo teclado. **Não use `.ds-sr-only`** para isso: ele não tem estado de foco, e o link continuaria invisível para quem navega por teclado.

```vue
<a href="#main" class="ds-skip-link">Pular para o conteúdo</a>
<!-- … -->
<main id="main" tabindex="-1">…</main>
```

   O `tabindex="-1"` no `<main>` faz o foco realmente entrar no conteúdo ao ativar o link.

6. Estado ativo não pode depender só de cor — a pill muda fundo **e** peso/contraste.

## Mobile

- Rail some; navegação vira tab bar inferior fixa com `--ds-tap-min` de alvo.
- A topbar pode virar sticky com o countdown, que é a informação mais volátil da tela.
