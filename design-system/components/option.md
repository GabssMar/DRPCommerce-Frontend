# Componente — Option

**Classe:** `.ds-option`, `.ds-option-group` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Escolher um valor de uma opção de produto (tamanho, cor) no detalhe da vitrine. Implementado em `src/components/ui/VariantPicker.vue`.

## Quando NÃO usar

- Filtro de lista: `.ds-nav` (pílulas) ou `<select>` na `.ds-toolbar`.
- Escolha com texto longo ou valor à direita (frete): `.ds-check--card`.

## Anatomia

```
fieldset
├── legend.ds-label                 nome da opção ("Tamanho")
└── .ds-option-group[role=group]
    └── button.ds-option[aria-pressed]   (1..n)
```

## Tokens consumidos

| Propriedade | Token |
|---|---|
| fundo | `--ds-surface-raised` · escolhida `--ds-surface-inverse` · active `--ds-surface-sunken` |
| texto | `--ds-text-primary` · escolhida `--ds-text-inverse` · indisponível `--ds-text-tertiary` |
| borda | `--ds-border-default` · hover `--ds-border-strong` |
| raio | `--ds-radius-md` |
| alvo | `--ds-tap-min` (largura e altura mínimas) |

## Estados

| Estado | Comportamento |
|---|---|
| hover | borda `--ds-border-strong` |
| active | fundo `--ds-surface-sunken` |
| focus-visible | `box-shadow: var(--ds-ring)` |
| escolhida | `aria-pressed="true"`: fundo tinta, texto invertido |
| indisponível | `aria-disabled="true"` + motivo no `title` ("Esgotado", "Combinação indisponível"): borda tracejada, texto riscado, clique ignorado |

## Acessibilidade

- Botões nativos com `aria-pressed`; o grupo tem `role="group"` e o `fieldset` dá o nome pelo `legend`.
- Indisponível usa `aria-disabled`, não `disabled`: continua no Tab e o leitor de tela anuncia o motivo (vai também em texto oculto no botão).
- A cor não é o único sinal: escolhida inverte o fundo, indisponível tem traço e risco.

## Uso

```vue
<VariantPicker v-model="selection" :variants="variants" />
```

## Não faça

- ❌ Esconder a combinação esgotada: mostre riscada, o cliente precisa saber que o tamanho existe.
- ❌ `disabled` nativo: tira o botão do teclado e some com o motivo.
