# [Integrações · Front-end] Pagamento Mercado Pago e frete Melhor Envio no checkout

**Bloqueada pelo back-end** · **Depende de:** 32, 37 · Fonte: [PlanejamentoIntegracoes.md](https://github.com/joseHenrique346/DRPCommerce-Backend/blob/main/Documentation/Shared/PlanejamentoIntegracoes.md)

## Funcionalidade nova

O cliente **paga de verdade** (Pix ou cartão pelo Mercado Pago) e **escolhe o frete** cotado pelo Melhor Envio. O lojista gera a etiqueta pelo painel.

## Estado atual

Mercado Pago e Melhor Envio foram escolhidos e as contas existem, mas os **adapters do back não foram implementados**. Hoje o pagamento é manual (`ManualPaymentGateway`) e o frete é **zero**. Não há rota de cotação, sessão real de pagamento nem webhook. Esta task registra o que o front vai precisar, para não desenhar o checkout da task 32 de um jeito que impeça isso.

## O que fazer quando o back liberar

1. **Frete:** passo "Entrega" com as opções cotadas no **back** (serviço, prazo, valor e validade). O cliente escolhe uma cotação válida; o front nunca envia preço de frete. Cotação vencida obriga a cotar de novo. Indisponibilidade **não** vira frete grátis.
2. **Pagamento:** a resposta do checkout traz a sessão (link, QR Pix ou instruções). O retorno do navegador **não confirma** a venda: a tela do pedido consulta o status até o back confirmar pelo webhook ou pela reconciliação.
3. **Painel:** em pedidos pagos, "Gerar etiqueta" com os estados comprada, gerada, postada e entregue, e impressão com acesso restrito.
4. **Estorno real:** estado "reembolso pendente" no detalhe do pedido.

## Preparar já (na task 32)

- O passo de entrega já com espaço para escolher a opção de frete.
- A tela do pedido já preparada para polling de status de pagamento.

## Critérios de aceite

- [ ] Só começa quando o back publicar as rotas de cotação e de sessão de pagamento
- [ ] Nenhum valor de frete ou pagamento calculado no front

## Para o Claude Code

> Não implemente adapters nem chame APIs do Mercado Pago ou do Melhor Envio pelo navegador. Tudo passa pelo Store.
