// Motor de ensino: monta o prompt do professor a partir do estado do aluno e
// devolve a resposta do Claude em streaming de texto puro.
import Anthropic from '@anthropic-ai/sdk';
import { buildTeacherPrompt } from '../../shared/teacherPrompt.js';
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';
import { STREAM_ERROR_MARKER } from '../../shared/protocol.js';
import { validateMessages, anthropicErrorResponse, CLAUDE_MODEL } from './_lib/claude.mjs';

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  let upstream;
  try {
    const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
    const { vars, messages } = await req.json();

    let system;
    try {
      system = buildTeacherPrompt(vars ?? {});
    } catch (err) {
      return jsonError(400, err.message);
    }
    const invalid = validateMessages(messages);
    if (invalid) return jsonError(400, invalid);

    // stream: true só resolve depois que a API aceitou o pedido, então erros de
    // autenticação/limite chegam aqui como exceção e viram JSON normal.
    upstream = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      // Conversa por voz: prioriza latência baixa até a primeira palavra.
      thinking: { type: 'disabled' },
      // Cacheia prompt + histórico entre os turnos da mesma sessão.
      cache_control: { type: 'ephemeral' },
      system,
      messages,
      stream: true,
    });
  } catch (err) {
    return anthropicErrorResponse(err) ?? handleError(err);
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of upstream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        console.error(err);
        controller.enqueue(encoder.encode(STREAM_ERROR_MARKER));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export const config = { path: '/api/chat' };
