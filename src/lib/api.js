// Chamadas às Netlify Functions (/api/*). As chaves de API ficam só no servidor.
import { loadAccessCode } from './storage.js';
import { STREAM_ERROR_MARKER } from '../../shared/protocol.js';

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function headers(extra = {}) {
  const code = loadAccessCode();
  return code ? { ...extra, 'x-access-code': code } : extra;
}

async function ensureOk(res) {
  if (res.ok) return res;
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* resposta sem JSON */
  }
  throw new ApiError(body.error || `Erro ${res.status}`, { status: res.status, code: body.code });
}

// Faz o pedido ao professor e chama onDelta(textoAcumulado) a cada pedaço recebido.
export async function chatStream({ vars, messages, onDelta, signal }) {
  const res = await ensureOk(
    await fetch('/api/chat', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ vars, messages }),
      signal,
    }),
  );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.includes(STREAM_ERROR_MARKER)) {
      throw new ApiError('A resposta do professor foi interrompida. Tente de novo.');
    }
    onDelta(text);
  }
  text += decoder.decode();
  return text;
}

export async function tts(text) {
  const res = await ensureOk(
    await fetch('/api/tts', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    }),
  );
  return res.blob();
}

export async function summarize(payload) {
  const res = await ensureOk(
    await fetch('/api/summarize', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }),
  );
  return res.json();
}
