# Telas do design "DRPCommerce — Telas futuras": tela → rota → back-end

Implementação das 19 telas do canvas de design (C3–C13 do cliente, E1–E13 do painel).
Painel (E5–E9, E12) atualizado em **2026-11-26** com as rotas das tasks 28 e 33 a 41. Demais rotas conferidas no `origin/main` do back-end em **2026-10-28** (commit `2088271`), não nas
notas do canvas: onde o back-end mudou, vale o back-end. Esta página é a lista do que o
front chama e do que ainda falta do lado do servidor.

## Como rodar

```bash
npm run dev                 # back-end real pelo Gateway (VITE_API_MODE=http, padrão)
VITE_API_MODE=mock npm run dev   # dados de exemplo, sem servidor (só em dev)
# loja:   http://localhost:5173/#/drops/1/inscricao · #/conta · #/conta/pedidos
# painel: http://localhost:5173/#/admin/dashboard  (só em dev ou com VITE_ADMIN_ENABLED=true)
```

O modo mock responde nas **mesmas URLs** do Gateway (`src/services/mock/server.js`), com os
nomes de campo das entidades e o envelope `Result<T>` dos CRUDs. O bloco "Requisições" no pé
do painel mostra cada chamada que iria ao back-end. Para o servidor real: `VITE_API_MODE=http`
em `.env.local` (ver `.env.example`).

## Camada de dados (`src/services/`)

| Arquivo | Papel |
|---|---|
| `http.js` | `fetch` único: Bearer, timeout, envelope `Result<T>` ou objeto cru, `ApiError`, retry após refresh |
| `auth.js` | login/cadastro/refresh com CSRF (`X-CSRF-TOKEN`) — cliente em `/api/store/storefront/auth`, equipe em `/api/store/auth` |
| `resources.js` | CRUD genérico dos BaseControllers. Traduz entidade → comando (`dropEventStatusId` → `statusId`…), desembrulha `content[0]` e faz `patch` reenviando o objeto inteiro |
| `client-api.js` | funções das telas do cliente |
| `admin-api.js` | recursos e operações compostas do painel |
| `sales.js` | agregação de vendas (fuso `America/Sao_Paulo`, sem cancelados) |
| `status.js` | ids de status do seed do banco |
| `mock/` | seed determinístico + servidor falso |

O simulador antigo (`src/services/api.js`) continua servindo portal, detalhe do drop, vitrine
e sacola até as tasks 15–18.

## Cliente (loja)

| Tela | Rota no front | Endpoints | Situação |
|---|---|---|---|
| C3 Inscrição prévia | `#/drops/:id/inscricao` | `GET drop-events/get-by-id/{id}` · `GET storefront/drop/registrations` · `POST storefront/drop/events/{id}/register` · `POST drop-notifications/add-range` (canais) · `DELETE drop-registrations/delete/{id}` | ⚠ agenda e canais usam CRUD |
| C6 Esgotado + lista de espera | `#/drops/:id/lista-de-espera` | `GET drop-products/get-all` + `drop-reservations/get-all` (4 s) · `GET storefront/drop/waitlist` · `POST waitlist-entries/add` · `DELETE waitlist-entries/delete/{id}` | ⚠ entrar/sair usam CRUD · "Ir para o checkout" desabilitado |
| C10 Checkout da vitrine | `#/checkout` | `GET storefront/me` · `GET storefront/products` · `GET coupons/get-all` · `POST orders/add` → `order-items/add-range` → `transactions/add` → `PUT coupons/update` | ⚠ totais calculados no front |
| C11 Conta | `#/conta` | `POST storefront/auth/register \| login \| change-password` · `GET/PUT/DELETE storefront/me` · `GET documents/get-all` + `POST documents/add` | ✅ (documento via CRUD) |
| C12 Pedidos e rastreio | `#/conta/pedidos(/:source/:id)` | `GET storefront/orders(/{id})` · `GET storefront/drop/orders(/{id})` · `GET orders\|drop-orders/get-by-id` · `GET order-items/get-all` · `GET shipments/get-all` · `GET invoices/get-all` · `PUT …/update` (cancelar) | ⚠ totais e endereço via CRUD |
| C13 Notificações | `#/conta/notificacoes` | `GET storefront/drop/notifications` · `POST drop-notifications/get-list-by-list-id` · `DELETE drop-notifications/delete/{id}` | ⚠ "lida" e preferências só no navegador |

