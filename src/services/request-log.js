import { shallowRef } from 'vue';

// Últimas requisições disparadas pela camada de dados. Em modo mock, cada linha
// é a requisição REAL que iria ao Gateway: é a prova de que as rotas estão certas.
const MAX_ENTRIES = 30;

export const requestLog = shallowRef([]);

let nextId = 1;

export const logRequest = ({ method, url, status, body, simulated }) => {
  const entry = {
    id: nextId++,
    at: new Date(),
    method,
    url,
    status,
    body: body === undefined ? '' : JSON.stringify(body),
    simulated,
  };
  requestLog.value = [entry, ...requestLog.value].slice(0, MAX_ENTRIES);
};

export const clearRequestLog = () => {
  requestLog.value = [];
};
