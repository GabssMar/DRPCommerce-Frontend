# [Admin · Front-end] Shell do painel: entrada, layout com rail, navegação e separação do storefront

**Depende de:** task 02 (app shell) · **Bloqueia as tasks 23–26** · Não depende do back-end

## Tecnologias

| Camada | Stack |
|---|---|
| Front-end | **Vue 3** (Composition API, `<script setup>`) + **Vite** |
| Estilo | classes `ds-*` e tokens `var(--ds-*)`. Sem `<style>` no `.vue` |
| Ícones | `@lucide/vue` (16/20/24, `stroke-width: 1.5`) |
| Navegação | estado em `App.vue` (o projeto não usa Vue Router) |

## Funcionalidade nova

O **painel do administrador da loja**: uma área separada do storefront onde o dono da loja acompanha vendas e gerencia drops, catálogo, estoque e pedidos. Esta task entrega só a **casca** — layout, navegação e telas vazias. O conteúdo vem nas tasks 23–26.

## Estado atual

`App.vue` é o shell único do storefront: `currentPage` com cinco valores (`portal`, `detail`, `vitrine`, `product`, `cart`), topbar com marca + nav "Drops | Vitrine" + badge de ambiente, e `<SimulationPanel>` fixo. Tudo em 688 linhas, sem `<style>` e sem estilo inline.

O Design System **já prevê** um rail lateral de 72px em `patterns/app-shell.md` e a classe `.ds-rail` existe em `components.css`, mas **nenhuma tela usa** — o storefront só tem topbar.

## Como implementar

### 1. Entrada no painel

O painel não é um item da nav do cliente. Use um **prefixo de rota no hash**, que sobrevive ao F5 e não exige router:

```js
// src/router.js (novo, ~40 linhas — não é Vue Router, é leitura do hash)
// #/admin/dashboard -> { area: 'admin', page: 'dashboard' }
// #/vitrine         -> { area: 'store', page: 'vitrine' }
export const parseHash = (hash) => { … };
export const toHash = ({ area, page, id }) => { … };
```

`App.vue` passa a derivar `area` e `page` do hash e a escrever o hash quando navega, mantendo o comportamento atual das telas do storefront. **Nenhuma tela de cliente muda de aparência nesta task.**

### 2. `AdminShell.vue`

Layout de `patterns/app-shell.md` (o desenho com rail que o storefront não usa):

```vue
<div class="ds-shell">
  <aside class="ds-rail" aria-label="Seções do painel">
    <!-- LayoutDashboard · Rocket · Package · Receipt -->
  </aside>

  <div>
    <header class="ds-topbar ds-container">
      <!-- marca + "Painel da loja" -->
      <nav class="ds-nav" aria-label="Painel">…</nav>
      <span class="ds-badge ds-badge--inverse">{{ environmentLabel }}</span>
    </header>

    <main id="main" tabindex="-1" class="ds-container ds-page ds-stack--8">
      <div class="ds-cluster ds-cluster--between">
        <h1 class="ds-title">{{ pageTitle }}</h1>
        <slot name="actions" />
      </div>
      <slot />
    </main>
  </div>
</div>
```

Seções do rail, na ordem: **Dashboard · Drops · Catálogo · Pedidos**. Cada botão tem `aria-label` e a seção ativa recebe `aria-current="page"`. Abaixo de 768px o rail some e as mesmas seções aparecem na `.ds-nav` da topbar — regra 4 do `app-shell.md`.

### 3. Telas vazias

Crie `src/components/admin/` com quatro componentes que nesta task só renderizam `.ds-empty` ("Em construção"), cada um preenchido pela sua task:

```
src/components/admin/
├── AdminDashboard.vue     task 23
├── AdminDrops.vue         task 24
├── AdminCatalog.vue       task 25
└── AdminOrders.vue        task 26
```

### 4. Separação visual entre painel e loja

