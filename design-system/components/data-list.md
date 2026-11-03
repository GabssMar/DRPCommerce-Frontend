# Componente — Data list, Code, Funnel e Banner

**Classes:** `.ds-dl`, `.ds-code`, `.ds-funnel`, `.ds-banner` · **CSS:** `../styles/components.css` · **Status:** estável

## `.ds-dl` — valores rotulados

`<dl class="ds-dl">` com pares `dt`/`dd`: rótulo cinza à esquerda, valor tabular à direita (totais do pedido). `--labels` fixa a coluna do rótulo e alinha o valor à esquerda (ficha de cliente, detalhe de auditoria). O par final de total recebe `.ds-dl__total` no `dt` e no `dd`.

## `.ds-code` — bloco técnico

`<pre class="ds-code">` para JSON e valores de máquina (antes/depois na auditoria). Quebra linha em vez de estourar. `--changed` marca o "depois" com `--ds-status-live-bg`.

## `.ds-funnel` — funil

```
.ds-funnel
└── .ds-funnel__row   rótulo · .ds-meter(--critical) · número
```

A barra é proporcional à primeira etapa. Perdas (expirados, removidos) usam `.ds-meter--critical`. O número está sempre em texto ao lado da barra.

## `.ds-banner` — aviso de ambiente

Faixa fina no topo para dizer que os dados são simulados ou que a área não tem login. Fundo `--ds-status-scheduled-bg`. Não é toast e não some sozinha.
