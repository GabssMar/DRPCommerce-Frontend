# Foundation — Cor

> **Princípio P2:** cor é semântica, nunca decoração. Dois cromas em toda a interface: azul (marca/normal) e coral (urgência). Tudo o mais é tinta e cinza.

## A regra que mais se quebra

`#83A2DB` (azul de marca) e `#FD8E8C` (coral) são **cores de superfície**. Sobre branco elas têm 2.58:1 e 2.23:1 — reprovam em qualquer tamanho de texto.

| Quero… | Use | Não use |
|---|---|---|
| Fundo de bloco/hero/gráfico de marca | `--ds-surface-brand` (#83A2DB) | — |
| Texto, link ou ícone de marca | `--ds-text-brand` (#4A6FB5) | `--ds-blue-400` |
| Fundo de badge "ao vivo" | `--ds-status-live-bg` | `--ds-coral-400` |
| Texto de erro/urgência | `--ds-text-danger` (#C5453F) | `--ds-coral-400` |
| Botão principal | `--ds-action-primary-bg` (tinta) | azul |

## Camadas

```
--ds-blue-400          primitivo   →  só dentro de tokens.css
--ds-surface-brand     semântico   →  É ISTO que você escreve no componente
```

Se você digitou `var(--ds-blue-…)`, `var(--ds-coral-…)` ou `var(--ds-ink-…)` dentro de um componente, está errado: falta um token semântico. Crie-o.

## Superfícies (3 níveis, nada além)

| Token | Light | Papel |
|---|---|---|
| `--ds-surface-canvas` | `#EDEEF0` | fundo da aplicação |
| `--ds-surface-raised` | `#FFFFFF` | card, modal, input |
| `--ds-surface-sunken` | `#E7E8E9` | trilho, célula hover, área vazia |
| `--ds-surface-inverse` | `#2A292E` | item em foco, FAB, pill ativa |
| `--ds-surface-brand` | `#83A2DB` | bloco de marca, hero, gráfico |

Não crie um quarto nível de cinza para "destacar um pouco". Use sombra ou espaço.

## Texto

| Token | Contraste em branco | Uso |
|---|---|---|
| `--ds-text-primary` | 14.45:1 | conteúdo, números, títulos |
| `--ds-text-secondary` | 5.32:1 | rótulos, legendas, metadados |
| `--ds-text-tertiary` | 3.2:1 | **só** placeholder e texto desabilitado — nunca conteúdo |
| `--ds-text-brand` | 4.97:1 | links |
| `--ds-text-danger` | 4.91:1 | erro, urgência |
| `--ds-text-warning` | 5.32:1 | alerta |
| `--ds-text-success` | 5.25:1 | confirmação |

## Status (domínio drop/fila)

| Status | Token base | Quando |
|---|---|---|
| `live` | coral | drop aberto agora, countdown < 60s, última unidade |
| `waiting` | azul | na fila, aguardando vez |
| `scheduled` | âmbar | drop agendado, fila ainda não abriu |
| `done` | cinza | drop encerrado, pedido antigo |
| `success` | verde **[extensão]** | pedido confirmado |

Nunca use `live` para decorar. Se tudo é urgente, nada é.

## Regras finais

1. Todo par de cor precisa de par no dark. Sem exceção.
2. Nunca gradiente de marca. A referência não tem um único gradiente de UI.
3. Nunca sombra colorida.
4. Cor nunca é o único portador de significado: badge tem texto, gráfico tem rótulo, erro tem ícone.
5. Mudou um primitivo? Recalcule a tabela de contraste em `../ANALYSIS.md` §2.1.
