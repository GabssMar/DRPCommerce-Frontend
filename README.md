# DRPCommerce — Frontend

Interface web do **DRPCommerce**, uma loja virtual com três áreas no mesmo aplicativo:

- **Drops**: lançamentos de estoque limitado. O cliente se inscreve, entra numa fila, acompanha a posição e, quando chega a vez dele, tem alguns minutos para finalizar a compra.
- **Vitrine**: a loja do dia a dia, sem fila. Tem catálogo, sacola e checkout.
- **Painel do administrador**: área do lojista para acompanhar vendas e gerenciar drops, produtos, cupons, pedidos, clientes e equipe.

O cliente também tem a área **Minha conta**, com perfil, pedidos e notificações.

O back-end fica em outro repositório: [DRPCommerce-Backend](https://github.com/joseHenrique346/DRPCommerce-Backend).

---

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org/) 20.19 ou 22.12 em diante.

```bash
npm install
npm run dev
```

Abra **http://localhost:5173**. A loja abre na tela de **login**: só o cliente logado navega pelos drops, pela vitrine e pela conta. No modo de exemplo, entre com `camila.duarte@exemplo.com` e qualquer senha. O painel do administrador fica em **http://localhost:5173/#/admin**, com login próprio.

Não precisa do back-end para ver o projeto funcionando: por padrão o front usa **dados de exemplo** (veja abaixo).

### Outros comandos

| Comando | O que faz |
|---|---|
| `npm run build` | Gera a versão de produção na pasta `dist/` |
| `npm run preview` | Abre a versão de produção localmente |
| `npm run lint` | Confere o padrão do código |
| `npm run ds:check` | Confere se os componentes seguem o Design System (roda também antes de cada commit) |

---

## Dados de exemplo × back-end real

O modo é escolhido no arquivo `.env.local`. Para criar o seu, copie o `.env.example`:

| Configuração | Valor | Efeito |
|---|---|---|
| `VITE_API_MODE` | `mock` (padrão) | Usa dados de exemplo e não precisa de servidor |
| | `http` | Chama o back-end de verdade pelo Gateway (login obrigatório) |
| `VITE_GATEWAY_URL` | `https://localhost:5000` (padrão) | Endereço do Gateway usado pelo servidor de desenvolvimento |
| `VITE_ADMIN_ENABLED` | `true` / `false` | Libera o painel na versão de produção (em desenvolvimento ele sempre aparece) |

No modo de exemplo, o painel mostra as requisições que **seriam** enviadas ao back-end, o que ajuda a conferir a integração sem servidor.

### Usando o back-end real (`http`)

- Suba o back-end local: Gateway em `https://localhost:5000`, Store em `5001` e Drop em `5002`.
- A loja é identificada pelo endereço do site. Por isso, abra o front em **http://teste.stores.localhost:5173**, não em `localhost`. O painel fica em **http://teste.stores.localhost:5173/#/admin**.
- Os cadastros do painel (produtos, categorias, cupons, drops…) são gravados na loja escolhida no login. Se aparecer "Sessão sem loja selecionada", saia e entre de novo no painel.

> **Atenção:** o painel já funciona com o back-end real. A vitrine e a área **Minha conta** ainda não: o Gateway não repassa o endereço da loja e toda rota `storefront/*` responde 404. A correção é no back-end e está descrita em [`PENDENCIAS-BACKEND-2026-11-16.md`](./design-system/migration/tasks/PENDENCIAS-BACKEND-2026-11-16.md).

---

## Tecnologias

- **Vue 3** com **Vite**, em JavaScript (sem TypeScript)
- **CSS puro** com um Design System próprio (sem Tailwind e sem bibliotecas de componentes)
- Ícones **Lucide**
- **ESLint** e **commitlint** (padrão Conventional Commits)

---

## Organização das pastas

```
src/
├── components/     telas e componentes (loja, conta, drop, admin, ui)
├── composables/    lógica reaproveitável entre telas
├── services/       toda a comunicação com o back-end (e os dados de exemplo em mock/)
├── router.js       rotas das páginas
└── App.vue         estrutura principal da loja

design-system/      cores, tipografia, componentes e regras visuais
```

Regra importante: **nenhuma tela chama o back-end diretamente**. Tudo passa por `src/services/`.

---

## Design System

O visual segue um Design System próprio, em [`design-system/`](./design-system): fundo claro, cards brancos, sombras suaves e azul periwinkle como cor da marca.

- Para ver todos os componentes, abra [`design-system/preview.html`](./design-system/preview.html) no navegador.
- Antes de mexer em qualquer tela, leia [`design-system/CLAUDE.md`](./design-system/CLAUDE.md), que reúne as regras do sistema.

As três regras principais:

1. Não escreva cores ou tamanhos direto no componente; use as variáveis `var(--ds-*)`.
2. Toda tela precisa funcionar no tema claro **e** no escuro, e em telas de celular (360 px).
3. Todo elemento clicável precisa de foco visível e área de toque de pelo menos 44 px.

---

## Situação do projeto

| Pronto | Em andamento |
|---|---|
| Migração para Vue 3 e Design System, com o tema antigo removido | Ligar portal, fila e checkout do drop ao back-end |
| Telas da loja, da conta e do drop | Usar as novas rotas do back-end: carrinho, checkout, estoque, pedidos… |
| Painel do administrador (com dados de exemplo) | Pagamento (Mercado Pago) e frete (Melhor Envio), que dependem do back-end |
| Login, cadastro e renovação de sessão | |

O planejamento completo, com uma task por funcionalidade, está em [`design-system/migration/tasks/`](./design-system/migration/tasks/README.md). O mapa de qual tela usa qual rota do back-end está em [`CONTRATO-API.md`](./design-system/migration/tasks/CONTRATO-API.md).

---

## Como contribuir

1. Crie uma branch a partir da `main` (ex.: `feat/carrinho-servidor`).
2. Rode `npm run lint` e `npm run build` antes de commitar.
3. Escreva o commit no padrão Conventional Commits, em minúsculas: `feat: adiciona carrinho no servidor`. O hook recusa mensagens fora do padrão.
4. Abra um pull request para a `main`.
