import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCadernoEntry,
  pendingQuestion,
  markQuestionResumed,
  groupByBlock,
  resumeQuestionNote,
} from '../shared/caderno.js';

const caderno = {
  cena: 'Você está num café em Lyon e quer pedir um vinho.',
  regra: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
  exemplos: [1, 2, 3, 4, 5, 6].map((i) => ({ frase: `Phrase ${i}.`, nuance: `nuance ${i}` })),
  pergunta_aberta: 'Qu’est-ce que tu commandes d’habitude au café ?',
};
const summary = (extra = {}) => ({ regra_ensinada: 'Vogais nasais', novos_erros: [], avancar_bloco: false, caderno, ...extra });
const ctx = (iso, blocoId = 1) => ({ alunoId: 'lucas', alunoNome: 'Lucas', blocoId, now: new Date(iso) });

test('cria entrada com aluno, bloco, conteúdo e pergunta pendente', () => {
  const e = createCadernoEntry(summary(), ctx('2026-09-26T10:00:00Z'));
  assert.equal(e.alunoId, 'lucas');
  assert.equal(e.alunoNome, 'Lucas');
  assert.equal(e.blocoId, 1);
  assert.equal(e.blocoTitulo, 'Fonética');
  assert.equal(e.fase, 1);
  assert.equal(e.regraTitulo, 'Vogais nasais');
  assert.equal(e.criadoEm, '2026-09-26T10:00:00.000Z');
  assert.equal(e.exemplos.length, 5, 'no máximo 5 exemplos');
  assert.equal(e.perguntaStatus, 'pendente');
});

test('sessão sem regra nova (caderno null) não gera entrada', () => {
  assert.equal(createCadernoEntry(summary({ caderno: null }), ctx('2026-09-26T10:00:00Z')), null);
  assert.equal(createCadernoEntry(summary({ caderno: undefined }), ctx('2026-09-26T10:00:00Z')), null);
});

test('pergunta pendente vem só da última entrada', () => {
  const a = createCadernoEntry(summary(), ctx('2026-09-20T10:00:00Z'));
  const b = createCadernoEntry(summary({ regra_ensinada: 'Liaison' }), ctx('2026-09-25T10:00:00Z'));
  assert.deepEqual(pendingQuestion([a, b]), { id: b.id, pergunta: b.perguntaAberta });
  const resumed = markQuestionResumed([a, b], b.id);
  assert.equal(resumed.find((e) => e.id === b.id).perguntaStatus, 'retomada');
  assert.equal(pendingQuestion(resumed), null, 'a pendente mais antiga não volta');
  assert.equal(pendingQuestion([]), null);
});

test('agrupa por bloco, mais recente primeiro', () => {
  const e1 = createCadernoEntry(summary(), ctx('2026-09-20T10:00:00Z', 1));
  const e2 = createCadernoEntry(summary(), ctx('2026-09-22T10:00:00Z', 1));
  const e3 = createCadernoEntry(summary(), ctx('2026-09-24T10:00:00Z', 2));
  const groups = groupByBlock([e1, e3, e2]);
  assert.deepEqual(groups.map((g) => g.blocoId), [2, 1]);
  assert.deepEqual(groups[1].entries.map((e) => e.id), [e2.id, e1.id]);
});

test('nota de retomada leva a pergunta para a abertura', () => {
  assert.match(resumeQuestionNote('Tu aimes le café ?'), /«Tu aimes le café \?».*cena de abertura/);
});
