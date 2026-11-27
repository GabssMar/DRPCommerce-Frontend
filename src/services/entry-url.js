// Endereços que chegam de fora do app (retornos configurados no back) viram rotas do hash.
// Roda antes do roteador (é o primeiro import do main.js), porque o roteador lê o hash
// quando o módulo carrega. O back recusa URL de retorno com "#", então os retornos usam
// caminho e query:
//
//   /admin/<tela>?…                        → /?…#/admin/<tela>
//     MercadoPago__BackofficeReturnUrl  = https://www.drpcommerce.com.br/admin/integracoes  (?mercadoPago=connected)
//     MelhorEnvio__BackofficeReturnUrl  = https://www.drpcommerce.com.br/admin/integracoes  (?melhorEnvio=connected)
//     PlatformBilling__ReturnUrl        = https://www.drpcommerce.com.br/admin/plano        (?billingReference=…)
//     Security__BackofficeUrl           = https://www.drpcommerce.com.br/admin
//   /{slug}/pagamento?orderId=N            → /{slug}/#/conta/pedidos/store/N
//   /{slug}/pagamento?dropOrderId=N        → /{slug}/#/conta/pedidos/drop/N
//     MercadoPago__PaymentReturnUrl     = https://www.drpcommerce.com.br/{storeSlug}/pagamento
//
// "admin" é reservado pelo back (StorefrontSlug.Normalize): nunca é nome de loja.
// Qualquer outro caminho dentro da loja volta para a raiz dela, sem perder o hash.
import { normalizeSlug } from './config';

const PAYMENT_RETURN = 'pagamento';

const entryRoute = ({ pathname, search, hash }) => {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(search);

  if (segments[0] === 'admin') {
    const screen = segments.slice(1).map(encodeURIComponent).join('/');
    return { path: '/', search, hash: `#/admin${screen ? `/${screen}` : ''}` };
  }

  const slug = normalizeSlug(segments[0]);
  if (!slug) return null;
  const home = `/${encodeURIComponent(slug)}/`;

  if (segments[1] === PAYMENT_RETURN) {
    const storeOrder = Number(query.get('orderId'));
    const dropOrder = Number(query.get('dropOrderId'));
    // Os demais parâmetros (status do Mercado Pago) não importam: o pedido mostra o que o back sabe.
    if (storeOrder > 0) return { path: home, search: '', hash: `#/conta/pedidos/store/${storeOrder}` };
    if (dropOrder > 0) return { path: home, search: '', hash: `#/conta/pedidos/drop/${dropOrder}` };
    return { path: home, search: '', hash: '#/conta/pedidos' };
  }

  // /loja (sem barra) ou /loja/qualquer-coisa: a loja vive em /loja/ e a rota no hash.
  if (pathname !== home) return { path: home, search, hash };
  return null;
};

const target = entryRoute(window.location);
if (target) window.history.replaceState(null, '', `${target.path}${target.search}${target.hash}`);
