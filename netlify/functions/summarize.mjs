// Pós-sessão: resume a sessão em regra ensinada + novos erros + avancar_bloco.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { SUMMARY_SYSTEM, buildSummaryUserMessage } from '../../shared/summaryPrompt.js';
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';
import { anthropicErrorResponse, CLAUDE_MODEL } from './_lib/claude.mjs';

const SummarySchema = z.object({
  regra_ensinada: z.string(),
  novos_erros: z.array(z.string()),
  avancar_bloco: z.boolean(),
});

const MAX_TRANSCRIPT_CHARS = 400_000;

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  try {
    const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
    const { bloco, errosRegistrados = [], tagProfessor = null, transcript } = await req.json();
    if (typeof transcript !== 'string' || !transcript.trim()) return jsonError(400, 'Transcrição vazia.');
    if (transcript.length > MAX_TRANSCRIPT_CHARS) return jsonError(400, 'Transcrição longa demais.');
    if (typeof bloco !== 'string' || !Array.isArray(errosRegistrados)) return jsonError(400, 'Dados inválidos.');

    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: buildSummaryUserMessage({ bloco, errosRegistrados, tagProfessor, transcript }),
        },
      ],
      output_config: { format: zodOutputFormat(SummarySchema) },
    });

    if (!response.parsed_output) {
      return jsonError(502, `Resumo não pôde ser interpretado (stop_reason: ${response.stop_reason}).`);
    }
    return Response.json(response.parsed_output);
  } catch (err) {
    return anthropicErrorResponse(err) ?? handleError(err);
  }
};

export const config = { path: '/api/summarize' };
