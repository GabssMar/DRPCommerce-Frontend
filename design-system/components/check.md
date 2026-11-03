# Componente — Check

**Classe:** `.ds-check`, `.ds-checkbox` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Checkbox e radio nativos com rótulo clicável e alvo ≥ 44px (canais de aviso, aceite de regras, modalidade de frete).

## Anatomia

```vue
<label class="ds-check">
  <input type="checkbox" v-model="…">
  <span>E-mail</span>
</label>

<!-- Checkbox solto (célula de tabela): -->
<input class="ds-checkbox" type="checkbox" aria-label="Selecionar Ana R.">
```

## Variantes

| Modificador | Uso |
|---|---|
| `--pill` | opção avulsa em fundo rebaixado (flags do drop) |
| `--card` | opção com valor à direita (frete); a marcada ganha `--ds-ring` |
| `--top` | texto longo de várias linhas (aceite de regras) |

## Regras

- Sempre `<input>` nativo: o navegador cuida de teclado e leitor de tela. Cor via `accent-color: --ds-action-primary-bg`.
- Desabilitado: o rótulo inteiro fica a 55% de opacidade e o motivo aparece num `.ds-hint`.
- Grupo de opções: `<fieldset>` com `<legend class="ds-label">`.
