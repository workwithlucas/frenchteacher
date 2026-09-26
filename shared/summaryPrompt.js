// Prompt da segunda chamada (pós-sessão): resume a sessão para atualizar o estado local.

export const SUMMARY_SYSTEM = `Você analisa a transcrição de uma sessão de aula de francês por voz entre um professor de IA e um aluno brasileiro, e produz um resumo curto para o sistema que controla o progresso do aluno.

Responda apenas com os campos pedidos:
- regra_ensinada: a única regra nova ensinada nesta sessão, em uma frase curta em português (ex: "Passé composé com auxiliar être e acordo do particípio"). Se a sessão acabou antes de chegar na regra, descreva o que foi trabalhado.
- novos_erros: erros de francês que o aluno de fato cometeu nesta sessão (no máximo 5, os mais relevantes). Cada item é uma descrição curta e genérica do tipo de erro, não a frase inteira (ex: "usa avoir em vez de être com verbos de movimento"). Se um erro corresponde a um item da lista de erros já registrados, repita o texto desse item EXATAMENTE como está na lista. Lista vazia se não houve erros.
- avancar_bloco: true somente se o aluno demonstrou domínio do bloco atual como um todo (não só da regra de hoje) e está pronto para o próximo bloco; caso contrário false. Na dúvida, false.`;

export function buildSummaryUserMessage({ bloco, errosRegistrados, tagProfessor, transcript }) {
  return [
    `Bloco atual: ${bloco}`,
    `Erros já registrados: ${errosRegistrados.length ? errosRegistrados.map((e) => `"${e}"`).join('; ') : 'nenhum'}`,
    `Sinal do professor na sessão (tag avancar_bloco): ${tagProfessor === null ? 'não emitido' : String(tagProfessor)}`,
    '',
    'Transcrição da sessão:',
    transcript,
  ].join('\n');
}