## Painel da loja

| Tela | Rota no front | Endpoints | Situação |
|---|---|---|---|
| E1 Dashboard de vendas | `#/admin/dashboard` | `GET drop-orders/get-all` + `orders/get-all` + itens | ⚠ soma no front (falta `sales-summary`, task 19) |
| E2 Editor de drop | `#/admin/drops/:id` · `#/admin/drops/novo` | `drop-events` add/update · `drop-products` add-range/update-range/delete-range · `drop-coupons` add/update/delete · `GET products/get-all` | ✅ · ⚠ janela de checkout sem campo |
| E3 Drop ao vivo | `#/admin/ao-vivo(/:id)` | `queue-entries`, `drop-reservations`, `waitlist-entries`, `fraud-signals`, `drop-audit-logs`, `drop-orders` (get-all) · `PUT queue-entries/update-range` (chamar lote) · `PUT drop-events/update` (encerrar) | ⚠ "Pausar fila" e ritmo automático sem campo |
| E4 Inscrições, espera, avisos | `#/admin/drops/:id/inscricoes \| lista-de-espera \| avisos` | `drop-registrations` get-all/update-range · `waitlist-entries` get-all/update-range · `drop-notifications` get-all/add-range · `documents/get-all` | ✅ |
| E5 Pedidos | `#/admin/pedidos(/:id)` | vitrine: `GET orders/search` · `GET orders/{id}/detail` · `POST orders/{id}/confirm-payment \| start-processing \| ship \| deliver \| cancel` (task 37) · drop: `drop-orders/get-all` + `POST drop-purchases/{id}/fulfillment` · `customers/get-list-by-list-id` | ✅ vitrine testada contra o back local em 22/11 · ⚠ drop sem cancelamento nem estorno no back |
| E6 Financeiro | `#/admin/financeiro(/notas)` | `drop-transactions` + `transactions` get-all (só leitura) · `invoices` get-all/update | ⚠ transações só leitura: o pagamento da vitrine é confirmado e estornado no pedido (E5) |
| E7 Catálogo e estoque | `#/admin/catalogo` · `#/admin/catalogo/produtos/:id(/:tab)` · `#/admin/catalogo/categorias` | `GET products/search` · `products/{id}/details \| pricing \| dimensions \| category \| active` · `products/{id}/variants…` (task 33) · `inventory/variants/{id}(/adjust)` · `inventory/movements` · `inventory/reservations…` (task 34) · `categories/tree` · `categories/{id}/active` · `categories/reorder` · `categories/delete-with-products` (task 35) | ✅ testado contra o back local em 22/11 |
| E8 Cupons | `#/admin/catalogo/cupons` | `GET coupons/search` · `coupons/add \| update` · `PUT coupons/{id}/activation` (corpo booleano) · `coupons/condition-types \| condition-operators` · `GET coupons/validate` (task 36) · drop: `drop-coupons` get-all/add/update | ✅ testado contra o back local em 22/11 |
| E9 Clientes | `#/admin/clientes` | `GET customers/search` (métricas do back) · `customers/get-by-id` · `GET customers/{id}/addresses` · `GET orders/search?CustomerId` (task 38) · `documents` get-all/update · inscrições, filas e sinais (get-all) | ✅ testado contra o back local em 22/11 |
| E10 Sinais de fraude | `#/admin/fraude` | `fraud-signals` get-all/update · `PUT queue-entries/update-range` (statusId 6) · `POST drop-audit-logs/add` | ✅ · auditoria gravada pelo front |
| E11 Fornecedores e serviços | `#/admin/catalogo/fornecedores` | `suppliers` + `services` get-all/add/update · `categories/get-all` | ⚠ e-mail/telefone são value objects |
| E12 Equipe, empresa e configurações | `#/admin/configuracoes(/equipe \| vendas \| dominios \| empresa \| auditoria \| seguranca)` · `#/admin/convite` | `enterprise-memberships…` · `membership-access-roles/get-all` · `access-roles…` · `access-role-permissions/get-all` · `permissions/get-all` · `employees/{id}/deactivate` · `invitations` · `ownership-transfers` · `identity/*/accept` (task 40) · `GET/PUT store-settings` (task 39) · `enterprise-domains…` (task 41) · `auth/sessions` · `auth/change-password` (task 28) · `enterprises/mine \| current` | ✅ testado contra o back local em 22/11 · ⚠ só o dono principal gerencia acessos e domínios |
| E13 Auditoria | `#/admin/configuracoes/auditoria` | `GET drop-audit-logs/get-all` · `POST employees/get-list-by-list-id` · `POST customers/get-list-by-list-id` | ✅ |

