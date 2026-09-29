# Padrão — Estados de tela

Toda tela que busca dado tem **cinco** estados. Implementar só "sucesso" é entregar metade.

| Estado | Quando | Componente | Texto |
|---|---|---|---|
| **Carregando** | primeira requisição | `.ds-skeleton` com a forma final | — |
| **Atualizando** | polling / refetch | dado antigo visível + `.ds-spinner` discreto | não substitua a tela |
| **Vazio** | requisição OK, zero itens | `.ds-empty` | o que é + como criar o primeiro |
| **Sem resultado** | filtro/busca sem match | `.ds-empty` | "Nada para «termo»" + limpar filtro |
| **Erro** | falha de rede/servidor | `.ds-empty` + `--ds-text-danger` | o que houve + "Tentar de novo" |

## Texto de erro

Fórmula: **o que falhou + o que fazer**. Sem jargão, sem código de erro na cara do usuário (coloque no `console` ou em `<small>`).

| ❌ | ✅ |
|---|---|
| "Erro 500" | "Não conseguimos carregar a fila. Tente de novo em instantes." |
| "Falha na requisição" | "Sua conexão caiu. Reconectando…" |
| "Operação inválida" | "A janela de checkout expirou. Você pode entrar na fila novamente." |

Erros do domínio drop que **precisam** de mensagem própria:

- Fila ainda não abriu → mostrar quando abre.
- Já está na fila (em outra aba) → mostrar a posição, não erro.
- Estoque esgotou enquanto estava no checkout → explicar e oferecer o próximo drop.
- Janela de checkout expirada → explicar e mostrar o caminho de volta.

## Regras

1. Nunca tela em branco. Se não há dado, há um estado.
2. Erro nunca é `alert()` nem só `console.error`.
3. Estado vazio sempre oferece uma saída (botão ou link).
4. Skeleton com a **mesma altura** do conteúdo final — evita salto de layout.
5. Refetch não apaga o que já está na tela.
6. Toda mudança de estado assíncrona vai para uma região `aria-live`.
7. Erro recuperável mantém o que o usuário digitou.

## Esqueleto de implementação

```vue
<ErrorState v-if="error" :message="humanize(error)" @retry="refetch" />
<LoadingSkeleton v-else-if="loading && !data" />
<EmptyState v-else-if="!data?.length" />
<Content v-else :data="data" :is-refreshing="loading" />
```
