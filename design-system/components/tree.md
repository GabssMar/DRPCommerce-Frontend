# Componente — Tree

**Classe:** `.ds-tree` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Hierarquia de até três níveis em que o usuário navega, expande e age sobre cada nó: categorias do catálogo.

## Quando NÃO usar

Lista plana é `.ds-list`. Navegação entre telas é `.ds-nav`. Dados em colunas são `.ds-table`.

## Anatomia

```
ul.ds-tree[role=tree]                      dentro de .ds-card--flush
└── li.ds-tree__item[role=treeitem]        uma linha por nó visível (lista plana)
    ├── button.ds-tree__toggle             chevron; ausente em folha (.ds-tree__spacer)
    ├── span.ds-tree__label                nome + texto de apoio
    └── span.ds-tree__actions              badge de situação e botões da linha
```

A árvore é plana no DOM: o nível vem de `aria-level` e da classe `--level-N`, sem listas aninhadas.

## Variantes

| Modificador | Uso |
|---|---|
| `.ds-tree__item--level-2`, `--level-3` | recuo do nível (o primeiro não tem modificador) |
| `.ds-tree__item--inactive` | nó desativado: rótulo esmaecido, com badge "Inativa" ao lado |

## Tokens consumidos

| Propriedade | Token |
|---|---|
| hairline | `--ds-border-subtle` |
| recuo | `--ds-space-6` por nível |
| alvo mínimo | `--ds-tap-min` |
| nó selecionado | `--ds-surface-raised` |
| foco | `--ds-ring` |
| rótulo inativo | `--ds-text-secondary` |

## Estados

| Estado | Comportamento |
|---|---|
| hover | fundo `--ds-action-ghost-bg-hover` |
| focus-visible | `box-shadow: var(--ds-ring)` no item |
| selecionado | `aria-selected="true"`, fundo `--ds-surface-raised` |
| inativo | rótulo esmaecido e badge |

## Acessibilidade

- `role="tree"` no `ul`; `role="treeitem"` com `aria-level`, `aria-setsize`, `aria-posinset` e, em nó com filhos, `aria-expanded`.
- Um item só fica na ordem de tabulação (`tabindex="0"`); os demais têm `-1` (foco móvel).
- Teclado: ↓ e ↑ percorrem os nós visíveis; → expande ou entra no primeiro filho; ← recolhe ou volta ao pai; Home e End vão ao primeiro e ao último; Alt+↑ e Alt+↓ reordenam entre irmãos.
- Os botões da linha continuam alcançáveis pelo Tab e levam `aria-label` com o nome do nó.
- Contraste verificado: sim (rótulo inativo usa `--ds-text-secondary`, com o badge como segundo sinal).

## Uso

```vue
<ul class="ds-tree" role="tree" aria-label="Categorias">
  <li class="ds-tree__item" role="treeitem" aria-level="1" aria-expanded="true" tabindex="0">…</li>
</ul>
```

## Não faça

- ❌ Indicar "inativo" só pela cor: sempre badge junto.
- ❌ Aninhar `<ul>` para dar recuo: o recuo é da classe de nível.
- ❌ Mais de um item com `tabindex="0"`.
