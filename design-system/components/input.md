# Componente — Input / Field

**Classe:** `.ds-field`, `.ds-label`, `.ds-input`, `.ds-hint`, `.ds-error` · **Status:** estável

## Anatomia

```
.ds-field
├── .ds-label       (<label for>)
├── .ds-input       (<input> | <select> | <textarea>)
├── .ds-hint        (ajuda, sempre visível)
└── .ds-error       (só quando inválido)
```

## Tokens

| Propriedade | Token |
|---|---|
| fundo | `--ds-surface-raised` |
| borda | `--ds-border-default` → `--ds-border-strong` (hover) → `--ds-border-focus` (foco) |
| raio | `--ds-radius-md` |
| altura mín. | `--ds-tap-min` |
| padding | `--ds-space-3` / `--ds-space-4` |
| foco | `--ds-ring` |
| erro | `--ds-text-danger` + ring coral |

## Estados

| Estado | Visual |
|---|---|
| repouso | borda `default` |
| hover | borda `strong` |
| foco | borda `focus` + `--ds-ring` |
| preenchido | igual ao repouso (sem cor de "sucesso") |
| erro | `aria-invalid="true"` → borda e ring coral + `.ds-error` com ícone |
| desabilitado | fundo `sunken`, texto `tertiary`, `cursor: not-allowed` |
| somente leitura | sem borda, fundo `sunken` |

## Regras

1. **Label sempre visível.** Placeholder não é label — some ao digitar e reprova em acessibilidade.
2. Placeholder mostra formato (`000.000.000-00`), nunca instrução.
3. Erro aparece **abaixo** do campo, com ícone + texto, e some ao corrigir.
4. Validação no `blur`, não a cada tecla (exceto força de senha/máscara).
5. Campo obrigatório: marque o opcional, não o obrigatório — ou use `required` + `aria-required`.
6. Largura acompanha o conteúdo esperado: CEP não ocupa a linha inteira.
7. Em checkout, use `autoComplete`, `inputMode` e `type` corretos (`inputMode="numeric"` em CPF/cartão) — é o que mais reduz atrito no mobile.

## Uso

```vue
<div class="ds-field">
  <label class="ds-label" for="email">E-mail</label>
  <input
    id="email"
    type="email"
    class="ds-input"
    placeholder="voce@exemplo.com"
    autocomplete="email"
    :aria-invalid="!!error"
    :aria-describedby="error ? 'email-error' : 'email-hint'"
  />
  <span v-if="error" class="ds-error" id="email-error" role="alert">
    <AlertCircle :size="14" aria-hidden="true" />{{ error }}
  </span>
  <span v-else class="ds-hint" id="email-hint">Enviaremos a confirmação do pedido aqui.</span>
</div>
```

## Campo com ação (`.ds-input-group`)

Input e botão na mesma linha, como cupom + "Aplicar". O input ocupa o espaço livre; o botão mantém a largura do rótulo.

```vue
<div class="ds-field">
  <label class="ds-label" for="coupon">Cupom de desconto (opcional)</label>
  <div class="ds-input-group">
    <input id="coupon" class="ds-input" autocomplete="off" />
    <button type="button" class="ds-btn ds-btn--secondary">Aplicar</button>
  </div>
</div>
```

## Não faça

- ❌ `outline: none` sem `--ds-ring`.
- ❌ Fundo translúcido/glass (tema legado).
- ❌ Mensagem de erro em `alert()` ou `title`.
- ❌ Campo de fonte < 16px em iOS dentro de checkout (o Safari dá zoom). Use `--ds-text-lg` em formulários mobile críticos.
