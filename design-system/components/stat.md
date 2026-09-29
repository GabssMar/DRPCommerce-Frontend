# Componente — Stat (KPI)

**Classe:** `.ds-stat` · **Status:** estável

## Para que serve

Exibir **um** número que importa, com unidade e rótulo. É o padrão mais repetido da referência (`134 hrs.` / `12,310 $` / `5 Team members`).

## Anatomia

```
.ds-stat
├── .ds-stat__value      número (display, tinta)
│   └── .ds-stat__unit   unidade (xs, cinza, alinhada à baseline)
└── .ds-stat__label      rótulo (xs, cinza)
```

Ordem fixa: **número primeiro, rótulo depois.** O olho encontra o dado antes da explicação.

## Variantes

| Modificador | Uso |
|---|---|
| — | 24px — dentro de card com outros elementos |
| `--lg` | 36px — o número principal da tela (posição na fila, countdown) |
| `--critical` | valor em `--ds-text-danger` — estoque baixo, tempo expirando |

`.ds-stat-grid` monta a linha de KPIs (auto-fit, mín. 120px).

## Tokens

| Propriedade | Token |
|---|---|
| valor | `--ds-font-display`, `--ds-text-3xl`/`5xl`, peso 500, `--ds-tracking-tight` |
| unidade | `--ds-text-xs`, `--ds-text-secondary` |
| rótulo | `--ds-text-xs`, `--ds-text-secondary` |

## Regras

1. Um stat = um número. Comparação/variação é outro elemento (badge ou texto ao lado).
2. Números sempre formatados por localidade: `new Intl.NumberFormat('pt-BR')`.
3. `tabular-nums` obrigatório em valor que atualiza (já é padrão global) — sem isso o layout treme.
4. Valor ausente é `—`, nunca `0` nem vazio.
5. Carregando: `.ds-skeleton` com a **mesma altura** do valor final.

## Uso

```vue
<div class="ds-stat-grid">
  <div class="ds-stat">
    <div class="ds-stat__value">
      {{ formatNumber(position) }}<span class="ds-stat__unit">º</span>
    </div>
    <div class="ds-stat__label">Sua posição</div>
  </div>

  <div class="ds-stat ds-stat--critical">
    <div class="ds-stat__value">
      {{ stock }}<span class="ds-stat__unit">un.</span>
    </div>
    <div class="ds-stat__label">Estoque restante</div>
  </div>
</div>
```

## Não faça

- ❌ Rótulo do mesmo tamanho/cor do valor.
- ❌ Unidade grudada no número sem `--ds-space-1`.
- ❌ Mais de 4 stats na mesma linha.
- ❌ Animar a contagem em dado crítico (posição na fila) — confunde com mudança real.
