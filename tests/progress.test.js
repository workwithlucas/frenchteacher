import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeacherPrompt, TEACHER_PROMPT_TEMPLATE } from '../shared/teacherPrompt.js';
import {
  createInitialProgress,
  teacherPromptVars,
  applySessionSummary,
  recurringErrors,
  extractAdvanceTag,
  safeSpeakLength,
  takeSpeakableChunks,
} from '../shared/progress.js';
import { CURRICULUM } from '../shared/curriculum.js';

test('prompt do professor: preenche as variáveis e mantém a tag avancar_bloco literal', () => {
  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  const prompt = buildTeacherPrompt(vars);
  assert.match(prompt, /professor particular de francês de Lucas\./);
  assert.match(prompt, /Nível CECRL atual do aluno: A1\.1/);
  assert.match(prompt, /Bloco\/regra de hoje: Bloco 1: Fonética/);
  assert.match(prompt, /\{\{avancar_bloco: true\/false\}\}/);
  assert.doesNotMatch(prompt, /\{\{(nome_aluno|nivel_atual|bloco_do_dia|ultima_regra|erros_recorrentes)\}\}/);
});

test('prompt do professor: recusa variável ausente', () => {
  assert.throws(() => buildTeacherPrompt({ nome_aluno: 'Lucas' }), /nivel_atual/);
});

test('template contém todas as seções da especificação', () => {
  for (const s of ['# QUEM VOCÊ É', '# ESTRUTURA FIXA DA SESSÃO', '# REGRAS DE CORREÇÃO', '# LIMITES DE ESCOPO', '# FORMATO DE FALA', '# PROGRESSÃO DE NÍVEL', '# TETO DE AMBIÇÃO']) {
    assert.ok(TEACHER_PROMPT_TEMPLATE.includes(s), s);
  }
});

test('currículo: 20 blocos em ordem', () => {
  assert.equal(CURRICULUM.length, 20);
  CURRICULUM.forEach((b, i) => assert.equal(b.id, i + 1));
});

test('tag avancar_bloco: extrai e remove em vários formatos', () => {
  const cases = [
    ['À demain ! {{avancar_bloco: true}}', true, 'À demain !'],
    ['Bom trabalho.\n{avancar_bloco: false}', false, 'Bom trabalho.'],
    ['Até amanhã. avancar_bloco: true', true, 'Até amanhã.'],
    ['Sem tag nenhuma.', null, 'Sem tag nenhuma.'],
    ['Vamos avançar com calma.', null, 'Vamos avançar com calma.'],
  ];
  for (const [input, value, clean] of cases) {
    assert.deepEqual(extractAdvanceTag(input), { value, clean }, input);
  }
});

test('streaming: não fala nada a partir do início da tag', () => {
  assert.equal(safeSpeakLength('Olá. {{avan'), 5);
  assert.equal(safeSpeakLength('Olá. avancar_bloco: tr'), 5);
  assert.equal(safeSpeakLength('Vamos avançar agora.'), 'Vamos avançar agora.'.length);
});

test('streaming: corta trechos em fim de frase com tamanho mínimo', () => {
  const { chunks, consumed } = takeSpeakableChunks('Bonjour ! Aujourd\'hui on parle du café. Et puis', 20);
  assert.deepEqual(chunks, ["Bonjour ! Aujourd'hui on parle du café."]);
  assert.equal(consumed, "Bonjour ! Aujourd'hui on parle du café. ".length);
  assert.deepEqual(takeSpeakableChunks('Sem fim de frase', 5), { chunks: [], consumed: 0 });
});

test('resumo: erro vira recorrente só a partir da segunda sessão', () => {
  let p = createInitialProgress('Eduarda');
  p = applySessionSummary(p, { regra_ensinada: 'Nasais', novos_erros: ['pronuncia "un" como "um"'], avancar_bloco: false });
  assert.deepEqual(recurringErrors(p), []);
  assert.equal(p.ultimaRegra, 'Nasais');
  p = applySessionSummary(p, { regra_ensinada: 'Liaison', novos_erros: ['Pronuncia "un" como "um" ', 'esquece a liaison'], avancar_bloco: false });
  assert.deepEqual(recurringErrors(p), ['pronuncia "un" como "um"']);
  assert.equal(p.blocoId, 1);
});

test('resumo: no máximo 5 erros recorrentes, mais frequentes primeiro', () => {
  let p = createInitialProgress('Lucas');
  const erros = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
  p = applySessionSummary(p, { regra_ensinada: 'x', novos_erros: erros, avancar_bloco: false });
  p = applySessionSummary(p, { regra_ensinada: 'x', novos_erros: erros, avancar_bloco: false });
  p = applySessionSummary(p, { regra_ensinada: 'x', novos_erros: ['e7'], avancar_bloco: false });
  const r = recurringErrors(p);
  assert.equal(r.length, 5);
  assert.equal(r[0], 'e7');
});

test('resumo: avança um bloco por vez e para no último', () => {
  let p = createInitialProgress('Lucas');
  p = applySessionSummary(p, { regra_ensinada: 'x', novos_erros: [], avancar_bloco: true });
  assert.equal(p.blocoId, 2);
  assert.equal(teacherPromptVars(p).nivel_atual, 'A1.1');
  p = { ...p, blocoId: 20 };
  p = applySessionSummary(p, { regra_ensinada: 'x', novos_erros: [], avancar_bloco: true });
  assert.equal(p.blocoId, 20);
});
