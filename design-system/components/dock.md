# Componente — Dock

**Classe:** `.ds-dock` · **CSS:** `../styles/components.css` · **Status:** estável

## Para que serve

Painel flutuante de **ferramenta interna** (o simulador do drop), preso no canto inferior direito e aberto por um botão.

## Quando NÃO usar

- Conteúdo do produto ou diálogo que bloqueia a tela → `modal`.
- Aviso passageiro → `feedback` (banner).
- Nunca em produção: quem monta o dock esconde ele fora de `import.meta.env.DEV`.

## Anatomia

```
.ds-dock                         fixo, canto inferior direito
├── button.ds-btn.ds-dock__trigger    abre e fecha (aria-expanded, aria-controls)
└── .ds-dock__panel              superfície --sunken com sombra xl
    ├── .ds-dock__bar            faixa com rótulo à esquerda e ação/valor à direita (repete)
    │   └── select.ds-input.ds-dock__select   select compacto dentro da faixa
    ├── .ds-dock__bar.ds-dock__tabs   abas: .ds-nav__item dividindo a faixa
    └── .ds-dock__body           área rolável
        ├── .ds-dock__actions    grade de botões .ds-btn--sm, 2 colunas
        │                        (--fill: uma linha, todos do mesmo tamanho)
        ├── input.ds-dock__range controle deslizante com label visível
        └── button.ds-dock__row  linha expansível (log), com aria-expanded
            ├── .ds-dock__row-main     método · URL
            └── .ds-dock__truncate     texto cortado com reticências
```

## Tokens consumidos

| Propriedade | Token |
|---|---|
| fundo do painel | `--ds-surface-sunken` |
| borda | `--ds-border-subtle` |
| raio | `--ds-radius-xl` (painel) · `--ds-radius-md` (linha) |
| sombra | `--ds-shadow-xl` (painel) · `--ds-shadow-lg` (botão) |
| empilhamento | `--ds-z-toast` |
| range | `--ds-action-primary-bg` (`accent-color`) |

## Estados

| Estado | Comportamento |
|---|---|
| hover (linha) | `--ds-action-ghost-bg-hover` |
| aberto (linha) | `aria-expanded="true"` → fundo `--ds-surface-raised` |
| focus-visible | `box-shadow: var(--ds-ring)` no botão, na linha e no range |
| 360px | painel ocupa a largura menos `--ds-space-4` de cada lado |

## Acessibilidade

- O botão de abrir tem `aria-expanded` e `aria-controls` com o `id` do painel.
- Abas dentro do painel: `role="tablist"` com `.ds-nav__item` e `aria-selected`.
- Todo range e select tem `<label>` visível.
- Contraste: herda os pares de texto do sistema (light e dark).

## Uso

```vue
<div class="ds-dock">
  <button class="ds-btn ds-btn--secondary ds-btn--pill ds-dock__trigger" :aria-expanded="open" aria-controls="sim" @click="open = !open">
    Simulação
  </button>
  <section v-if="open" id="sim" class="ds-dock__panel ds-animate-in">
    <div class="ds-dock__bar"><span class="ds-label-caps">Simulação</span></div>
    <div class="ds-dock__body ds-stack--6">…</div>
  </section>
</div>
```

## Não faça

- ❌ Gradiente, glow ou cor de marca no botão: é ferramenta, não CTA.
- ❌ `:style` para posição ou tamanho: está tudo na classe.
