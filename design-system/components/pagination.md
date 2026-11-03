# Componente — Pagination

**Classe:** `.ds-pagination` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Navegar entre páginas de uma tabela longa do painel.

## Anatomia

```vue
<nav class="ds-pagination" aria-label="Paginação">
  <span class="ds-pagination__status" aria-live="polite">1–20 de 844</span>
  <button class="ds-icon-btn ds-icon-btn--ghost" :disabled="page === 1" aria-label="Página anterior">…</button>
  <button class="ds-icon-btn ds-icon-btn--ghost" :disabled="page === last" aria-label="Próxima página">…</button>
</nav>
```

## Regras

- Intervalo + total em texto, nunca uma régua de números.
- `aria-live="polite"` no status, para o leitor de tela anunciar a troca.
- Botão desabilitado nas pontas (`.ds-icon-btn:disabled`), alvo de 40px dentro de `.ds-table-footer`.
- Lista vazia: a paginação some e a tabela mostra `.ds-empty`.

## Tokens consumidos

`--ds-text-sm`, `--ds-text-secondary`; botões herdam `.ds-icon-btn`.
