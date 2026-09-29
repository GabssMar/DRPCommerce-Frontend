# Componente — Button

**Classe:** `.ds-btn` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Disparar uma ação. Se navega para outra página, é `<a>` com `.ds-btn` — nunca `<div onClick>`.

## A regra central (P4)

**A ação primária é tinta (quase-preto), não azul.** Isso vem direto da referência (pill de nav ativa, FAB, botão de confirmar) e resolve contraste: 14.45:1 contra os 2.58:1 do azul de marca.

Uma tela tem **um** `--primary`. Se houver dois, um deles é `--secondary`.

## Variantes

| Modificador | Uso | Fundo |
|---|---|---|
| `--primary` | ação principal: "Entrar na fila", "Finalizar compra" | tinta |
| `--secondary` | ação alternativa: "Voltar", "Cancelar" | branco + borda |
| `--ghost` | ação terciária, barra de ferramentas | transparente |
| `--brand` | CTA sobre superfície escura/colorida onde a tinta sumiria | azul-600 |
| `--danger` | ação destrutiva: "Sair da fila", "Cancelar pedido" | coral-600 |

Tamanho: `--sm` (36px) · padrão (44px) · `--lg` (52px, CTA de checkout) · `--block` (largura total) · `--pill`.

Botão só de ícone: use `.ds-icon-btn` (circular, 40px) — variantes `--solid`, `--ghost`, `--lg` (FAB 56px).

## Tokens

| Propriedade | Token |
|---|---|
| fundo | `--ds-action-<variante>-bg` |
| texto | `--ds-action-primary-fg` / `--ds-action-secondary-fg` |
| raio | `--ds-radius-md` (`--lg` usa `--ds-radius-lg`) |
| altura mín. | `--ds-tap-min` (44px) |
| foco | `--ds-ring` |
| transição | `--ds-duration-fast` + `--ds-ease-standard` |

## Estados

| Estado | Comportamento |
|---|---|
| hover | fundo → `-bg-hover`. Sem crescer, sem brilhar. |
| active | `translateY(1px)` + `-bg-active` |
| focus-visible | `box-shadow: var(--ds-ring)`, sem outline |
| disabled | `opacity: .45`, sem transform, `cursor: not-allowed` |
| loading | `<span class="ds-spinner">` + `aria-busy="true"`, **mantém a largura** e o rótulo |

## Acessibilidade

- `<button type="button">` por padrão; `type="submit"` só dentro de form.
- Só ícone ⇒ `aria-label` obrigatório.
- Desabilitado por regra de negócio (fila fechada): prefira `aria-disabled="true"` + explicação visível a `disabled` mudo.
- Nunca remova o foco sem substituir por `--ds-ring`.

## Uso

```vue
<script setup>
import { ShoppingBag } from '@lucide/vue';
</script>

<button class="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" @click="onCheckout">
  <ShoppingBag class="ds-btn__icon" aria-hidden="true" />
  Finalizar compra
</button>

<button class="ds-btn ds-btn--secondary" @click="onBack">Voltar</button>

<button class="ds-btn ds-btn--primary" aria-busy="true" disabled>
  <span class="ds-spinner" aria-hidden="true" /> Processando
</button>
```

## Não faça

- ❌ Gradiente, glow ou `text-transform: uppercase` (o tema legado fazia os três).
- ❌ Azul `--ds-blue-400` como fundo de botão — reprova contraste.
- ❌ Dois `--primary` na mesma tela.
- ❌ Rótulo genérico ("OK", "Enviar"). Use o verbo da ação: "Entrar na fila".
- ❌ Trocar o rótulo por um spinner (o botão encolhe e a tela pula).
