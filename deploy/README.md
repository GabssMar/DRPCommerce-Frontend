# Publicação do front na Oracle

O site inteiro responde em **https://www.drpcommerce.com.br**, num host só:

| Caminho | Quem atende |
|---|---|
| `/api/store/…`, `/api/drop/…`, `/health` | Gateway (YARP) → Store / Drop, como hoje |
| qualquer outro | Gateway → **este container** (nginx com o build do front) |

| Endereço | O que é |
|---|---|
| `/` | Plataforma: apresentação, planos e cadastro de lojista |
| `/#/admin` | Painel da loja (login da equipe) |
| `/nome-da-loja/` | Loja do cliente (vitrine, drops, conta) |
| `/nome-da-loja/pagamento?orderId=N` | Volta do Mercado Pago para o pedido |
| `/admin/integracoes`, `/admin/plano` | Voltas do OAuth (Mercado Pago, Melhor Envio) e da assinatura |

Front e API no mesmo host evitam CORS entre origens e mantêm o cookie de sessão
(`__Host-…`, `SameSite=Strict`) funcionando. `admin` é um nome reservado pelo back:
nenhuma loja pode usá-lo como slug.

## 1. Imagem

Na raiz deste repositório, com Docker em Linux containers:

```bash
docker buildx build --platform linux/arm64 --load -t drpcommerce/front:oracle-arm64 .
docker image inspect drpcommerce/front:oracle-arm64 --format '{{.Os}}/{{.Architecture}}'   # linux/arm64
docker image save -o front-image.tar drpcommerce/front:oracle-arm64
```

O build roda `npm run ds:check` e `npm run build` em modo `http`, com o painel ligado
(`VITE_ADMIN_ENABLED=true`). As variáveis ficam gravadas na imagem: para mudar, gere de novo.
Prefira tags versionadas (`drpcommerce/front:2026.11.27`) e atualize `FRONT_IMAGE`.

## 2. Container (VM do Gateway, `10.0.0.7`)

Copie `deploy/compose.yaml`, `deploy/.env.example` e a imagem para a VM:

```bash
docker load -i front-image.tar
cp .env.example .env          # só na primeira instalação
docker compose config --quiet
docker compose up -d --pull never
docker compose ps             # front healthy
curl -s http://10.0.0.7:8081/healthz   # ok
```

O container roda sem root, com sistema de arquivos somente leitura, e escuta só no IP
privado (`10.0.0.7:8081`). A porta não deve ser aberta para a internet.

## 3. Gateway: rota para o front

Acrescente ao `.env` do Gateway (mesma VM) e recrie o container
(`docker compose up -d --pull never`). O YARP lê essas chaves junto com o `appsettings.json`:

```bash
ReverseProxy__Routes__rota_front__ClusterId=cluster_front
ReverseProxy__Routes__rota_front__Match__Path=/{**catch-all}
ReverseProxy__Routes__rota_front__Order=1000
ReverseProxy__Routes__rota_front__Transforms__0__X-Forwarded=Set
ReverseProxy__Clusters__cluster_front__Destinations__destino_principal__Address=http://10.0.0.7:8081/

AllowedHosts=www.drpcommerce.com.br;drpcommerce.com.br;127.0.0.1;localhost
```

`Order=1000` deixa a rota do front por último: `/api/store/…`, `/api/drop/…` e `/health`
continuam indo para as APIs. O bloqueio de `/api/*/api/internal` do Gateway não muda.

**Certificado:** o PFX do Gateway precisa cobrir `www.drpcommerce.com.br` e, para o
redirecionamento abaixo, `drpcommerce.com.br`.

**Sem www:** o nginx do front redireciona `drpcommerce.com.br` para
`https://www.drpcommerce.com.br` (pelo `X-Forwarded-Host`), para a sessão ficar num host só.

## 4. DNS (Registro.br)

| Nome | Tipo | Valor |
|---|---|---|
| `www.drpcommerce.com.br` | A | `147.15.67.122` |
| `drpcommerce.com.br` | A | `147.15.67.122` |

## 5. Variáveis do back que dependem do endereço do front

**Store** (`.env` da `vm-api-vitrine`):

```bash
Security__StorefrontBaseUrl=https://www.drpcommerce.com.br
Security__StorefrontApiBaseUrl=/api/store
Security__BackofficeUrl=https://www.drpcommerce.com.br/admin
Security__AllowedOrigins__0=https://www.drpcommerce.com.br
AllowedHosts=www.drpcommerce.com.br;drpcommerce.com.br;10.0.2.96;127.0.0.1;localhost

MercadoPago__PublicApiBaseUrl=https://www.drpcommerce.com.br/api/store
MercadoPago__PaymentReturnUrl=https://www.drpcommerce.com.br/{storeSlug}/pagamento
MercadoPago__BackofficeReturnUrl=https://www.drpcommerce.com.br/admin/integracoes
MelhorEnvio__BackofficeReturnUrl=https://www.drpcommerce.com.br/admin/integracoes
PlatformBilling__ReturnUrl=https://www.drpcommerce.com.br/admin/plano
```

**Drop** (`.env` da `vm-api-drop`):

```bash
Security__StorefrontBaseUrl=https://www.drpcommerce.com.br
Security__BackofficeUrl=https://www.drpcommerce.com.br/admin
Security__AllowedOrigins__0=https://www.drpcommerce.com.br
AllowedHosts=www.drpcommerce.com.br;drpcommerce.com.br;10.0.2.85;127.0.0.1;localhost
DropQueue__PurchaseIdentityKey='SEGREDO_COM_32_OU_MAIS_CARACTERES'
```

Sem `DropQueue__PurchaseIdentityKey`, entrar na fila de um drop responde 503. Não troque a
chave com evento em andamento (ela faz parte da franquia por CPF).

As demais credenciais (`MercadoPago__ClientId`, `ClientSecret`, `WebhookSecret`,
`MelhorEnvio__*`, `PlatformBilling__*`) seguem a documentação do back
(`Documentation/Shared/MercadoPago.md` e `MelhorEnvio.md`). Mantenha
`MercadoPago__AllowProduction=false` até homologar.

## 6. Conferência depois de publicar

```text
https://www.drpcommerce.com.br/                    apresentação e planos
https://www.drpcommerce.com.br/#/admin             login do painel
https://www.drpcommerce.com.br/nome-da-loja/       loja (troque pelo slug de uma loja ativa)
https://www.drpcommerce.com.br/health              Gateway
https://www.drpcommerce.com.br/api/store/health    Store
https://www.drpcommerce.com.br/api/drop/health     Drop
https://drpcommerce.com.br/                        deve redirecionar para www
```

Entre no painel, dê F5 e confira que a sessão continua (cookie de renovação). Na loja, faça o
mesmo com um cliente.

## Atualizar

Gere a imagem nova, carregue na VM, ajuste `FRONT_IMAGE` no `.env` e rode
`docker compose up -d --pull never`. O `index.html` não fica em cache; os arquivos de
`/assets` têm hash no nome, então a versão nova chega na hora.
