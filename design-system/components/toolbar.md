# Componente — Toolbar

**Classe:** `.ds-toolbar` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Faixa de filtros acima de uma tabela do painel: busca à esquerda, filtros no meio, ações à direita.

## Quando NÃO usar

Ações da página (exportar, novo item) moram ao lado do `<h1>` (`patterns/app-shell.md`, regra 2), não na toolbar.

## Anatomia

```
.ds-toolbar
├── .ds-toolbar__search > input.ds-input[type=search]
├── .ds-nav | select.ds-input.ds-toolbar__filter   (0..n)
└── .ds-toolbar__actions                           (opcional)
```

## Regras

- **Todo filtro tem rótulo**: `<label class="ds-sr-only">` ou `aria-label`. Nunca só `placeholder`.
- Filtro de 2 a 4 opções exclusivas é `.ds-nav` (pílulas); mais que isso é `<select>`.
- Mudar um filtro volta a paginação para a página 1.

## Responsivo

Abaixo de 768px vira coluna: busca e selects em largura cheia, `.ds-nav` em linha rolável.

## Tokens consumidos

Só espaçamento (`--ds-space-2`, `--ds-space-3`) e `--ds-sidebar` como base da busca. Os controles trazem os próprios tokens.
