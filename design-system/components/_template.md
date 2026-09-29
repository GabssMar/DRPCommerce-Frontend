# Componente — <Nome>

> Copie este arquivo ao criar um componente novo. Preencha **antes** de escrever CSS.

**Classe:** `.ds-<nome>` · **CSS:** `../styles/components.css` · **Status:** rascunho | estável

## Para que serve

Uma frase. Se precisar de duas, provavelmente são dois componentes.

## Quando NÃO usar

O caso vizinho e qual componente usar no lugar.

## Anatomia

```
.ds-<nome>
├── .ds-<nome>__<elemento>
└── .ds-<nome>__<elemento>
```

## Variantes

| Modificador | Uso |
|---|---|
| `--<variante>` | |

## Tokens consumidos

| Propriedade | Token |
|---|---|
| fundo | `--ds-surface-…` |
| texto | `--ds-text-…` |
| raio | `--ds-radius-…` |

## Estados

| Estado | Comportamento |
|---|---|
| hover | |
| active | |
| focus-visible | `box-shadow: var(--ds-ring)` |
| disabled | `opacity: .45`, `cursor: not-allowed` |
| loading | |
| erro | |

## Acessibilidade

- Papel/ARIA:
- Navegação por teclado:
- Contraste verificado: sim/não

## Uso

```vue
```

## Não faça

- ❌
