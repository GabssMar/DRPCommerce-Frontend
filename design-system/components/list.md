# Componente — List (e peças de linha)

**Classes:** `.ds-list`, `.ds-icon-tile`, `.ds-dot`, `.ds-feed`, `.ds-row-divided`, `.ds-row-sunken` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Linhas de conteúdo que não são tabela: notificações, feed de eventos, estados explicados, entradas ligadas a um sinal.

## Quando NÃO usar

Dados comparáveis em colunas (valores, datas, status lado a lado) são `.ds-table`.

## Anatomia

```
ul.ds-list (dentro de .ds-card--flush)
└── li.ds-list__item
    ├── span.ds-icon-tile(--live|--waiting|--scheduled|--success)   aria-hidden
    ├── div  título + texto
    └── span.ds-list__meta    hora · .ds-dot (não lida)

ul.ds-feed
└── li.ds-feed__item > time.ds-feed__time + span

div.ds-row-divided    rótulo/badge à esquerda, texto à direita, hairline embaixo
div.ds-row-sunken     linha rebaixada (sem hairline)
```

## Regras

- O ícone colorido é decorativo; o significado está no texto ou num `.ds-badge`.
- `.ds-dot` sempre com rótulo acessível (`<span class="ds-sr-only">Não lida</span>`).
- Abaixo de 480px, `__meta` desce para baixo do texto.

## Tokens consumidos

| Propriedade | Token |
|---|---|
| hairline | `--ds-border-subtle` |
| ícone | `--ds-status-*-bg` / `--ds-status-*-fg` |
| não lida | `--ds-surface-brand` |
