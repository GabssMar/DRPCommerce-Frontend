# Componente — Modal / Overlay

**Classes:** `.ds-overlay`, `.ds-modal` · **Status:** estável

## Quando usar

Decisão curta que **bloqueia** o fluxo: confirmar checkout, confirmar saída da fila, mostrar pedido confirmado. Se o conteúdo é longo ou navegável, é uma página.

## Anatomia

```
.ds-overlay                (fixed, z-modal, fundo --ds-surface-overlay)
└── .ds-modal              (raio 32, padding 32, sombra xl, máx. 480px)
    ├── .ds-modal__header  (título + .ds-icon-btn de fechar)
    ├── (conteúdo)
    └── .ds-modal__footer  (ações; primária à direita)
```

## Tokens

| Propriedade | Token |
|---|---|
| fundo do overlay | `--ds-surface-overlay` + `blur(2px)` |
| superfície | `--ds-surface-raised` |
| raio | `--ds-radius-3xl` |
| sombra | `--ds-shadow-xl` |
| entrada | `ds-scale-in`, `--ds-duration-slow`, `--ds-ease-entrance` |

## Comportamento obrigatório

1. **Foco entra** no modal ao abrir (no título ou no primeiro controle) e **volta** ao gatilho ao fechar.
2. **Trap de foco**: Tab circula só dentro do modal.
3. `Esc` fecha — **exceto** durante operação irreversível em andamento (pagamento processando).
4. Clique no overlay fecha; clique dentro não propaga.
5. `overflow: hidden` no `<body>` enquanto aberto.
6. `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando o título.
7. Conteúdo maior que a tela rola **dentro** do modal (`max-height: 90vh`).

## Uso

```vue
<div class="ds-overlay" @click.self="onClose">
  <div class="ds-modal" role="dialog" aria-modal="true" aria-labelledby="co-title">
    <header class="ds-modal__header">
      <h2 class="ds-modal__title" id="co-title">Confirmar compra</h2>
      <button class="ds-icon-btn ds-icon-btn--ghost" @click="onClose" aria-label="Fechar">
        <X :size="20" aria-hidden="true" />
      </button>
    </header>

    <!-- conteúdo -->

    <footer class="ds-modal__footer">
      <button class="ds-btn ds-btn--secondary ds-btn--block" @click="onClose">Cancelar</button>
      <button class="ds-btn ds-btn--primary ds-btn--block" @click="onConfirm">Confirmar</button>
    </footer>
  </div>
</div>
```

## Mobile

Abaixo de 480px, prefira bottom sheet: `.ds-modal` com `align-self: end`, `border-radius: 32px 32px 0 0`, largura total, entrada por `translateY(100%)`.

## Contexto do produto

No checkout do drop existe **janela de tempo**. O modal deve mostrar o countdown restante no header e, ao expirar, **fechar sozinho** com aviso claro do motivo — nunca deixar o usuário submeter em um estado já expirado.

## Não faça

- ❌ Modal sobre modal.
- ❌ Fechar por clique no overlay durante pagamento.
- ❌ Modal sem foco gerenciado (o usuário de teclado fica preso na página atrás).
- ❌ Scroll da página atrás do modal.