O painel é o mesmo sistema, não um tema novo (R5 e o anti-padrão "nova família tipográfica"). A distinção vem de:

- o **rail** (que o storefront não tem);
- o rótulo "Painel da loja" ao lado da marca;
- densidade maior: `ds-stack--6` no lugar de `ds-stack--8`, `.ds-card--tight` nas listas.

❌ Não crie paleta, fonte ou raio "de admin". ❌ Não use o tema escuro como marcador de área.

### 5. Acesso: o que esta task faz e o que não faz

**Não há autenticação no produto** — nem no front nem no back (task 19 §5). Esta task, portanto:

- monta o painel apenas quando `import.meta.env.DEV` **ou** `VITE_ADMIN_ENABLED=true`;
- em produção sem a flag, `#/admin/*` cai no portal, sem mensagem;
- exibe um aviso persistente no topo do painel: "Área administrativa sem autenticação — não publique com dados reais";
- registra a pendência na task 19 §5, que descreve o JWT com papel de administrador.

**Ninguém deve subir o painel em ambiente aberto antes do login existir.** Isso é critério de aceite, não observação.

### 6. `SimulationPanel`

Continua só no storefront e só em modo mock. O painel do administrador **não** monta o simulador — ele tem o próprio log de requisições (task 22).

## Critérios de aceite

- [ ] `#/admin/dashboard` abre o painel; F5 mantém a tela; voltar/avançar do navegador funcionam
- [ ] Rail com quatro seções, `aria-current` na ativa, `aria-label` em cada ícone
- [ ] Abaixo de 768px o rail some e as seções continuam alcançáveis pela topbar
- [ ] Uma `<h1>` por tela, no topo do `<main>`; ação primária ao lado dela (regras 1 e 2 do `app-shell.md`)
- [ ] `.ds-skip-link` funciona no painel
- [ ] Zero estilo inline, zero hex, zero `<style>` nos `.vue` novos
- [ ] Light e dark conferidos; 360px sem scroll horizontal
- [ ] Painel oculto em produção sem `VITE_ADMIN_ENABLED`; aviso de "sem autenticação" visível quando ativo
- [ ] Nenhuma tela do storefront mudou de aparência (diff visual em portal, drop, vitrine, sacola)
- [ ] `npm run lint` e `npm run build` passam

## Verificação

```bash
grep -rn ":style\|style=" src/components/admin/          # vazio
grep -rnE "#[0-9a-fA-F]{3,8}" src/components/admin/      # vazio
grep -rn "<style" src/components/admin/                  # vazio
npm run dev   # abra #/admin/dashboard, #/vitrine, dê F5 em cada, use voltar/avançar
npm run build && npm run preview   # sem VITE_ADMIN_ENABLED, #/admin cai no portal
```

## Referências do Design System

- `patterns/app-shell.md`: o layout com rail, e as regras 1–6
- `components/navigation.md`: `.ds-nav`, `.ds-rail`, estado ativo
- `patterns/states.md`: `.ds-empty` das telas em construção
- `CLAUDE.md` seções 4 (anti-padrões) e 5 (checklist)

## Para o Claude Code

```
Leia design-system/patterns/app-shell.md, components/navigation.md e CLAUDE.md. Crie a
casca do painel do administrador: src/router.js (parse/serialize do hash #/admin/<page>,
sem Vue Router), AdminShell.vue usando .ds-shell + .ds-rail conforme o app-shell.md, e
src/components/admin/{AdminDashboard,AdminDrops,AdminCatalog,AdminOrders}.vue renderizando
.ds-empty. Ajuste App.vue para derivar area/page do hash sem mudar nenhuma tela do
storefront. O painel só monta em DEV ou com VITE_ADMIN_ENABLED=true e exibe aviso de área
sem autenticação. Não monte o SimulationPanel dentro do painel. Sem CSS novo: se faltar
classe, PARE e reporte — ela pertence à task 20.
```
