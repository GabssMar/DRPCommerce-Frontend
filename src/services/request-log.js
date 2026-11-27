import { shallowRef } from 'vue';

// Últimas requisições disparadas pela camada de dados. Em modo mock, cada linha
// é a requisição REAL que iria ao Gateway: é a prova de que as rotas estão certas.
const MAX_ENTRIES = 30;

export const requestLog = shallowRef([]);

let nextId = 1;

// O painel mostra o corpo das requisições: senhas e tokens nunca aparecem nele.
const SECRET_FIELDS = /password|token|secret/i;
const redact = (key, value) => (SECRET_FIELDS.test(key) && typeof value === 'string' ? '•••' : value);

// Só no servidor de desenvolvimento: em produção nada é guardado na memória da aba.
export const logRequest = ({ method, url, status, body, simulated }) => {
  if (!import.meta.env.DEV) return;
  const entry = {
    id: nextId++,
    at: new Date(),
    method,
    url,
    status,
    body: body === undefined ? '' : JSON.stringify(body, redact),
    simulated,
  };
  requestLog.value = [entry, ...requestLog.value].slice(0, MAX_ENTRIES);
};

export const clearRequestLog = () => {
  requestLog.value = [];
};
