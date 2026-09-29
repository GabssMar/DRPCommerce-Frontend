# Componente — Avatar / Avatar Group

**Classes:** `.ds-avatar`, `.ds-avatar-group`, `.ds-avatar__badge` · **Status:** estável

## Para que serve

Identificar uma pessoa. **P5 — pessoas antes de campos:** na referência, toda linha, card e etapa começa por um avatar. No DRPCommerce, representa quem está na fila.

## Tamanhos

| Modificador | px | Uso |
|---|---|---|
| `--sm` | 28 | dentro de linha de tabela, lista densa |
| — | 40 | padrão: card, header |
| `--lg` | 56 | perfil, confirmação de pedido |

Borda de 2px na cor da superfície (`--ds-surface-raised`) — é o que separa avatares sobrepostos.

## Anéis de estado

| Modificador | Significado |
|---|---|
| `--ring-live` | é a vez desta pessoa (coral) |
| `--ring-waiting` | aguardando (azul) |

## Badge numérico

`.ds-avatar__badge` no canto inferior direito, fundo tinta — na referência mostra a ordem/contagem. Aqui: **posição na fila**.

## Grupo

```vue
<div class="ds-avatar-group" aria-label="1.842 pessoas na fila">
  <span v-for="u in first" :key="u.id" class="ds-avatar" :title="u.name">
    <img v-if="u.photo" :src="u.photo" alt="" />
    <template v-else>{{ initials(u.name) }}</template>
  </span>
  <span class="ds-avatar" aria-hidden="true">+{{ rest }}</span>
</div>
```

Sobreposição de -10px. Máximo **5 visíveis** + contador. Hover levanta 2px.

## Fallback

Sem foto: iniciais (máx. 2 letras, maiúsculas) sobre `--ds-surface-sunken`. Nunca ícone genérico de pessoa em lista — vira ruído repetido.

## Acessibilidade

- Avatar decorativo (o nome está ao lado): `<img alt="">`.
- Avatar é a única identificação: `alt` com o nome.
- Grupo: `aria-label` com a contagem real; itens individuais `aria-hidden` se redundantes.
- Nunca use só cor de anel para indicar estado — acompanhe de badge ou texto.

## Não faça

- ❌ Avatar quadrado.
- ❌ Mais de 5 avatares empilhados.
- ❌ Carregar 1.842 fotos: renderize 5 e conte o resto.
