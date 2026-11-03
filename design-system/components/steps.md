# Componente — Steps

**Classe:** `.ds-steps` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Mostrar em que ponto de uma sequência linear o usuário está: fases do drop, andamento do pedido, etapas do checkout.

## Quando NÃO usar

Progresso numérico (estoque, uso de cupom) é `.ds-progress` / `.ds-meter`. Navegação entre seções é `.ds-nav`.

## Anatomia

```
ol.ds-steps
└── li.ds-steps__item (--done | --current)
    ├── span.ds-steps__bar
    ├── span.ds-steps__label
    └── span.ds-steps__meta      (opcional: data/hora)
```

## Variantes

| Modificador | Uso |
|---|---|
| `__item--done` | etapa concluída: barra tinta, rótulo em peso médio |
| `__item--current` | etapa atual: barra de marca |
| (nenhum) | etapa futura: barra no trilho |

## Tokens consumidos

| Propriedade | Token |
|---|---|
| barra futura | `--ds-chart-track` |
| barra concluída | `--ds-surface-inverse` |
| barra atual | `--ds-surface-brand` |
| rótulo | `--ds-text-secondary` / `--ds-text-primary` |

## Acessibilidade

- `<ol aria-label="…">`; a etapa atual recebe `aria-current="step"`.
- O estado nunca depende só da cor: a etapa atual tem rótulo em peso médio e, quando houver, a data em `__meta`.

## Responsivo

Colunas de no mínimo `--ds-space-20`; com 7 etapas em 360px, a faixa rola na horizontal dentro do próprio `<ol>`.
