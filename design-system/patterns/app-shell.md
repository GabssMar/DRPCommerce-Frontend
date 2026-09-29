# Padrão — App Shell

Estrutura de página que toda tela da aplicação herda.

```
┌──────┬──────────────────────────────────────────────┐
│ rail │ topbar: marca · nav pills · ações · avatar   │  64px
│ 72px ├──────────────────────────────────────────────┤
│      │ ds-container (máx. 1200px, gutter 24)        │
│ ícones│  h1 da página          + ações da página     │
│      │  ┌────────────────────┐ ┌──────────────────┐ │
│      │  │ ds-card            │ │ ds-card          │ │
│      │  └────────────────────┘ └──────────────────┘ │
└──────┴──────────────────────────────────────────────┘
        canvas #EDEEF0 · cards #FFFFFF
```

```vue
<div class="ds-app">
<a href="#main" class="ds-skip-link">Pular para o conteúdo</a>

<div class="ds-shell">
  <aside class="ds-rail" aria-label="Atalhos">
    <button class="ds-icon-btn ds-icon-btn--ghost" aria-label="Início"><Home :size="20" /></button>
    <!-- … -->
  </aside>

  <div>
    <header class="ds-topbar">
      <Brand />
      <nav class="ds-nav" aria-label="Principal">…</nav>
      <div class="ds-cluster ds-cluster--2">
        <button class="ds-icon-btn" aria-label="Notificações"><Bell :size="20" /></button>
        <span class="ds-avatar"><img :src="me.photo" alt="" /></span>
      </div>
    </header>

    <main id="main" tabindex="-1" class="ds-container ds-page ds-stack--8">
      <div class="ds-cluster ds-cluster--between">
        <h1 class="ds-title">Título da página</h1>
        <button class="ds-btn ds-btn--primary">Ação principal</button>
      </div>

      <section class="ds-grid ds-grid--sidebar">
        <div class="ds-stack--6"><!-- conteúdo --></div>
        <aside class="ds-stack--6"><!-- lateral --></aside>
      </section>
    </main>
  </div>
</div>
</div>
```

## Regras

1. **Uma** `<h1>` por página, no topo do `<main>`.
2. A ação principal da página vive ao lado do `<h1>`, não perdida dentro de um card.
3. Conteúdo nunca encosta na borda: `ds-container` sempre.
4. Abaixo de 768px o rail some — as mesmas ações precisam existir em outro lugar (tab bar ou menu).
5. Nada de sidebar fixa com scroll independente em mobile.
6. Fundo da página é `--ds-surface-canvas`; qualquer conteúdo relevante mora em um `.ds-card`.

## Hierarquia visual da tela (ordem de leitura projetada)

1. `<h1>` + badge de status do contexto (ex.: `--live`)
2. O número que mais importa (`.ds-stat--lg`)
3. A ação primária (`.ds-btn--primary`)
4. Detalhes secundários em cards menores
5. Histórico/tabela no fim

Se o usuário precisa rolar para encontrar a ação primária em uma tela de drop, o layout está errado.
