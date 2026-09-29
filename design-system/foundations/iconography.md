# Foundation — Iconografia

## Biblioteca

**`@lucide/vue`** (já instalado). Não adicione outra biblioteca de ícones, não cole SVG avulso, não use emoji como ícone de interface.

```js
import { Clock, Users, ShoppingBag } from '@lucide/vue';
```

## Tamanhos e traço

| Contexto | `:size` | `:stroke-width` |
|---|---|---|
| Dentro de texto / badge | 14 | 1.5 |
| Botão, input, item de lista | 18 | 1.5 |
| Botão de ícone, nav | 20 | 1.5 |
| Estado vazio, destaque | 24–32 | 1.5 |

`strokeWidth: 1.5` em todo o sistema — o traço fino é parte da identidade (a referência usa ícones outline leves em botões circulares). Nunca preencha (`fill`) um ícone lucide.

## Cor

Ícone herda `currentColor`. Não passe `color` como prop; controle pela cor do elemento pai.

```vue
<!-- ✅ -->
<button class="ds-icon-btn"><Clock :size="20" :stroke-width="1.5" /></button>

<!-- ❌ -->
<Clock color="#83A2DB" />
```

Ícone funcional sozinho (sem rótulo) precisa de ≥ 3:1 de contraste: use `--ds-text-secondary`, nunca `--ds-text-tertiary`.

## Acessibilidade

```vue
<!-- Decorativo (há texto ao lado) -->
<Clock :size="16" aria-hidden="true" />

<!-- Único conteúdo do controle -->
<button class="ds-icon-btn" aria-label="Atualizar fila">
  <RefreshCw :size="20" aria-hidden="true" />
</button>
```

Botão só de ícone **sempre** tem `aria-label`.

## Vocabulário do domínio (use sempre o mesmo ícone para o mesmo conceito)

| Conceito | Ícone lucide |
|---|---|
| Fila / posição | `Users` |
| Tempo restante / countdown | `Clock` ou `Hourglass` |
| Estoque | `Package` |
| Drop ao vivo | `Radio` |
| Checkout / carrinho | `ShoppingBag` |
| Pedido confirmado | `CheckCircle2` |
| Erro / bloqueio | `AlertCircle` |
| Prioridade / destaque | `Zap` |
| Atualizar | `RefreshCw` |
| Voltar | `ArrowLeft` |

Antes de escolher um ícone novo, cheque esta tabela e o uso existente em `src/components/`.
