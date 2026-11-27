# Pendências do back-end encontradas nos testes pelas telas (16/11/2026)

Testes de navegador (Playwright, Chrome) passando pelas **telas do front**, contra o pacote `backend-local` (commit `42ccf6b-dirty`). Nenhum teste chamou endpoint direto: quem monta as requisições é o próprio front.

| Fluxo testado | Resultado |
|---|---|
| Painel: login, navegação, F5, logout | ✅ |
| Catálogo: criar categoria, criar e editar produto | ✅ (depois de correção no front) |
| Drop: criar com variante, F5, abrir inscrições | ✅ (depois de correção no front) |
| Conta do cliente: as 9 rotas `storefront/auth/*` e `storefront/me` | ✅ **só contornando o Gateway** (item 1) |

---

## 1. O Gateway perde o Host: toda rota `storefront/*` responde 404 — **bloqueante**

> **Resolvido (conferido em 22/11/2026):** com o back atual, `teste.stores.localhost:5173` → Gateway → Store responde 200 em `storefront/store` e nas rotas `storefront/auth/*`.

A loja do cliente é resolvida pelo Host (`dominio_empresa.normalized_host = teste.stores.localhost`, ativo e verificado). O YARP troca o Host pelo do destino (`localhost:5001`) e o Store não lê o `X-Forwarded-Host`.

| Caminho (`GET /api/storefront/auth/csrf`) | Resultado |
|---|---|
| Store direto (5001), `Host: teste.stores.localhost` | 200 |
| Gateway (5000), mesmo Host | 404 `Enterprise.Unavailable` |
| Front (5173 → Gateway) | 404 `Enterprise.Unavailable` |

```json
{"title":"Loja indisponível.","status":404,"code":"Enterprise.Unavailable"}
```

`app/gateway/appsettings.json` hoje só tem `PathRemovePrefix` nas rotas.

**Correção sugerida (recomendada):** no Store (e no Drop, se ele também resolver a loja pelo Host), `UseForwardedHeaders` com `ForwardedHeaders.XForwardedHost | XForwardedFor | XForwardedProto`, aceitando os cabeçalhos **só do Gateway** (`KnownProxies`/`KnownNetworks`), senão qualquer um troca de loja forjando o cabeçalho. O YARP já envia `X-Forwarded-*` por padrão.

**Alternativa testada:** `{ "RequestHeaderOriginalHost": "true" }` nas rotas do Gateway. O 404 vira **502**: com o Host original, a conexão HTTPS Gateway → Store passa a usar `teste.stores.localhost` e o certificado local só vale para `localhost` (hipótese — não confirmei desligando a validação). Por isso a primeira opção é mais simples.

**Como conferir:** `curl -k -H "Host: teste.stores.localhost" https://localhost:5000/api/store/api/storefront/auth/csrf` deve responder 200.

## 2. Falta rota de cliente para o documento (CPF)

A tela **Minha conta** mostra e envia o CPF. Não existe rota em `storefront/`, então o front usa o CRUD da equipe com o token do cliente:

| Chamada do front | Resposta |
|---|---|
| `GET /api/store/api/documents/get-all` (token de cliente) | 401, corpo vazio |
| `POST /api/store/api/documents/add` (envio do CPF) | não testado — deve dar o mesmo 401 |

Hoje a seção de CPF não carrega para nenhum cliente. **Pedido:** `GET storefront/me/documents` e `POST storefront/me/documents` (o back carimba `referenceType = Customer`, `referenceId` e a loja pela sessão).

Mesma situação, já listada em `TELAS-DESIGN.md` §83: entrar/sair da lista de espera, canais de aviso, cancelar inscrição, excluir notificação e criar pedido da vitrine usam CRUD da equipe com token de cliente.

## 3. Limite de requisições da autenticação conta por IP — risco atrás do Gateway

As rotas de autenticação usam `SlidingWindowLimiter` (políticas `auth`, `login`, `change-password`…). Em teste, depois de ~15 chamadas de autenticação em ~1 minuto do mesmo IP, **até `register` e `login` de contas novas** passaram a responder 429 — o limite é por IP, não por conta.

Atrás do Gateway, sem o item 1 resolvido, o Store vê **o IP do Gateway para todos os clientes**: o limite viraria um só para a loja inteira, e alguns clientes tentando entrar bloqueariam todos. Confirmar a chave da partição e ler o IP real do `X-Forwarded-For` (vem junto com a correção do item 1).

## 4. O 429 foge do padrão de erro

```json
{"code":"Security.RateLimited","message":"Muitas requisições. Tente novamente depois."}
```

