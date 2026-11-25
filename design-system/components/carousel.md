# Componente — Carousel

**Classe:** `.ds-carousel` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Mostrar uma série de cartões do mesmo tipo numa única linha que rola na horizontal, com botões de anterior/próximo (planos na landing page).

## Quando NÃO usar

- Itens que precisam ser comparados todos de uma vez numa tela larga e cabem nela: `.ds-grid--3`.
- Navegação entre seções: `.ds-nav`. Não há rotação automática: o carrossel nunca anda sozinho.

## Anatomia

```
.ds-carousel
├── .ds-carousel__controls          (cluster no topo à direita)
│   └── .ds-icon-btn × 2            anterior / próximo (aria-label, disabled nas pontas)
└── .ds-carousel__track             <ul> com overflow-x e scroll-snap; role="region" + aria-label + tabindex="0"
    └── .ds-carousel__item × n      <li>, normalmente um .ds-card
```

## Comportamento

- A faixa rola com mouse/trackpad, toque e teclado (setas, com foco na faixa). Os botões rolam um item por vez.
- `scroll-snap-type: x mandatory` alinha cada item pelo começo.
- Os botões ficam `disabled` na primeira e na última posição.
- Rolagem suave só sem `prefers-reduced-motion` (o bloco global de `base.css` já força `scroll-behavior: auto`).
- Itens com largura fixa entre 240px e 280px: em telas largas vários aparecem lado a lado; a 360px aparece um e o próximo espia na borda.
- `padding-block` na faixa evita cortar a sombra dos cartões.

## Tokens consumidos

| Propriedade | Token |
|---|---|
| espaço entre itens | `--ds-space-4` |
| folga para a sombra | `--ds-space-2`, `--ds-space-6` |
| foco da faixa | `--ds-ring`, `--ds-radius-xl` |

## Acessibilidade

- Faixa com `role="region"`, `aria-label` e `tabindex="0"` (rolável pelo teclado).
- Botões com `aria-label` ("Planos anteriores" / "Próximos planos") e `aria-controls` apontando para a faixa.
- Ordem do DOM = ordem visual; nada é escondido de leitor de tela.
