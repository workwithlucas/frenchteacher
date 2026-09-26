// Pós-sessão: resume a sessão (regra ensinada, novos erros, avancar_bloco) e, se a
// sessão ensinou regra nova, gera a entrada do Caderno — tudo no mesmo pedido.
// Roda depois que a conversa por voz acabou, então usa o Haiku (mais barato): só
// reorganiza por escrito o que a sessão (Sonnet) já ensinou.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { SUMMARY_SYSTEM, buildSummaryUserMessage } from '../../shared/summaryPrompt.js';
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';
import { anthropicErrorResponse, SUMMARY_MODEL } from './_lib/claude.mjs';

const SummarySchema = z.object({
  regra_ensinada: z.string(),
  novos_erros: z.array(z.string()),
  avancar_bloco: z.boolean(),
  caderno: z
    .object({
      cena: z.string(),
      regra: z.string(),
      exemplos: z.array(z.object({ frase: z.string(), nuance: z.string() })),
      pergunta_aberta: z.string(),
    })
    .nullable(),
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
      model: SUMMARY_MODEL,
      max_tokens: 8000,
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