Prefixos no Gateway: `drop-*`, `queue-*`, `waitlist-*`, `fraud-*` e `storefront/drop/*` ficam em `/api/drop`; o resto em `/api/store`.

## O que mudou em relação às notas do canvas

| Nota do design | No back-end atual | No front |
|---|---|---|
| C3 inscrição via `POST drop-registrations/add` | existe `POST storefront/drop/events/{id}/register` (valida janela, idempotente) | usa a rota do storefront |
| C11 "precisa de auth/register" | existe `storefront/auth/register`, `login`, `change-password` e `storefront/me` | cadastro, login, perfil e senha usam essas rotas |
| C12 lista via `get-all` filtrado | existem `storefront/orders` e `storefront/drop/orders` | lista pelo storefront, detalhe completo pelo CRUD |
| C13 lista via `get-all` filtrado | existe `storefront/drop/notifications` | lista pelo storefront |
| E12 "roles" | o cargo é `employee-positions`; `access-roles` são papéis de permissão | cargos = `employee-positions`; convite usa `access-roles` |
| E12 `enterprises/get-by-id` + `update` | `GET enterprises/mine` + `PUT enterprises/current` | usa as rotas novas |
| E12 "+ Convidar" sem rota | existe `POST /api/store/invitations` | convite por e-mail |

## Pendências do back-end que as telas expõem

1. **Gateway**: `PathRemovePrefix` ainda remove `/api/drop` e `/api/store`, mas os controllers estão em `/api/...` — toda chamada pelo Gateway dá 404 (task 10). O modo `http` só funciona depois disso.
2. **Rotas de cliente que faltam no storefront**: entrar/sair da lista de espera, escolher canais de aviso, cancelar inscrição, excluir notificação, enviar documento e criar pedido da vitrine. Hoje o front usa o CRUD administrativo com o token do cliente; o back provavelmente vai recusar (403).
3. **Pedido da vitrine**: `orders/add` recebe totais do navegador e `shippingState` como texto (a entidade guarda `shippingStateId`). Falta um `checkout` que calcule no servidor.
4. **Estoque em `Product`** e `POST products/adjust-stock` (task 19). Sem isso, a coluna de estoque do catálogo fica vazia e o ajuste responde 404.
5. **`sales-summary`** e **`get-paged`** (task 19): o dashboard e as listas agregam e paginam no front.
6. **Campos sem lugar no domínio**: janela de checkout do drop, pausa e ritmo da fila, "lida" e preferências de notificação, envio e nota fiscal de pedido de drop, checkout a partir da lista de espera (a reserva exige `queueEntryId`).
7. **Empresa**: não há GET com razão social e endereço; o formulário pede tudo de novo.
8. **Value objects** (`email`/`phone` de Supplier e Enterprise): o front envia `{ value }`; confirmar se o comando desserializa.
