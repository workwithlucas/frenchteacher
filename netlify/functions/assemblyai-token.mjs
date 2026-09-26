// Emite um token temporário da AssemblyAI pra o navegador abrir o WebSocket de streaming
// diretamente, sem expor a chave permanente no cliente (só usado nos turnos de repetição
// guiada — o resto da fala continua na Web Speech API, sem passar por aqui).
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';

// Tempo que o navegador tem pra abrir o WebSocket antes do token expirar (não é a duração
// da sessão de captura em si, que pode continuar depois disso).
const EXPIRES_IN_SECONDS = 60;

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  try {
    const apiKey = requireEnv('ASSEMBLYAI_API_KEY');
    const url = `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${EXPIRES_IN_SECONDS}`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      const detail = await res.text();
      return jsonError(res.status, `AssemblyAI falhou ao emitir token (${res.status}).`, {
        detail: detail.slice(0, 500),
      });
    }
    const data = await res.json();
    return Response.json({ token: data.token });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: '/api/assemblyai-token' };
