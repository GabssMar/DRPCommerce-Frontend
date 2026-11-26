import { STATES } from '../status';

// Endereços de entrega do cliente no mock (task 31), com as regras do back
// (CustomerAddressBook): no máximo 20; o primeiro vira padrão; um padrão só;
// excluir o padrão promove o mais recente. Toda escrita devolve a lista inteira,
// o padrão primeiro.
const MAX_PER_CUSTOMER = 20;
const LIMITS = { label: 50, recipientName: 200, addressLine: 200, city: 100, zipCode: 20, country: 100 };

export function createAddressesMock({ data, ok, problem }) {
  const table = () => {
    const d = data();
    if (!d['store/customer-addresses']) {
      // Cliente de exemplo (id 1) começa com o endereço do cadastro e o do trabalho.
      const camila = d['store/customers'].find((c) => c.id === 1);
      d['store/customer-addresses'] = camila ? [
        {
          id: 1, customerId: 1, label: 'Casa', recipientName: camila.fullName, addressLine: camila.addressLine,
          city: camila.city, stateId: camila.stateId, zipCode: camila.zipCode, country: 'Brasil', isDefault: true,
        },
        {
          id: 2, customerId: 1, label: 'Trabalho', recipientName: camila.fullName, addressLine: 'Av. Paulista, 1000, 12º andar, Bela Vista',
          city: 'São Paulo', stateId: 25, zipCode: '01310-100', country: 'Brasil', isDefault: false,
        },
      ] : [];
    }
    return d['store/customer-addresses'];
  };

  const response = (a) => ({
    id: a.id, label: a.label, recipientName: a.recipientName, addressLine: a.addressLine, city: a.city,
    stateId: a.stateId, state: STATES.find((s) => s.id === a.stateId)?.name ?? '', zipCode: a.zipCode,
    country: a.country, isDefault: a.isDefault,
  });

  const mine = (customerId) => table().filter((a) => a.customerId === customerId);
  const list = (customerId) => ok(mine(customerId).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.id - a.id).map(response));

  const makeDefault = (customerId, address) => {
    mine(customerId).forEach((a) => {
      a.isDefault = a === address;
    });
  };

  // Mesmas mensagens do CustomerAddressRequestValidator, com o campo em `errors`.
  const validate = (body) => {
    const errors = {};
    const text = (key) => String(body?.[key] ?? '').trim();
    if (!text('addressLine')) errors.AddressLine = ['AddressLine não pode ser vazio.'];
    if (!text('city')) errors.City = ['City não pode ser vazio.'];
    if (!text('zipCode')) errors.ZipCode = ['ZipCode não pode ser vazio.'];
    if (!STATES.some((s) => s.id === Number(body?.stateId))) errors.StateId = ['StateId inválido.'];
    Object.entries(LIMITS).forEach(([key, max]) => {
      if (text(key).length > max) errors[key.charAt(0).toUpperCase() + key.slice(1)] = [`Não pode ter mais de ${max} caracteres.`];
    });
    if (!Object.keys(errors).length) return null;
    const result = problem(400, 'Validation', 'Um ou mais campos são inválidos.');
    result.data.errors = errors;
    return result;
  };

  const fields = (body) => ({
    label: String(body.label ?? '').trim(),
    recipientName: String(body.recipientName ?? '').trim(),
    addressLine: body.addressLine.trim(),
    city: body.city.trim(),
    stateId: Number(body.stateId),
    zipCode: body.zipCode.trim(),
    country: String(body.country ?? '').trim() || 'Brasil',
  });

  /** @returns resposta ou null se a rota não é de endereços */
  function route(method, path, body, who) {
    if (path !== 'me/addresses' && !path.startsWith('me/addresses/')) return null;
    if (!who || who.realm !== 'storefront') return problem(401, 'Security.Unauthenticated', 'Autenticação necessária.');
    const customerId = who.id;

    if (path === 'me/addresses' && method === 'GET') return list(customerId);

    if (path === 'me/addresses' && method === 'POST') {
      const invalid = validate(body);
      if (invalid) return invalid;
      if (mine(customerId).length >= MAX_PER_CUSTOMER) {
        return problem(400, 'Validation', `O cliente pode ter no máximo ${MAX_PER_CUSTOMER} endereços.`);
      }
      const rows = table();
      const address = { id: rows.reduce((max, a) => Math.max(max, a.id), 0) + 1, customerId, ...fields(body), isDefault: false };
      const first = mine(customerId).length === 0;
      rows.push(address);
      if (body.isDefault || first) makeDefault(customerId, address);
      return list(customerId);
    }

    const match = path.match(/^me\/addresses\/(\d+)(\/default)?$/);
    if (!match) return null;
    const address = mine(customerId).find((a) => a.id === Number(match[1]));
    if (!address) return problem(404, 'CustomerAddress.NotFound', 'Endereço não encontrado.');

    if (match[2] && method === 'PUT') {
      makeDefault(customerId, address);
      return list(customerId);
    }
    if (!match[2] && method === 'PUT') {
      const invalid = validate(body);
      if (invalid) return invalid;
      Object.assign(address, fields(body));
      if (body.isDefault) makeDefault(customerId, address);
      return list(customerId);
    }
    if (!match[2] && method === 'DELETE') {
      const rows = table();
      rows.splice(rows.indexOf(address), 1);
      if (address.isDefault) {
        const next = mine(customerId).sort((a, b) => b.id - a.id)[0];
        if (next) next.isDefault = true;
      }
      return list(customerId);
    }
    return null;
  }

  return { route };
}
