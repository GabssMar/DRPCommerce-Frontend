# Componente — Card

**Classe:** `.ds-card` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Agrupar conteúdo relacionado em uma superfície elevada. **É o componente estrutural do sistema** (P1): a hierarquia da tela nasce do contraste entre o canvas `#EDEEF0` e o card `#FFFFFF`.

## Anatomia

```
.ds-card
├── .ds-card__media      (opcional; imagem 16:10, object-fit: cover)
├── .ds-card__header
│   ├── .ds-card__title  (+ .ds-card__subtitle)
│   └── .ds-card__actions   → .ds-icon-btn
├── (conteúdo)
└── .ds-card__footer
```

## Variantes

| Modificador | Uso |
|---|---|
| — | card padrão: branco, raio 24, sombra `sm`, padding 24 |
| `--tight` | listas densas: padding 16, raio 20 |
| `--flush` | sem padding, `overflow: hidden` — para tabela ou imagem sangrada |
| `--outlined` | sobre fundo branco: borda em vez de sombra |
| `--sunken` | área secundária/vazia dentro de outro card |
| `--inverse` | **o item em foco da tela** (P4): fundo tinta, texto branco |
| `--brand` | bloco de marca periwinkle com texto branco em tamanho grande |
| `--interactive` | clicável: hover eleva 2px |

Regra: **no máximo um `--inverse` por tela.** Ele é o destaque; dois destaques é nenhum.

## Imagem (`.ds-card__media`)

Proporção fixa 16:10 (sem salto de layout enquanto a imagem carrega) e fundo `--ds-surface-sunken` como placeholder. Em card padrão, a imagem tem raio `--ds-radius-lg`; dentro de `--flush`, sangra até a borda e o próprio card recorta.

```vue
<figure class="ds-card ds-card--flush">
  <img class="ds-card__media" :src="event.coverImageUrl" :alt="event.name" />
</figure>
```

| Modificador de `__media` | Uso |
|---|---|
| `--product` | foto de catálogo: 1:1, `object-fit: contain` (mostra a peça inteira), fundo branco |
| `--thumb` | miniatura de 64px em listas (sacola, pedido); combine com `--product` |
| `--placeholder` | produto sem foto: mesmo espaço com ícone centralizado |

## Card em pilha

Com `ds-stack--N` no próprio card, o gap espaça as partes: o `__header` perde a margem inferior e o `__footer` é empurrado para o fim (`margin-top: auto`). Em grid, os rodapés de cards vizinhos ficam alinhados mesmo com títulos de tamanhos diferentes.

## Tokens

| Propriedade | Token |
|---|---|
| fundo | `--ds-surface-raised` |
| raio | `--ds-radius-2xl` (24px) |
| padding | `--ds-space-6` |
| sombra | `--ds-shadow-sm` → `--ds-shadow-md` no hover |
| divisória do footer | `--ds-border-subtle` |

## Aninhamento

Card dentro de card: o interno usa `--sunken` ou `--tight` com raio **menor** (`--ds-radius-lg`). Nunca dois níveis de sombra empilhados.

## Acessibilidade

- Card clicável inteiro: use `<button>`/`<a>` envolvendo, ou dê `role="button"` + `tabIndex={0}` + handler de `Enter`/`Space`. Preferível: um link/botão claro no card em vez do card todo clicável.
- Título do card deve ser um heading real (`h2`/`h3`) quando estrutura a página.

## Uso

```vue
<article class="ds-card">
  <header class="ds-card__header">
    <div>
      <h3 class="ds-card__title">Sua posição na fila</h3>
      <p class="ds-card__subtitle">Atualizado há 3s</p>
    </div>
    <span class="ds-badge ds-badge--waiting">
      <span class="ds-badge__dot" />Aguardando
    </span>
  </header>

  <div class="ds-stat ds-stat--lg">
    <div class="ds-stat__value">127<span class="ds-stat__unit">º</span></div>
    <div class="ds-stat__label">de 1.842 na fila</div>
  </div>
</article>
```

## Não faça

- ❌ `backdrop-filter` / glassmorphism (tema legado).
- ❌ Borda colorida para indicar status — use `.ds-badge`.
- ❌ Altura fixa.
- ❌ Sombra + borda forte ao mesmo tempo.
