# Componente — Badge / Status

**Classe:** `.ds-badge` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Comunicar o **estado** de um objeto (drop, fila, pedido) em uma pill compacta. Cor = significado (P2).

## Quando NÃO usar

- Para rotular categoria sem estado → use `.ds-label-caps`.
- Para contar itens → use `.ds-avatar__badge` ou texto.
- Para ação clicável → é botão (`.ds-btn--pill`), não badge.

## Variantes (mapeadas ao domínio)

| Modificador | Cor | Significado | Exemplo de rótulo |
|---|---|---|---|
| `--live` | coral | acontecendo agora / crítico | "AO VIVO", "Últimas unidades" |
| `--waiting` | azul | em espera, dentro do esperado | "Na fila", "Aguardando" |
| `--scheduled` | âmbar | futuro, ainda não aberto | "Em breve", "Agendado" |
| `--done` | cinza | encerrado, neutro | "Encerrado", "Esgotado" |
| `--success` | verde | concluído com êxito | "Pedido confirmado" |
| `--inverse` | tinta | destaque neutro forte | "Prioritário" |

Só `--live` anima (pulso do ponto, 1.6s). Nenhuma outra variante anima.

## Anatomia

```
.ds-badge.ds-badge--live
├── .ds-badge__dot      (opcional; herda currentColor)
└── texto
```

## Tokens

| Propriedade | Token |
|---|---|
| fundo | `--ds-status-<estado>-bg` |
| texto | `--ds-status-<estado>-fg` |
| raio | `--ds-radius-pill` |
| tamanho | `--ds-text-xs` / peso 500 |

Os pares `bg`/`fg` já foram verificados para ≥ 4.5:1. **Não misture** bg de um estado com fg de outro.

## Acessibilidade

- O texto carrega o significado; a cor apenas reforça (nunca badge só de cor).
- Estado que muda sozinho (fila → sua vez) deve viver numa região `aria-live="polite"`.
- Não use `title` como única explicação.

## Uso

```vue
<span class="ds-badge ds-badge--live">
  <span class="ds-badge__dot" aria-hidden="true" />
  AO VIVO
</span>

<div aria-live="polite">
  <span class="ds-badge ds-badge--success">Pedido confirmado</span>
</div>
```

## Mapa de estados do drop (use exatamente este)

| Estado do sistema | Badge |
|---|---|
| `dropEndsAt` no futuro e fila aberta | `--live` "AO VIVO" |
| fila aberta, usuário aguardando | `--waiting` "Na fila · posição N" |
| `queueOpensAt` no futuro | `--scheduled` "Abre em HH:MM" |
| `dropEndsAt` no passado | `--done` "Encerrado" |
| estoque 0 | `--done` "Esgotado" |
| pedido criado | `--success` "Pedido confirmado" |
| janela de checkout < 60s | `--live` "Expira em MM:SS" |

## Não faça

- ❌ Mais de 2 badges no mesmo card.
- ❌ `--live` como enfeite de marca.
- ❌ Badge com mais de 3 palavras.
