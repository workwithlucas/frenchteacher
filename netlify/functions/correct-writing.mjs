// Correção da expressão escrita do Caderno. Só roda quando o aluno envia um texto.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { WRITING_SYSTEM, buildWritingUserMessage } from '../../shared/writingPrompt.js';
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';
import { anthropicErrorResponse, SUMMARY_MODEL } from './_lib/claude.mjs';

const CorrectionSchema = z.object({
  versao_corrigida: z.string(),
  explicacao: z.string(),
});

const MAX_TEXT_CHARS = 2000;

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  try {
    const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
    const { texto, convite, regra, nivel } = await req.json();
    if (typeof texto !== 'string' || !texto.trim()) return jsonError(400, 'Texto vazio.');
    if (texto.length > MAX_TEXT_CHARS) return jsonError(400, 'Texto longo demais: escreva só 2-3 frases.');
    for (const [name, value] of Object.entries({ convite, regra, nivel })) {
      if (typeof value !== 'string' || value.length > 2000) return jsonError(400, `Campo ${name} inválido.`);
    }

    const response = await client.messages.parse({
      model: SUMMARY_MODEL,
      max_tokens: 2000,
      system: WRITING_SYSTEM,
      messages: [{ role: 'user', content: buildWritingUserMessage({ texto, convite, regra, nivel }) }],
      output_config: { format: zodOutputFormat(CorrectionSchema) },
    });
    if (!response.parsed_output) {
      return jsonError(502, `Correção não pôde ser interpretada (stop_reason: ${response.stop_reason}).`);
    }
    return Response.json(response.parsed_output);
  } catch (err) {
    return anthropicErrorResponse(err) ?? handleError(err);
  }
};

export const config = { path: '/api/correct-writing' };
