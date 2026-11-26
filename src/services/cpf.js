// CPF da fila do drop (task 17). A tela valida só para avisar cedo; quem decide é o
// back (DropPurchaseIdentity.NormalizeCpf). O CPF nunca é guardado no navegador.

export const cpfDigits = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 11);

/** 12345678909 -> 123.456.789-09 (parcial enquanto digita). */
export const formatCpf = (value) => {
  const d = cpfDigits(value);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join('.') + (d.length > 9 ? `-${d.slice(9)}` : '');
};

/** Dígitos verificadores; recusa sequências repetidas (111.111.111-11). */
export const isValidCpf = (value) => {
  const cpf = cpfDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length) => {
    const sum = [...cpf.slice(0, length)].reduce((acc, digit, i) => acc + Number(digit) * (length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
};
