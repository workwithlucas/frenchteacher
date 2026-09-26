// Contexto de apoio da sessão de voz: vocabulário por nível, provérbio real e revisão espaçada.
// Tudo entra na mensagem oculta de abertura — o prompt de sistema do professor não muda.
// Lógica pura (sem I/O).
import VOCABULARIO from './data/vocabulario-frequencia.json' with { type: 'json' };
import PROVERBIOS from './data/proverbios-expressoes.json' with { type: 'json' };
import { sortNewestFirst } from './caderno.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2'];
export const REVIEW_EVERY = 5; // regras novas (entradas do Caderno) entre uma revisão e outra
const REVIEW_MIN_BLOCK_GAP = 2; // "vários blocos atrás": preferir regras de pelo menos 2 blocos antes

// "A1.2" → "A1"
export const baseLevel = (nivel) => nivel.slice(0, 2);

export function supportState(progress) {
  return {
    vocabUsado: progress.vocabUsado ?? {},
    proverbiosUsados: progress.proverbiosUsados ?? [],
    revisao: progress.revisao ?? { ultimaEm: null, revisadasIds: [] },
  };
}

// ---- Vocabulário ----

export function vocabularyForLevel(level) {
  return Object.values(VOCABULARIO[level] ?? {}).flat();
}

// Palavras do nível atual ainda não usadas pelo professor; quando todas já foram usadas, recomeça.
export function pickVocabulary(progress, nivel) {
  const level = baseLevel(nivel);
  const all = vocabularyForLevel(level);
  const used = new Set(supportState(progress).vocabUsado[level] ?? []);
  const unused = all.filter((w) => !used.has(w));
  return { level, palavras: unused.length ? unused : all, reiniciado: unused.length === 0 };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.toLowerCase().replace(/[’`]/g, "'");

// Palavras da lista que aparecem no texto (palavra inteira, sem diferenciar maiúsculas).
export function wordsUsedIn(text, palavras) {
  const t = norm(text);
  return palavras.filter((w) => {
    const pattern = norm(w).split('...').map(escapeRe).join('.*?');
    return new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, 'u').test(t);
  });
}

// ---- Provérbios ----

// Primeiro item ainda não usado: nível atual primeiro, depois os anteriores. A1 não tem lista.
export function pickProverb(progress, nivel) {
  const current = LEVELS.indexOf(baseLevel(nivel));
  const used = new Set(supportState(progress).proverbiosUsados);
  for (let i = current; i >= 0; i--) {
    const level = LEVELS[i];
    const item = (PROVERBIOS[level] ?? []).find((p) => !used.has(p.expressao));
    if (item) return { ...item, nivel: level };
  }
  return null;
}

const simplify = (s) =>
  norm(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// O provérbio conta como usado se entrou nos exemplos do Caderno.
export function proverbUsedInEntry(proverbio, entry) {
  if (!proverbio || !entry) return false;
  // Expressões sem sujeito ("Poser un lapin à quelqu'un") podem vir conjugadas; compara pelo núcleo.
  const core = simplify(proverbio.expressao).replace(/ a quelqu'un$/, '');
  return entry.exemplos.some((e) => simplify(e.frase).includes(core));
}

// ---- Revisão espaçada ----

// Retorna a regra a revisar hoje, ou null. Dispara após REVIEW_EVERY regras novas desde a última revisão.
export function pickReview(progress, caderno) {
  const { revisao } = supportState(progress);
  const since = revisao.ultimaEm;
  const novas = caderno.filter((e) => !since || e.criadoEm > since).length;
  if (novas < REVIEW_EVERY) return null;

  const candidates = [...sortNewestFirst(caderno)]
    .reverse() // mais antiga primeiro
    .filter((e) => e.blocoId < progress.blocoId && !revisao.revisadasIds.includes(e.id));
  const far = candidates.find((e) => e.blocoId <= progress.blocoId - REVIEW_MIN_BLOCK_GAP);
  const entry = far ?? candidates[0];
  if (!entry) return null;
  const primeiroParagrafo = entry.regra.split(/\n\s*\n/)[0];
  const resumo = primeiroParagrafo.length > 400 ? `${primeiroParagrafo.slice(0, 400).trim()}…` : primeiroParagrafo;
  return { entryId: entry.id, blocoId: entry.blocoId, regraTitulo: entry.regraTitulo, resumo };
}

// ---- Montagem do contexto e registro de uso ----

export function buildSessionSupport(progress, caderno, nivel) {
  return {
    vocabulario: pickVocabulary(progress, nivel),
    proverbio: pickProverb(progress, nivel),
    revisao: pickReview(progress, caderno),
  };
}

export function supportNotes(apoio) {
  if (!apoio) return [];
  const notes = [];
  if (apoio.revisao) {
    notes.push(
      `[Revisão espaçada: encaixe naturalmente na cena de abertura de hoje esta regra, ensinada no bloco ${apoio.revisao.blocoId}: ` +
        `«${apoio.revisao.regraTitulo}: ${apoio.revisao.resumo}». Faça isso como parte da situação, não como prova, ` +
        'lista de revisão ou pergunta de teste. Depois siga para a regra do dia.]',
    );
  }
  if (apoio.proverbio) {
    const p = apoio.proverbio;
    notes.push(
      `[Expressão real da língua disponível para hoje: «${p.expressao}» (${p.traducao}; ${p.uso}). ` +
        'Se ela se encaixar naturalmente na cena, use-a como um dos três exemplos, no lugar de um exemplo inventado. ' +
        'Se não encaixar, não force.]',
    );
  }
  if (apoio.vocabulario?.palavras.length) {
    notes.push(
      `[Vocabulário prioritário do nível ${apoio.vocabulario.level}: ${apoio.vocabulario.palavras.join(', ')}. ` +
        'Prefira essas palavras ao montar cenas e exemplos, quando couber. Não é lista para decorar nem exercício de ' +
        'vocabulário: não apresente a lista ao aluno.]',
    );
  }
  return notes;
}

// Atualiza o progresso com o que foi usado na sessão encerrada.
export function applySupportUsage(progress, { apoio, teacherText, cadernoEntry, now = new Date() }) {
  if (!apoio) return progress;
  const state = supportState(progress);
  const next = { ...progress, ...state };

  if (apoio.vocabulario) {
    const { level, palavras, reiniciado } = apoio.vocabulario;
    const before = reiniciado ? [] : (state.vocabUsado[level] ?? []);
    const usados = wordsUsedIn(teacherText, palavras);
    next.vocabUsado = { ...state.vocabUsado, [level]: [...new Set([...before, ...usados])] };
  }

  if (apoio.proverbio && proverbUsedInEntry(apoio.proverbio, cadernoEntry)) {
    next.proverbiosUsados = [...state.proverbiosUsados, apoio.proverbio.expressao];
  }

  if (apoio.revisao) {
    next.revisao = {
      ultimaEm: now.toISOString(),
      revisadasIds: [...state.revisao.revisadasIds, apoio.revisao.entryId],
    };
  }
  return next;
}
