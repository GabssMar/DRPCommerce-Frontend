# Componente — Tile

**Classe:** `.ds-tile` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Bloco rebaixado com rótulo e valor, dentro de um card: passos de "como funciona", contagem de pedidos por status, contadores pequenos.

## Quando NÃO usar

KPI de página é `.ds-card` + `.ds-stat`. Nada clicável: tile não tem estado de hover nem foco.

## Anatomia

```
.ds-tile
├── .ds-label-caps | .ds-text-xs      rótulo
└── .ds-tile__value | <strong>        valor
```

## Variantes

| Modificador | Uso |
|---|---|
| `--inverse` | o item em foco do grupo (etapa atual, status mais volumoso) |
| `--excluded` | valor que não entra na soma (cancelado, reembolsado): contorno tracejado |

## Tokens consumidos

| Propriedade | Token |
|---|---|
| fundo | `--ds-surface-sunken` / `--ds-surface-inverse` |
| contorno (`--excluded`) | `--ds-border-strong` |
| raio | `--ds-radius-lg` |
| valor | `--ds-font-display`, `--ds-text-2xl` |

## Composição

Agrupe em `.ds-grid--tiles` (colunas iguais que quebram) ou `.ds-grid--kpi`. O hint abaixo do grupo explica o que `--excluded` significa.