Todos os outros erros vêm em ProblemDetails (`type`, `title`, `status`, `code`, `traceId`). O 429 também **não manda `Retry-After`**, então a tela não consegue dizer quando tentar de novo. **Pedido:** ProblemDetails com `status: 429`, `code` e o cabeçalho `Retry-After` (o front já lê os dois).

---

## Para conferir com o back: validações que o front passou a cumprir

O front foi ajustado para o que o back exige hoje. Se alguma regra não for intencional, avisem:

| Regra do back | O que o front fazia | Agora |
|---|---|---|
| Produto: `height`, `width`, `length` > 0 | Não tinha os campos e mandava `0` (400) | Campos Altura, Largura, Comprimento (cm) e Peso obrigatórios, > 0 |
| Drop: `bannerImageUrl` obrigatório | Tratava como opcional ("Sem banner: usa a capa") e mandava vazio (400) | Sem banner, envia a capa como banner; capa obrigatória |
| `dateOfBirth` gravado como data (`1995-04-20T00:00:00Z`) | Convertia pelo fuso e cada "Salvar" voltava um dia | Data de calendário, sem fuso |

Unidade das dimensões: o front usa **cm** e o peso em **kg**. Confirmar se é a mesma do back (frete).

## 5. Sessões sem identificação do aparelho (task 28)

`GET auth/sessions` e `GET storefront/auth/sessions` devolvem só `familyId`, `createdAt`, `expiresAt` e `isCurrent`. A tela de segurança mostra início e validade, mas não consegue dizer qual aparelho ou navegador é cada sessão. Sugestão: incluir um resumo do `User-Agent` (ex.: "Chrome no Windows") e a data do último uso.

## 6. Lista de lojas não informa se a loja está pausada (task 28)

`MembershipChoice` (login, `enterprises/mine`) tem só `membershipId`, `enterpriseId`, `tradeName` e `kindId`. A escolha de loja não consegue mostrar o selo "pausada" pedido na task. Sugestão: acrescentar `isActive` da Enterprise.


## 7. Equipe e acessos (task 40)

- **Sem rota de "minhas permissões".** O painel lê os claims `permission` e `membership_kind` do access token. Funciona, mas depende do formato do JWT (uma permissão só vem como texto, não como lista). Sugestão: `GET auth/me/permissions` com a lista e o tipo de vínculo.
- **Sócio não vê a gestão de acesso.** A task pede leitura para o sócio-proprietário, mas todas as rotas de acesso (inclusive os GET) são `PrimaryOwnerOnly`. Hoje a aba Equipe fica escondida para quem não é o dono principal.
- **Membros sem nome.** `enterprise-memberships/get-all` não traz nome nem e-mail; o painel cruza com `employees/get-all`, e o sócio aparece como "Sócio-proprietário · membro #id". Sugestão: incluir `fullName` e `email` do usuário.
- **Transferência pendente não é listada.** Não há GET de `ownership-transfers`: depois de fechar a janela, o dono não consegue cancelar a transferência pelo painel.
- **Fraude, Financeiro, Auditoria e Empresa** não estão na matriz de permissões (só o dono principal acessa). O rail esconde esses módulos para os demais.

## 8. Produtos e variantes (task 33)

- **Erros sem motivo.** Habilitar variantes (ou excluir SKU) com saldo, preço abaixo do custo e dimensão zerada em produto físico voltam como 400 genérico `Validation.InvalidInput`, sem `detail`. A tela mostra uma mensagem montada pelo contexto. Sugestão: códigos próprios (ex.: `Inventory.StockInUse`, como já existe em outras rotas).
- **`ProductVariant.OptionSchema`** vem como erro de validação com o título genérico "Um ou mais erros de validação ocorreram".
- **Sem volta para produto simples.** Não existe rota para desabilitar as variantes depois de habilitar; a tela pede confirmação antes.
- **Lista sem nome da categoria nem saldo do produto.** `ProductResponse` só traz `categoryId` e o saldo por variante; a lista soma as variantes e busca as categorias à parte.

## 9. Estoque (task 34)

- **Conflito de versão é 409, não 412** (`Inventory.StaleVersion`). A tela trata o 409.
- **Reservas não são listadas** e a resposta não diz se a reserva é de pedido: os botões Liberar e Efetivar aparecem em toda reserva e o 409 `Inventory.OrderReservationProtected` vira mensagem. Sugestão: `GET inventory/reservations` e um campo `orderId`/`source`.
- **Movimentação sem nome do autor**: só `actorUserId`; a tabela mostra "#id".
- **`GET inventory/movements` não filtra por produto**, só por SKU; sem SKU a lista traz toda a loja e a tela mostra só as linhas do produto aberto. Sugestão: filtro `productId`.

## 10. Categorias (task 35)

