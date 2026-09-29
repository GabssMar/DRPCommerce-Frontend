# Foundation — Espaço e Layout

## Escala (base 4px)

| Token | px | Uso típico |
|---|---|---|
| `--ds-space-1` | 4 | gap ícone↔texto interno, ajuste fino |
| `--ds-space-2` | 8 | gap ícone↔rótulo, itens de um cluster |
| `--ds-space-3` | 12 | padding de input, gap de badges |
| `--ds-space-4` | 16 | padding de card compacto, gap de lista |
| `--ds-space-5` | 20 | separação título↔conteúdo dentro do card |
| `--ds-space-6` | 24 | **padding padrão de card**, gap entre cards |
| `--ds-space-8` | 32 | padding de modal, separação entre seções |
| `--ds-space-10` | 40 | separação entre blocos de página |
| `--ds-space-12` | 48 | respiro de seção |
| `--ds-space-16` / `-20` | 64 / 80 | respiro de landing |

Valores fora da escala são proibidos. `13px`, `18px`, `25px` não existem.

## Regra do espaço proporcional

> Quanto maior o container, maior o respiro. Espaço interno < espaço entre irmãos < espaço entre seções.

Card: `padding: 24` · gap interno `20` · gap entre cards `24` · gap entre seções `40`.

## Grid

```
--ds-shell-max   1440px   largura máxima da aplicação
--ds-content-max 1200px   largura máxima de conteúdo
--ds-rail          72px   trilho vertical de ícones
--ds-sidebar      240px   sidebar expandida
--ds-topbar        64px   altura da barra superior
--ds-gutter        24px   (16px abaixo de 768px)
```

Layouts prontos em `../styles/utilities.css`:

| Classe | Faz |
|---|---|
| `.ds-app` | raiz da aplicação: `min-height: 100vh`, fundo `--ds-surface-canvas` e texto `--ds-text-primary` |
| `.ds-page` | conteúdo principal: respiro vertical `--ds-space-8` (use com `.ds-container`) |
| `.ds-shell` | rail + conteúdo; colapsa o rail abaixo de 768px |
| `.ds-container` | centraliza em 1200px com gutter |
| `.ds-grid--2` / `--3` | auto-fit responsivo (mín. 280/240px) |
| `.ds-grid--sidebar` | conteúdo 1.4fr + coluna lateral; empilha abaixo de 1024px |
| `.ds-stack--N` | coluna com gap `--ds-space-N` |
| `.ds-cluster` | linha que quebra, alinhada ao centro |

## Breakpoints

| Nome | Largura | O que muda |
|---|---|---|
| sm | 480px | 1 coluna, botões `--block` |
| md | 768px | rail some; densidade compacta entra |
| lg | 1024px | grid com sidebar empilha |
| xl | 1280px | layout completo |
| 2xl | 1440px | teto do shell |

Mobile-first: escreva o layout de 360px e adicione `@media (min-width: …)`.

## Não faça

- ❌ `margin` em componente para posicioná-lo. Espaço é responsabilidade do **pai** (use `gap`).
- ❌ Altura fixa em card com conteúdo dinâmico.
- ❌ `position: absolute` para layout (só para badge sobre avatar, overlay e afins).
- ❌ Scroll horizontal em qualquer largura ≥ 320px.
- ❌ Alvo de toque menor que `--ds-tap-min` (44px).
