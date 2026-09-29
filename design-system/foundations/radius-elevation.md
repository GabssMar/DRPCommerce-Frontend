# Foundation — Raio e Elevação

> **Princípio P3:** forma macia, dado duro. O raio é generoso; o conteúdo dentro dele é denso e exato.

## Raio — regra do tamanho

Quanto maior o elemento, maior o raio. Elemento pequeno com raio de card parece uma bolha.

| Token | px | Aplicar em |
|---|---|---|
| `--ds-radius-xs` | 8 | tag minúscula, ring de foco |
| `--ds-radius-sm` | 10 | chip retangular, célula |
| `--ds-radius-md` | 12 | **botão, input, select** |
| `--ds-radius-lg` | 16 | botão grande, card aninhado, imagem |
| `--ds-radius-xl` | 20 | card compacto |
| `--ds-radius-2xl` | 24 | **card padrão** |
| `--ds-radius-3xl` | 32 | modal, container de seção, hero |
| `--ds-radius-pill` | 999 | badge, nav ativa, barra de progresso |
| `--ds-radius-circle` | 50% | avatar, botão de ícone, FAB |

**Aninhamento:** o raio interno deve ser menor que o externo. Card 24 → imagem interna 16 → botão 12.

## Elevação — 5 degraus, sombra sempre neutra

| Token | Uso |
|---|---|
| `--ds-shadow-xs` | hairline de separação |
| `--ds-shadow-sm` | **card em repouso** |
| `--ds-shadow-md` | card em hover, dropdown, popover |
| `--ds-shadow-lg` | drawer, card arrastado |
| `--ds-shadow-xl` | modal |
| `--ds-ring` | foco de teclado (não é elevação — é acessibilidade) |

A referência separa superfícies por **contraste de valor + sombra difusa**, não por borda. Use borda só quando o card estiver sobre fundo branco (`.ds-card--outlined`).

## Anti-padrões

| ❌ | ✅ |
|---|---|
| `box-shadow: 0 0 20px rgba(124,77,255,.4)` (glow) | `--ds-shadow-md` |
| `backdrop-filter: blur(16px)` em card | superfície opaca `--ds-surface-raised` |
| Borda de 1px forte + sombra forte juntas | uma coisa ou outra |
| Sombra com deslocamento horizontal | só vertical |
| Elevação animada > 4px no hover | `translateY(-2px)` |

O tema legado do projeto (`src/index.css`) é construído inteiramente sobre glow e glass — ver `../migration/from-neon-glass.md`.