- **`PUT categories/{id}/active`, `add` e `update` devolvem a entidade crua** (com `listProduct`, `listCategory`, `enterprise`…), diferente de `categories/tree` e `search`, que têm DTO. Sugestão: `CategoryResponse` nas três.
- **`add` e `update` devolvem lista com um item** (resquício do CRUD em lote).
- **Exclusão não informa quantos produtos há.** A tela consulta `products/search?categoryId&includeSubcategories` antes de abrir o diálogo para saber se pede destino.
- **Ordem dos irmãos não é validada**: `reorder` aceita ids de pais diferentes; a tela só manda irmãos.

## 11. Cupons (task 36)

- **Condições sem metadado.** `condition-types` e `condition-operators` devolvem só `id` e `description`. A tela não sabe quais operadores pedem segundo valor (entre, maior que e menor que) nem quais tipos são em dinheiro; hoje deduz pela descrição ("entre", " e ", "valor", "gasto"). Sugestão: `requiresSecondValue` no operador e `valueKind` (`money` | `count`) no tipo.
- **`availability` volta como número** (1 a 5) na resposta e aceita nome ou número no filtro. A tela usa a tabela `COUPON_AVAILABILITY` do `status.js`. Sugestão: serializar o enum como texto.
- **`add` e `update` devolvem lista com um item.**
- **Simulador sem resultado por condição**: `validate` devolve as condições do cupom, mas não quais foram atendidas; a tela mostra só o motivo da recusa.
- **Cliente do simulador** é digitado como número até a busca de clientes (task 38).

## 12. Pedidos (task 37)

- **Cancelar só exige `orders.cancel`**, e não `orders.manage`; com pedido pago, exige também `orders.refund` (403 `Security.PermissionRequired`). Não existe rota própria de estorno: o estorno é o cancelamento, e o pedido termina em Cancelado + Reembolso total (nunca em 7 Reembolsado). A tela bloqueia o botão antes, pelo token.
- **Histórico sem nome do autor**: só `actorId` e `source` (numérico). A tela mostra "Painel · usuário #id".
- **Erros de validação do envio** voltam como `ShipOrderCommand.Request.CarrierName` etc.; a tela mostra a primeira mensagem do campo.
- **Pedido de Drop continua no CRUD do Drop** (sem rotas de ciclo); a aba Drop de Pedidos mantém o fluxo atual.
- **Financeiro**: o reembolso e a emissão de nota da vitrine saíram da tela (o estorno é o cancelamento do pedido e `Invoice` não emite NF-e). O reembolso continua só para transações de drop.

## 13. Clientes (task 38)

- **A busca não devolve endereço nem CEP**, e a UF vem só como `stateId`. A ficha carrega `customers/get-by-id` para dados completos e `customers/{id}/addresses` para os endereços salvos (cliente sem endereço salvo mostra "Nenhum endereço salvo").
- **Filtro de documento saiu da lista** (pendente, validado, rejeitado, sem documento): `documents` não tem busca nem filtro por cliente, e a ficha ainda lê `documents/get-all` uma vez. Sugestão: `documentStatusId` na busca de clientes e `GET documents?referenceType&referenceId`.
- **Atividade em drops e sinais de fraude** seguem por `get-all` no Drop (sem busca por cliente).

## 14. Configurações comerciais (task 39)

- **O prazo de pagamento não aparece na rota pública.** `GET storefront/store` devolve moeda, pedido mínimo e limite de itens, mas não `pendingOrderExpirationMinutes`; o checkout (task 32) não consegue mostrar o prazo ao cliente. Sugestão: incluir o campo na resposta pública.
- **Mensagens de validação** chegam com o nome do campo em inglês separado ("min Order Value não pode ser negativo"). A tela barra antes do envio, com os mesmos limites, e usa texto próprio.

## 15. Domínio próprio (task 41)

- **O registro TXT só vem no cadastro.** A lista não devolve `recordName` nem `recordValue`: quem perder o valor precisa excluir o domínio e cadastrar de novo. Sugestão: devolver o desafio enquanto o domínio estiver pendente.
- **Só existe "verificado".** Não há estado pendente nem falhou no back; a tela monta os dois a partir das respostas da verificação (`Domain.OwnershipUnverified` e `Domain.DnsUnavailable`), então o estado "Não verificado" some ao recarregar a página.
- **Publicar domínio não verificado** volta como 400 genérico `Validation.InvalidInput`. A tela só oferece Publicar depois de verificado.
- **O domínio da plataforma** (`teste.stores.localhost`) aparece na lista como principal. Se outro domínio virar principal, o da plataforma pode ser excluído e a loja deixa de responder no endereço padrão; a tela não protege esse caso.
