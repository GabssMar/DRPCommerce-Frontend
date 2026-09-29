# Foundation — Movimento

> Movimento existe para explicar uma mudança de estado. Se a animação não responde "o que mudou e de onde veio", remova.

## Durações

| Token | ms | Uso |
|---|---|---|
| `--ds-duration-instant` | 80 | feedback de `:active` |
| `--ds-duration-fast` | 120 | hover de cor, foco |
| `--ds-duration-base` | 180 | **padrão** — sombra, transform pequeno |
| `--ds-duration-slow` | 240 | entrada de modal, barra de progresso |
| `--ds-duration-slower` | 320 | entrada de página/lista |

Nada acima de 320ms em interface transacional. Em fila e checkout, lentidão parece travamento.

## Easings

| Token | Curva | Uso |
|---|---|---|
| `--ds-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | padrão para tudo |
| `--ds-ease-entrance` | `cubic-bezier(0.16, 1, 0.3, 1)` | elemento entrando na tela |
| `--ds-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | elemento saindo |

## Propriedades permitidas

Só anime `transform`, `opacity`, `background-color`, `color`, `border-color`, `box-shadow`. **Nunca** `width`, `height`, `top`, `left`, `margin` (causam layout thrashing).

Exceção autorizada: `width` em barra de progresso e `stroke-dasharray` em donut — são o próprio dado se movendo.

## Amplitudes

- Hover de card: `translateY(-2px)`
- `:active`: `translateY(1px)`
- Entrada de lista: `translateY(8px) → 0` com fade
- Entrada de modal: `translateY(12px) scale(0.98) → 1`
- Nada acima de 12px de deslocamento.

## Animação contínua — só com semântica

A única animação em loop permitida por padrão é o pulso do `.ds-badge--live` (ponto de "ao vivo"). Loop decorativo (shimmer de marca, glow pulsante, gradiente animado) é anti-padrão.

Exceções aceitas por serem informativas: `.ds-skeleton` (carregando) e `.ds-spinner` (processando).

## Movimento reduzido

`base.css` já neutraliza animações sob `prefers-reduced-motion: reduce`. Se você criar animação inline em JS, respeite a preferência manualmente:

```js
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

## Caso especial: countdown

O countdown do drop é dado, não animação. Atualize o texto, não anime o número. Abaixo de 60s, troque o `.ds-badge` para `--live` e o valor para `--ds-text-danger` — a mudança de **cor** comunica a urgência, não o movimento.
