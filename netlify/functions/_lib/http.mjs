// Utilitários comuns às funções: controle de acesso e respostas de erro.

export function jsonError(status, message, extra = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

// Se APP_ACCESS_CODE estiver definido no Netlify, toda chamada precisa enviar
// o mesmo código no header x-access-code. Protege o orçamento de API de quem
// descobrir a URL pública do app.
export function checkAccess(req) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return null;
  if (req.headers.get('x-access-code') !== expected) {
    return jsonError(401, 'Código de acesso inválido.', { code: 'bad_access_code' });
  }
  return null;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}

export class MissingEnvError extends Error {
  constructor(name) {
    super(`Variável de ambiente ${name} não configurada no Netlify.`);
    this.name = 'MissingEnvError';
  }
}

export function handleError(err) {
  if (err instanceof MissingEnvError) return jsonError(500, err.message, { code: 'missing_env' });
  console.error(err);
  return jsonError(502, err?.message || 'Erro inesperado.');
}

export function methodGuard(req) {
  return req.method === 'POST' ? null : jsonError(405, 'Use POST.');
}
