# [DS] Fila prioritária: posição, estados e anúncios acessíveis

**Depende de:** tasks 00, 01 e 05 · **Componente mais crítico do produto**

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API com `<script setup>`, Single File Components `.vue`) + **Vite**, JavaScript (sem TypeScript) |
| Estilo | CSS puro + Design System (`design-system/`: classes `ds-*` e tokens `var(--ds-*)`). Sem Tailwind, sem CSS-in-JS, sem biblioteca de componentes, **sem bloco `<style>` nos `.vue`** |
| Ícones | `@lucide/vue` (`<X :size="20" :stroke-width="1.5" />`), tamanhos 16/20/24 |
| Back-end | **C# / .NET 9**, ASP.NET Core Web API (MediatR, FluentValidation, EF Core + PostgreSQL), em `../backend` |
| Integração | HTTP/JSON com a API do back-end via `src/services/api.js` (JS puro, independente de framework) |
| Qualidade | ESLint (`eslint-plugin-vue`) · Conventional Commits (commitlint + husky) |

## Funcionalidade alterada

`src/components/QueueStatus.vue` (portado de `QueueStatus.jsx`, 226 linhas, **40 estilos inline**): entrar na fila (evento `join-queue`), acompanhar a posição em tempo real (polling a cada 3s), ser chamado para o checkout (evento `checkout`) e sair da fila. É a tela onde o usuário fica parado olhando: qualquer tremor ou salto de layout aqui é percebido.

## Estado atual

Seis `.glass-card slide-up`, botões `.btn btn-primary pulse-scale` / `pulse-glow`, badges `badge-waiting pulse-glow` e `badge-success pulse-scale`, e 40 estilos inline com hex e tokens legados. Mudanças de estado acontecem **sem anúncio para leitor de tela**. (O `.spinner` já virou `.ds-spinner` na task 01.)

## Como implementar

### 1. Hierarquia da tela

A posição na fila é **o maior número da tela** (`.ds-stat--lg`), sempre acompanhada de estimativa em linguagem natural:

```vue
<article class="ds-card">
  <header class="ds-card__header">
    <h3 class="ds-card__title">Sua posição na fila</h3>
    <span class="ds-badge ds-badge--waiting"><span class="ds-badge__dot" />Aguardando</span>
  </header>
  <div class="ds-stat ds-stat--lg">
    <div class="ds-stat__value">{{ position }}<span class="ds-stat__unit">º</span></div>
    <div class="ds-stat__label">de {{ total }} na fila · ≈ {{ eta }}</div>
  </div>
</article>
```

Opcional (padrão da referência): `.ds-avatar-group` com no máximo 5 avatares + contador, representando quem está à frente.

### 2. Máquina de estados

Implemente exatamente o mapa de `patterns/drop-page.md`. Um `computed` `queueState` devolve o estado atual, e o template lê variante, rótulo e CTA dele:

| Estado | Badge | CTA |
|---|---|---|
| Fila aberta, fora da fila | `--live` "AO VIVO" | `.ds-btn--primary` "Entrar na fila" |
| Na fila, aguardando | `--waiting` "Posição N" | `.ds-btn--secondary` "Sair da fila" |
| É a sua vez | `--live` "Sua vez!" | `.ds-btn--primary ds-btn--lg` "Finalizar compra" |
| Pedido confirmado | `--success` | `.ds-btn--secondary` "Ver pedido" |
| Encerrado / esgotado | `--done` | desabilitado **com o motivo visível** |

**O CTA nunca muda de lugar entre estados**: só rótulo e variante. Use **um único `<button>`** com `:class` e texto vindos do estado, não um `v-if` por estado. Usuário em fila fica com o cursor parado sobre o botão, e botão que pula causa clique errado.

### 3. Anúncios acessíveis (hoje ausentes)

```vue
<div aria-live="polite" aria-atomic="true" class="ds-sr-only">
  Sua posição na fila: {{ position }} de {{ total }}
</div>
<div aria-live="assertive" class="ds-sr-only">
  {{ queueState === 'your-turn' ? 'É a sua vez. Finalize a compra.' : '' }}
</div>
```

"É a sua vez" usa `aria-live="assertive"`: é interrupção legítima. As duas regiões ficam sempre no DOM (não use `v-if` nelas, senão o anúncio se perde).

### 4. Polling sem piscar

O `setInterval` de 3s (criado em `onMounted`, limpo em `onUnmounted`) não pode re-renderizar a tela inteira nem reinserir skeleton a cada resposta:

- Skeleton **só na primeira carga** (`v-if="loading && !data"`)
- Refetch mantém o dado anterior visível (`patterns/states.md`, estado "Atualizando")
- Indicador discreto de atualização (`.ds-spinner`), não bloqueante

### 5. Erros do domínio

Hoje o `catch` do polling só faz `console.error`. Precisa tratar, com mensagem própria (`patterns/states.md`):

- Fila ainda não abriu → mostrar quando abre
- Já está na fila em outra aba → mostrar a posição, não erro
- Estoque esgotou enquanto aguardava → explicar e oferecer o próximo drop
- Falha de rede → "Reconectando…" sem derrubar a posição da tela

As respostas de erro vêm da API ASP.NET Core (validações FluentValidation e status HTTP). Mapeie pelo status/código retornado, não pelo texto da mensagem.

## Critérios de aceite

- [ ] Posição em `.ds-stat--lg` com estimativa em linguagem natural
- [ ] Os cinco estados implementados conforme a tabela, com CTA em posição fixa (um único botão)
- [ ] `aria-live` polite para posição e assertive para "é a sua vez"
- [ ] Polling não causa piscada nem salto de layout (verificar por 60s na tela)
- [ ] Intervalo limpo em `onUnmounted` (sair e voltar à tela não duplica requisições)
- [ ] Erros de domínio com mensagem própria, não `console.error` mudo
- [ ] `pulse-glow`/`pulse-scale` removidos
- [ ] Zero `.glass-card`, zero hex literal, ≤ 3 estilos inline
- [ ] Navegação completa por teclado, foco visível
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "glass-card|pulse-glow|pulse-scale|class=\"spinner\"|#[0-9a-fA-F]{3,6}" src/components/QueueStatus.vue   # vazio
grep -cE ':?style="' src/components/QueueStatus.vue   # <= 3
npm run lint
```

Manual: entrar na fila, deixar a tela aberta 2 minutos e confirmar que nada pisca; derrubar a API e confirmar a mensagem de reconexão; percorrer tudo com teclado.

## Referências do Design System

- `design-system/patterns/drop-page.md`: **máquina de estados completa**
- `design-system/patterns/states.md`: carregando / atualizando / vazio / erro
- `design-system/components/stat.md`, `components/badge.md`, `components/avatar.md`
- `design-system/components/feedback.md`: regra de anúncio `aria-live`

## Para o Claude Code

```
Leia design-system/CLAUDE.md, patterns/drop-page.md, patterns/states.md e
components/feedback.md. Refatore src/components/QueueStatus.vue para o DS:
posição em ds-stat--lg, a máquina de cinco estados num computed com um único botão de
CTA em posição fixa, regiões aria-live sempre montadas (polite para posição, assertive
para "sua vez"), e o polling de 3s sem piscar (skeleton só na primeira carga, refetch
preserva o dado na tela, clearInterval em onUnmounted). Trate os erros de domínio com
mensagem própria. Não altere a lógica de polling nem as chamadas de api.getQueueStatus,
e mantenha os eventos join-queue e checkout. Não crie bloco <style>.
```
