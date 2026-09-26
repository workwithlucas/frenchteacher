// Caderno: material escrito de cada sessão que ensinou uma regra nova.
// Lógica pura (sem I/O); o armazenamento fica em src/lib/storage.js.
import { getBlock } from './curriculum.js';

export const MAX_EXEMPLOS = 5;

// Cria a entrada a partir do resumo pós-sessão. Retorna null se a sessão não gerou Caderno.
export function createCadernoEntry(summary, { alunoId, alunoNome, blocoId, now = new Date() }) {
  const c = summary?.caderno;
  if (!c || !c.regra?.trim() || !c.pergunta_aberta?.trim()) return null;
  const bloco = getBlock(blocoId);
  const criadoEm = now.toISOString();
  return {
    id: `${alunoId}-${now.getTime()}`,
    criadoEm,
    alunoId,
    alunoNome,
    blocoId: bloco.id,
    blocoTitulo: bloco.titulo,
    fase: bloco.fase,
    regraTitulo: summary.regra_ensinada?.trim() || bloco.titulo,
    cena: c.cena.trim(),
    regra: c.regra.trim(),
    exemplos: (c.exemplos ?? [])
      .filter((e) => e?.frase?.trim())
      .slice(0, MAX_EXEMPLOS)
      .map((e) => ({ frase: e.frase.trim(), nuance: (e.nuance ?? '').trim() })),
    perguntaAberta: c.pergunta_aberta.trim(),
    perguntaStatus: 'pendente',
    conviteEscrita: c.convite_escrita?.trim() || DEFAULT_WRITING_INVITE,
    // Preenchido quando o aluno envia um texto: { texto, enviadoEm, correcao: { versao_corrigida, explicacao } }
    escrita: null,
  };
}

// Entradas criadas antes do convite de escrita existir usam este texto.
export const DEFAULT_WRITING_INVITE = 'Escreva 2-3 frases em francês sobre a cena desta página, usando a regra do dia.';

export function saveWriting(entries, entryId, { texto, correcao, now = new Date() }) {
  return entries.map((e) =>
    e.id === entryId ? { ...e, escrita: { texto, enviadoEm: now.toISOString(), correcao } } : e,
  );
}

// Mais recente primeiro.
export function sortNewestFirst(entries) {
  return [...entries].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

// Pergunta pendente da ÚLTIMA entrada do aluno (entradas mais antigas não voltam).
export function pendingQuestion(entries) {
  const latest = sortNewestFirst(entries)[0];
  return latest?.perguntaStatus === 'pendente' ? { id: latest.id, pergunta: latest.perguntaAberta } : null;
}

export function markQuestionResumed(entries, entryId) {
  return entries.map((e) => (e.id === entryId ? { ...e, perguntaStatus: 'retomada' } : e));
}

// Agrupa por bloco, na ordem da entrada mais recente de cada grupo; dentro do grupo, mais recente primeiro.
export function groupByBlock(entries) {
  const groups = new Map();
  for (const e of sortNewestFirst(entries)) {
    if (!groups.has(e.blocoId)) {
      groups.set(e.blocoId, { blocoId: e.blocoId, blocoTitulo: e.blocoTitulo, fase: e.fase, entries: [] });
    }
    groups.get(e.blocoId).entries.push(e);
  }
  return [...groups.values()];
}

// Texto adicionado à mensagem oculta de abertura (o prompt de sistema do professor não muda).
export function resumeQuestionNote(pergunta) {
  return (
    `[Na sessão anterior, o Caderno do aluno terminou com esta pergunta aberta: «${pergunta}». ` +
    'Use-a como cena de abertura de hoje: faça a pergunta ao aluno, ouça a resposta, corrija o que for preciso ' +
    'e só então siga para a regra do dia.]'
  );
}
