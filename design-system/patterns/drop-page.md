# Padrão — Página de Drop (fila + checkout)

A tela central do produto. Mapeia os componentes da referência para o domínio (ver `../ANALYSIS.md` §3).

## Composição

```
h1 "Nome do drop"                          + ds-badge--live "AO VIVO"
┌─ ds-grid--sidebar ──────────────────────────────────────────────┐
│ coluna principal (1.4fr)          │ lateral (min 280px)          │
│                                   │                              │
│ ds-card--flush                    │ ds-card--inverse             │
│   imagem do produto               │   COUNTDOWN (ds-stat--lg)    │
│                                   │   ds-btn--primary--block     │
│ ds-card  ProductDetails           │                              │
│   nome, preço, descrição          │ ds-card  QueueStatus         │
│                                   │   posição (ds-stat--lg)      │
│ ds-card  StockProgress            │   estimativa · ds-meter      │
│   ds-meter + ds-stat-grid         │   ds-avatar-group da fila    │
└─────────────────────────────────────────────────────────────────┘
```

Abaixo de 1024px vira uma coluna, **e o card de countdown + CTA vai para o topo** (ou vira barra fixa no rodapé).

## Máquina de estados da tela

| Estado | Badge | CTA | Cor dominante |
|---|---|---|---|
| Drop agendado | `--scheduled` "Abre em HH:MM" | `--secondary` "Avise-me" | azul/âmbar |
| Fila aberta, fora da fila | `--live` "AO VIVO" | `--primary` "Entrar na fila" | tinta |
| Na fila aguardando | `--waiting` "Posição 127" | `--secondary` "Sair da fila" | azul |
| É a sua vez | `--live` "Sua vez!" | `--primary --lg` "Finalizar compra" | coral + tinta |
| Janela expirando (< 60s) | `--live` "Expira em 0:42" | `--primary --lg` | coral |
| Pedido confirmado | `--success` | `--secondary` "Ver pedido" | verde |
| Esgotado / encerrado | `--done` | desabilitado + motivo | cinza |

Cada transição precisa ser anunciada em `aria-live="polite"` — e "É a sua vez" em `assertive`.

## Regras específicas do domínio

1. **Countdown é dado, não enfeite.** `tabular-nums`, sem animação de número. Abaixo de 60s, cor → `--ds-text-danger` e badge → `--live`.
2. **Posição na fila** é o maior número da tela (`.ds-stat--lg`). Sempre acompanhada de estimativa em linguagem natural ("≈ 4 min").
3. **Escassez é informação, não pressão.** Mostre estoque real com `.ds-meter`; `--critical` só quando ≤ 20%. Nada de contador falso ou "27 pessoas vendo agora" inventado.
4. **Nunca mova o CTA de lugar** entre estados — só troque rótulo e variante. Usuário em fila fica olhando a tela; botão que pula causa clique errado.
5. **Expiração**: ao expirar a janela de checkout, feche o modal, explique o motivo e ofereça o próximo passo. Nunca deixe o usuário submeter um pedido já expirado.
6. **Polling**: `QueueStatus` consulta a cada 3s. A UI não pode piscar a cada resposta — atualize só o que mudou e mantenha skeleton apenas na primeira carga.

## Mapeamento dos componentes existentes

| Arquivo atual | Componentes do DS |
|---|---|
| `src/components/QueueStatus.vue` | `ds-card`, `ds-stat--lg`, `ds-badge`, `ds-avatar-group`, `ds-btn` |
| `src/components/Countdown.vue` | `ds-card--inverse`, `ds-stat--lg`, `ds-badge--live` |
| `src/components/StockProgress.vue` | `ds-meter`, `ds-progress`, `ds-stat-grid` |
| `src/components/ProductDetails.vue` | `ds-card`, `ds-stat`, `ds-title` |
| `src/components/CheckoutModal.vue` | `ds-overlay`, `ds-modal`, `ds-field`, `ds-btn` |
| `src/components/EventPortal.vue` | `ds-grid--3`, `ds-card--interactive`, `ds-badge` |
| `src/components/SimulationPanel.vue` | `ds-card--sunken`, `ds-field`, `ds-btn--ghost` |
