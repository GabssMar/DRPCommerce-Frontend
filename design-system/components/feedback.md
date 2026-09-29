# Componentes — Skeleton, Spinner, Empty, Divider

**Classes:** `.ds-skeleton`, `.ds-spinner`, `.ds-empty`, `.ds-divider` · **Status:** estável

## Skeleton (`.ds-skeleton`)

Carregamento de conteúdo com forma previsível. O skeleton deve ter **as mesmas dimensões** do conteúdo final — senão a tela pula quando o dado chega.

```vue
<div class="ds-card">
  <div class="ds-stack--3">
    <div class="ds-skeleton ds-skeleton--text ds-skeleton--short" />
    <div class="ds-skeleton ds-skeleton--title" />
  </div>
</div>
```

Use skeleton quando a espera é curta e a estrutura é conhecida. Para espera indeterminada, use spinner.

Formas prontas, para o skeleton ter a altura do conteúdo final **sem estilo inline**:

| Classe | Forma |
|---|---|
| `.ds-skeleton--title` | altura `--ds-space-6`, 70% da largura |
| `.ds-skeleton--text` | altura `--ds-space-4`, largura total |
| `.ds-skeleton--short` | combina com `--text`: 40% da largura |
| `.ds-card__media` + `.ds-skeleton` | imagem 16:10 do card |

```vue
<article class="ds-card ds-stack--4" aria-hidden="true">
  <div class="ds-card__media ds-skeleton" />
  <div class="ds-skeleton ds-skeleton--title" />
  <div class="ds-skeleton ds-skeleton--text" />
  <div class="ds-skeleton ds-skeleton--text ds-skeleton--short" />
</article>
```

## Spinner (`.ds-spinner`)

18px, herda `currentColor`. Dentro de botão, ao lado do rótulo (nunca no lugar dele).

```vue
<button class="ds-btn ds-btn--primary" aria-busy="true" disabled>
  <span class="ds-spinner" aria-hidden="true" /> Entrando na fila
</button>
```

Acima de ~10s, troque por mensagem de progresso com texto — spinner infinito parece travamento.

## Empty (`.ds-empty`)

Estado vazio = ícone + frase + ação. Nunca só "Nenhum resultado".

```vue
<div class="ds-empty">
  <Package :size="32" :stroke-width="1.5" aria-hidden="true" />
  <p>Nenhum drop ativo agora.</p>
  <button class="ds-btn ds-btn--secondary ds-btn--sm">Ver próximos drops</button>
</div>
```

Três sabores: **vazio** (nunca teve dado), **sem resultado** (filtro), **erro** (falhou). Textos diferentes para cada um — ver `../patterns/states.md`.

## Divider (`.ds-divider`)

Hairline de 1px em `--ds-border-subtle`. Use com parcimônia: espaço separa melhor que linha. Nunca divider entre cards (o gap já separa).

## Regra de anúncio

Mudança de estado assíncrona precisa ser anunciada:

```vue
<div aria-live="polite" aria-atomic="true">
  {{ loading ? 'Carregando fila…' : `Sua posição: ${position}` }}
</div>
```

Use `aria-live="assertive"` só para erro bloqueante ou "é a sua vez" — é interrupção.
