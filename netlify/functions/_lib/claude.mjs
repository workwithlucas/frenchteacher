import Anthropic from '@anthropic-ai/sdk';
import { jsonError } from './http.mjs';

// Conversa por voz (professor ao vivo).
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
// Chamada de encerramento (resumo + Caderno).
export const SUMMARY_MODEL = process.env.SUMMARY_MODEL || 'claude-haiku-4-5';

const MAX_MESSAGES = 200;
const MAX_CHARS_PER_MESSAGE = 8000;

// Histórico vindo do cliente: só texto, alternando user/assistant, começando com user.
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'Histórico de mensagens vazio.';
  if (messages.length > MAX_MESSAGES) return 'Sessão longa demais; encerre e comece outra.';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const expectedRole = i % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== expectedRole) return `Mensagem ${i} com papel inválido (esperado ${expectedRole}).`;
    if (typeof m.content !== 'string' || !m.content.trim()) return `Mensagem ${i} vazia.`;
    if (m.content.length > MAX_CHARS_PER_MESSAGE) return `Mensagem ${i} longa demais.`;
  }
  if (messages[messages.length - 1].role !== 'user') return 'A última mensagem precisa ser do aluno.';
  return null;
}

export function anthropicErrorResponse(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return jsonError(502, 'Chave da Anthropic inválida (ANTHROPIC_API_KEY).');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return jsonError(429, 'Limite de uso da API do Claude atingido. Tente de novo em instantes.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    return jsonError(400, `Pedido recusado pela API do Claude: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    return jsonError(502, `Erro na API do Claude (${err.status ?? 'rede'}): ${err.message}`);
  }
  return null;
}
