<script setup>
import { clearRequestLog, requestLog } from '../../services/request-log';
import { IS_MOCK } from '../../services/config';
import { formatTimeSec } from '../../services/format';

// Últimas requisições da camada de dados. Em modo mock, cada linha é a
// requisição real que o front dispararia no Gateway: é a prova das rotas.
const statusTone = (status) => (status >= 500 || status === 0 ? 'live' : status >= 400 ? 'scheduled' : 'success');
</script>

<template>
  <details class="ds-card ds-card--flush">
    <summary class="ds-table-header">
      <span class="ds-cluster ds-cluster--2">
        <strong class="ds-text-medium">Requisições</strong>
        <span class="ds-text-xs ds-text-secondary">
          {{ IS_MOCK ? 'simuladas: mesmas rotas e corpos que iriam ao Gateway' : 'enviadas ao Gateway' }}
        </span>
      </span>
      <span class="ds-badge">{{ requestLog.length }}</span>
    </summary>
    <div class="ds-table-scroll">
      <table class="ds-table ds-text-sm">
        <caption class="ds-sr-only">
          Últimas requisições
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Hora
            </th>
            <th scope="col">
              Método
            </th>
            <th scope="col">
              Rota
            </th>
            <th scope="col">
              Status
            </th>
            <th scope="col">
              Corpo
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in requestLog"
            :key="entry.id"
          >
            <td class="ds-numeric ds-nowrap">
              {{ formatTimeSec(entry.at) }}
            </td>
            <td class="ds-mono">
              {{ entry.method }}
            </td>
            <td class="ds-mono">
              {{ entry.url }}
            </td>
            <td>
              <span :class="['ds-badge', `ds-badge--${statusTone(entry.status)}`]">{{ entry.status || 'rede' }}</span>
            </td>
            <td class="ds-mono ds-text-xs ds-text-secondary">
              {{ entry.body.length > 120 ? `${entry.body.slice(0, 120)}…` : entry.body }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="ds-table-footer">
      <span class="ds-hint">As 30 mais recentes, da mais nova para a mais antiga.</span>
      <button
        type="button"
        class="ds-btn ds-btn--ghost ds-btn--sm"
        :disabled="!requestLog.length"
        @click="clearRequestLog"
      >
        Limpar
      </button>
    </div>
  </details>
</template>
