# Componente — Table

**Classe:** `.ds-table` · **Status:** estável

## Padrão da referência

Sem zebra. Separação por **hairline** (`--ds-border-subtle`). Cabeçalho em 12px cinza, peso 500 — não maiúsculas, não negrito. Linha inteira ganha `--ds-surface-sunken` no hover. Primeira coluna frequentemente começa por avatar ou ícone.

## Estrutura

```vue
<div class="ds-card ds-card--flush">
  <table class="ds-table">
    <caption class="ds-sr-only">Pedidos do drop</caption>
    <thead>
      <tr>
        <th scope="col">Produto</th>
        <th scope="col">Status</th>
        <th scope="col" class="ds-table__th--numeric">Valor</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="ds-cluster ds-cluster--2">
            <span class="ds-avatar ds-avatar--sm"><img :src="p.img" alt="" /></span>
            {{ p.name }}
          </div>
        </td>
        <td><span class="ds-badge ds-badge--success">Confirmado</span></td>
        <td class="ds-table__td--numeric">{{ formatBRL(p.price) }}</td>
      </tr>
    </tbody>
  </table>
</div>
```

Sempre dentro de `.ds-card--flush` — o card dá o raio e a sombra, a tabela preenche a borda.

## Regras

1. Números à direita com `tabular-nums` (`--numeric`). Texto à esquerda. Nunca centralizado.
2. Status em `.ds-badge`, nunca texto colorido solto.
3. Data em formato absoluto curto (`01/10 14:32`); relativo (`há 3 min`) só para eventos recentes.
4. Coluna de ações à direita, com `.ds-icon-btn--ghost`.
5. Máximo 6 colunas no desktop. No mobile (< 768px), **vire cards** — não force scroll horizontal:

```vue
<template v-if="isMobile">
  <OrderCard v-for="i in items" :key="i.id" v-bind="i" />
</template>
<table v-else class="ds-table">…</table>
```

6. Truncar com `text-overflow: ellipsis` + `title` completo; nunca quebrar em 3 linhas.
7. Ordenação: `aria-sort` no `<th>` + ícone de direção.

## Estados

| Estado | Tratamento |
|---|---|
| carregando | 3–5 linhas de `.ds-skeleton` com a mesma altura de linha |
| vazio | `.ds-empty` dentro do card, com ação sugerida |
| erro | `.ds-empty` + texto em `--ds-text-danger` + botão "Tentar de novo" |

## Acessibilidade

- `<th scope="col">` obrigatório; `scope="row"` quando a primeira coluna identifica a linha.
- `<caption>` (pode ser `.ds-sr-only`) descrevendo a tabela.
- Linha clicável: coloque o link na célula principal, não `onClick` na `<tr>`.
