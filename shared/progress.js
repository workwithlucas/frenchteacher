// Lógica pura de progresso (sem I/O) — usada pelo app e testada em tests/.
import { getBlock, describeBlock, nextBlockId } from './curriculum.js';

export const MAX_RECURRING_ERRORS = 5;
const MAX_ERROR_LOG = 40;

export function createInitialProgress(nomeAluno) {
  return {
    version: 1,
    nomeAluno,
    blocoId: 1,
    ultimaRegra: null,
    // Cada erro observado: { erro, sessoes, ultimaVez }. `sessoes` = em quantas sessões apareceu.
    errorLog: [],
    sessoesConcluidas: 0,
    sessoesNoBloco: 0,
    ultimaSessaoEm: null,
    ultimoAvancarBloco: null,
  };
}

export function nivelAtual(progress) {
  return getBlock(progress.blocoId).nivel;
}

// Erros recorrentes = os que apareceram em mais de uma sessão (máx. 5, mais frequentes primeiro).
export function recurringErrors(progress) {
  return progress.errorLog
    .filter((e) => e.sessoes >= 2)
    .sort((a, b) => b.sessoes - a.sessoes || (b.ultimaVez ?? '').localeCompare(a.ultimaVez ?? ''))
    .slice(0, MAX_RECURRING_ERRORS)
    .map((e) => e.erro);
}

export function teacherPromptVars(progress) {
  const erros = recurringErrors(progress);
  return {
    nome_aluno: progress.nomeAluno,
    nivel_atual: nivelAtual(progress),
    bloco_do_dia: describeBlock(progress.blocoId),
    ultima_regra: progress.ultimaRegra || 'nenhuma ainda (primeira sessão)',
    erros_recorrentes: erros.length ? erros.join('; ') : 'nenhum registrado ainda',
  };
}

const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Aplica o resumo pós-sessão ao estado. Avança no máximo UM bloco por sessão.
export function applySessionSummary(progress, summary, now = new Date()) {
  const ts = now.toISOString();
  const errorLog = progress.errorLog.map((e) => ({ ...e }));
  const seenThisSession = new Set();

  for (const raw of summary.novos_erros ?? []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const key = normalize(raw);
    if (seenThisSession.has(key)) continue;
    seenThisSession.add(key);
    const existing = errorLog.find((e) => normalize(e.erro) === key);
    if (existing) {
      existing.sessoes += 1;
      existing.ultimaVez = ts;
    } else {
      errorLog.push({ erro: raw.trim(), sessoes: 1, ultimaVez: ts });
    }
  }

  // Limita o histórico: descarta primeiro os erros que só apareceram uma vez, mais antigos primeiro.
  while (errorLog.length > MAX_ERROR_LOG) {
    const candidates = errorLog
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.sessoes - b.e.sessoes || (a.e.ultimaVez ?? '').localeCompare(b.e.ultimaVez ?? ''));
    errorLog.splice(candidates[0].i, 1);
  }

  const avancar = summary.avancar_bloco === true;
  const blocoId = avancar ? nextBlockId(progress.blocoId) : progress.blocoId;
  const mudouBloco = blocoId !== progress.blocoId;

  return {
    ...progress,
    blocoId,
    ultimaRegra: summary.regra_ensinada?.trim() || progress.ultimaRegra,
    errorLog,
    sessoesConcluidas: progress.sessoesConcluidas + 1,
    sessoesNoBloco: mudouBloco ? 0 : progress.sessoesNoBloco + 1,
    ultimaSessaoEm: ts,
    ultimoAvancarBloco: avancar,
  };
}

// ---- Tag {{avancar_bloco: true/false}} na resposta do professor ----

const TAG_RE = /\{*\s*avan[cç]ar_bloco\s*[:=]\s*(true|false)\s*\}*/gi;

// Extrai o último valor da tag (ou null se ausente) e devolve o texto limpo para fala/tela.
export function extractAdvanceTag(text) {
  let value = null;
  for (const m of text.matchAll(TAG_RE)) value = m[1].toLowerCase() === 'true';
  const clean = text.replace(TAG_RE, '').replace(/[ \t]+\n/g, '\n').trim();
  return { value, clean };
}

// Durante o streaming, nada a partir do início provável da tag pode ir pro TTS.
// Retorna o índice até onde o texto é seguro para falar.
export function safeSpeakLength(text) {
  const candidates = [text.indexOf('{'), text.search(/avan[cç]ar_bloco/i)].filter((i) => i >= 0);
  return candidates.length ? Math.min(...candidates) : text.length;
}

// Divide o texto seguro em trechos prontos pra TTS: termina em fim de frase e tem
// tamanho mínimo (menos chamadas, prosódia mais natural). Retorna { chunks, consumed }.
export function takeSpeakableChunks(text, minLength = 60) {
  const chunks = [];
  let start = 0;
  const boundary = /[.!?…:;]+["»”)]*\s+|\n+/g;
  let m;
  while ((m = boundary.exec(text))) {
    const end = m.index + m[0].length;
    if (end - start >= minLength) {
      const piece = text.slice(start, end).trim();
      if (piece) chunks.push(piece);
      start = end;
    }
  }
  return { chunks, consumed: start };
}
