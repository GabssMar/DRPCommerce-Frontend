# [DS] Checkout: modal, formulário e expiração da janela

**Depende de:** tasks 00, 01 e 06 · **Maior risco do projeto: é onde o dinheiro entra**

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

`src/components/CheckoutModal.vue` (portado de `CheckoutModal.jsx`, 304 linhas, **45 estilos inline**): o modal que abre quando chega a vez do usuário, coleta os dados e finaliza o pedido (evento `submit`) dentro de uma janela de tempo limitada.

## Estado atual

Sete `.input-field` **sem `<label>` visível** (só placeholder), botão `.btn btn-primary pulse-glow`, `.badge` genérico e 45 estilos inline. O modal não gerencia foco: usuário de teclado continua navegando na página atrás. (O `.spinner` já virou `.ds-spinner` na task 01.)

## Como implementar

### 1. Estrutura do modal

Renderize com `<Teleport to="body">` para o overlay não herdar o layout da tela:

```vue
<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ds-overlay" @click.self="requestClose">
      <div
        ref="dialog"
        class="ds-modal"
        role="dialog" aria-modal="true" aria-labelledby="co-title"
        @keydown.esc="requestClose"
      >
        <header class="ds-modal__header">
          <h2 id="co-title" class="ds-modal__title">Confirmar compra</h2>
          <button class="ds-icon-btn ds-icon-btn--ghost" aria-label="Fechar" @click="requestClose">
            <X :size="20" />
          </button>
        </header>
        …
        <footer class="ds-modal__footer">
          <button type="button" class="ds-btn ds-btn--secondary ds-btn--block" @click="requestClose">Cancelar</button>
          <button type="submit" form="co-form" class="ds-btn ds-btn--primary ds-btn--block">Confirmar compra</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
```

`requestClose` emite `close`, **exceto** durante o processamento (`isLoading`).

### 2. Comportamento obrigatório (hoje ausente)

Tudo de `components/modal.md`:

1. Foco **entra** no modal ao abrir e **volta** ao gatilho ao fechar (`watch(() => props.isOpen)` + `nextTick`, guardando `document.activeElement` antes de abrir)
2. Trap de foco: Tab circula só dentro do modal
3. `Esc` fecha, **exceto** durante o processamento do pedido
4. Clique no overlay fecha (`@click.self`); clique dentro não fecha
5. `overflow: hidden` no `<body>` enquanto aberto (e restaurado em `onUnmounted`)
6. `role="dialog"` + `aria-modal="true"` + `aria-labelledby`

### 3. Campos com label visível

Cada `.input-field` vira o trio completo:

```vue
<div class="ds-field">
  <label class="ds-label" for="cpf">CPF</label>
  <input
    id="cpf" v-model="form.cpf" class="ds-input"
    inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"
    :aria-invalid="!!errors.cpf" :aria-describedby="errors.cpf ? 'cpf-err' : undefined"
  >
  <span v-if="errors.cpf" id="cpf-err" class="ds-error" role="alert">{{ errors.cpf }}</span>
</div>
```

**Placeholder não é label**: é a regra 1 de `components/input.md`. Todo campo ganha `<label>` visível, `autocomplete` e `inputmode` corretos (o que mais reduz atrito no mobile).

Erros de validação que vierem do back-end (FluentValidation, resposta 400 com erros por campo) devem ser mapeados para o `errors` do campo correspondente, não exibidos como alerta genérico.

### 4. A janela de tempo

O checkout tem prazo. O modal precisa:

- Mostrar o countdown restante no header (reutilize o `Countdown.vue` já refatorado na task 05)
- Ao expirar: **fechar sozinho**, explicar o motivo e mostrar o caminho de volta
- **Nunca** permitir submeter um pedido em janela já expirada (checar no handler de submit, não só desabilitar o botão)
- Durante o processamento: `aria-busy="true"`, `.ds-spinner` **ao lado** do rótulo (o botão não encolhe), `Esc` desabilitado

### 5. Confirmação de sucesso

Use `.ds-badge--success` e `--ds-text-success` (o verde é extensão do sistema e existe exatamente para isto). Mostre o identificador do pedido em `--ds-font-mono`.

## Critérios de aceite

- [ ] `role="dialog"`, `aria-modal`, `aria-labelledby` presentes; modal renderizado via `<Teleport to="body">`
- [ ] Foco entra no modal, faz trap e retorna ao gatilho ao fechar
- [ ] `Esc` e clique no overlay fecham, e ficam bloqueados durante o processamento
- [ ] Todos os 7 campos com `<label>` visível, `autocomplete` e `inputmode`
- [ ] Erro por campo com `aria-invalid` + `role="alert"`, texto abaixo do campo (inclusive erros vindos da API)
- [ ] Botão de submit mantém largura ao entrar em loading (`.ds-spinner` ao lado do rótulo)
- [ ] Expiração fecha o modal com mensagem clara; submit bloqueado após expirar
- [ ] `pulse-glow` removido
- [ ] Zero hex literal, ≤ 3 estilos inline
- [ ] Fluxo completo navegável só por teclado
- [ ] Light e dark conferidos

## Verificação

```bash
grep -nE "input-field|pulse-glow|class=\"spinner\"|#[0-9a-fA-F]{3,6}" src/components/CheckoutModal.vue   # vazio
grep -cE ':?style="' src/components/CheckoutModal.vue   # <= 3
npm run lint
```

Manual: abrir o modal só com teclado, percorrer todos os campos, submeter com erro, deixar a janela expirar com o modal aberto.

## Referências do Design System

- `design-system/components/modal.md`: comportamento obrigatório e bottom sheet mobile
- `design-system/components/input.md`: label visível, erro, `inputmode`
- `design-system/components/button.md`: estado loading sem encolher
- `design-system/patterns/drop-page.md`: regra 5 (expiração)

## Para o Claude Code

```
Leia design-system/CLAUDE.md, components/modal.md, components/input.md e
components/button.md. Refatore src/components/CheckoutModal.vue: ds-overlay/ds-modal
dentro de <Teleport to="body">, com role=dialog, aria-modal, trap de foco e retorno ao
gatilho; os 7 campos viram ds-field com label visível, v-model, autocomplete/inputmode e
erro com aria-invalid+role=alert (incluindo erros de validação vindos da API); loading
mantém a largura do botão; expiração da janela fecha o modal explicando o motivo e
bloqueia o submit. Mantenha os eventos close e submit. Não altere a chamada de criação
do pedido. Não crie bloco <style>.
```
