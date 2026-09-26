import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseLevel,
  pickVocabulary,
  vocabularyForLevel,
  wordsUsedIn,
  pickProverb,
  proverbUsedInEntry,
  pickReview,
  buildSessionSupport,
  supportNotes,
  applySupportUsage,
  REVIEW_EVERY,
} from '../shared/apoio.js';
import { createInitialProgress } from '../shared/progress.js';
import { createCadernoEntry } from '../shared/caderno.js';

const progress = (extra = {}) => ({ ...createInitialProgress('Lucas'), ...extra });
const entry = (iso, blocoId, regra = `Regra ${iso}`, exemplos = [{ frase: 'Je suis là.', nuance: '' }]) =>
  createCadernoEntry(
    {
      regra_ensinada: regra,
      caderno: { cena: 'c', regra: `Explicação de ${regra}.\n\nSegundo parágrafo.`, exemplos, pergunta_aberta: 'q ?', convite_escrita: 'Escreva' },
    },
    { alunoId: 'lucas', alunoNome: 'Lucas', blocoId, now: new Date(iso) },
  );

test('nível base: A1.2 → A1, B2 → B2', () => {
  assert.equal(baseLevel('A1.2'), 'A1');
  assert.equal(baseLevel('B2'), 'B2');
});

test('vocabulário: só o nível atual, sem as já usadas; recomeça quando esgota', () => {
  const a1 = vocabularyForLevel('A1');
  assert.ok(a1.includes('bonjour'));
  assert.ok(!a1.includes('cependant'), 'palavra de B1 não entra em A1');
  let v = pickVocabulary(progress({ vocabUsado: { A1: ['bonjour', 'merci'] } }), 'A1.1');
  assert.equal(v.level, 'A1');
  assert.ok(!v.palavras.includes('bonjour'));
  assert.equal(v.palavras.length, a1.length - 2);
  v = pickVocabulary(progress({ vocabUsado: { A1: a1 } }), 'A1.2');
  assert.equal(v.palavras.length, a1.length);
  assert.equal(v.reiniciado, true);
});

test('vocabulário usado: palavra inteira, sem confundir com pedaço de palavra', () => {
  const found = wordsUsedIn("Bonjour ! Aujourd’hui on va à l'école. Il y a un magasin.", ['bonjour', "aujourd'hui", 'école', 'jour', 'un', 'il y a', 'rue']);
  assert.deepEqual(found, ['bonjour', "aujourd'hui", 'école', 'un', 'il y a']);
  assert.deepEqual(wordsUsedIn("D'un côté c'est cher, de l'autre côté c'est bon.", ["d'un côté... de l'autre côté"]), [
    "d'un côté... de l'autre côté",
  ]);
});

test('provérbio: nenhum em A1; nível atual primeiro, depois anteriores; não repete', () => {
  assert.equal(pickProverb(progress(), 'A1.2'), null);
  assert.equal(pickProverb(progress(), 'A2.1').nivel, 'A2');
  assert.equal(pickProverb(progress(), 'B1.1').nivel, 'B1');
  const p1 = pickProverb(progress(), 'B1.1');
  const p2 = pickProverb(progress({ proverbiosUsados: [p1.expressao] }), 'B1.1');
  assert.notEqual(p1.expressao, p2.expressao);
  const b1All = ['Il ne faut pas vendre la peau de l\'ours avant de l\'avoir tué.', 'Chacun voit midi à sa porte.', 'Avoir un chat dans la gorge', 'Mettre la charrue avant les bœufs'];
  assert.equal(pickProverb(progress({ proverbiosUsados: b1All }), 'B1.2').nivel, 'A2', 'esgotou B1 → usa A2');
});

test('provérbio conta como usado só se entrou nos exemplos do Caderno', () => {
  const p = { expressao: "Poser un lapin à quelqu'un" };
  const com = entry('2026-09-01T00:00:00Z', 7, 'x', [{ frase: 'Il m’a posé un lapin hier.', nuance: '' }]);
  const com2 = entry('2026-09-01T00:00:00Z', 7, 'x', [{ frase: 'Poser un lapin à quelqu’un, ça ne se fait pas.', nuance: '' }]);
  const sem = entry('2026-09-01T00:00:00Z', 7);
  assert.equal(proverbUsedInEntry({ expressao: 'Qui ne risque rien n\'a rien.' }, entry('2026-09-01T00:00:00Z', 7, 'x', [{ frase: 'Qui ne risque rien n’a rien !', nuance: '' }])), true);
  assert.equal(proverbUsedInEntry(p, com2), true);
  assert.equal(proverbUsedInEntry(p, sem), false);
  assert.equal(proverbUsedInEntry(p, null), false);
  assert.equal(proverbUsedInEntry(p, com), false, 'forma conjugada não é detectada (limitação aceita)');
});

test(`revisão: só depois de ${REVIEW_EVERY} regras novas, escolhendo a mais antiga de blocos anteriores`, () => {
  const caderno = [
    entry('2026-09-01T00:00:00Z', 1, 'Nasais'),
    entry('2026-09-02T00:00:00Z', 2, 'Artigos'),
    entry('2026-09-03T00:00:00Z', 3, 'Presente -er'),
    entry('2026-09-04T00:00:00Z', 4, 'Passé composé'),
  ];
  const p = progress({ blocoId: 4 });
  assert.equal(pickReview(p, caderno), null, '4 regras: ainda não');
  caderno.push(entry('2026-09-05T00:00:00Z', 4, 'Imparfait'));
  const r = pickReview(p, caderno);
  assert.equal(r.regraTitulo, 'Nasais');
  assert.match(r.resumo, /^Explicação de Nasais\.$/);

  // depois da revisão, conta de novo a partir dela e não repete a mesma regra
  const after = applySupportUsage(p, { apoio: { revisao: r }, teacherText: '', cadernoEntry: null, now: new Date('2026-09-05T12:00:00Z') });
  assert.equal(pickReview(after, caderno), null);
  const more = [...caderno, ...[6, 7, 8, 9, 10].map((d) => entry(`2026-09-${String(d).padStart(2, '0')}T13:00:00Z`, 5))];
  assert.equal(pickReview({ ...after, blocoId: 5 }, more).regraTitulo, 'Artigos');
});

test('revisão: sem regra de bloco anterior, não dispara', () => {
  const caderno = [1, 2, 3, 4, 5].map((d) => entry(`2026-09-0${d}T00:00:00Z`, 1));
  assert.equal(pickReview(progress({ blocoId: 1 }), caderno), null);
});

test('notas de abertura: revisão na cena, provérbio opcional, vocabulário sem virar lista', () => {
  const apoio = buildSessionSupport(progress({ blocoId: 7 }), [], 'A2.1');
  apoio.revisao = { entryId: 'x', blocoId: 2, regraTitulo: 'Artigos', resumo: 'Le, la, les.' };
  const notes = supportNotes(apoio).join('\n');
  assert.match(notes, /Revisão espaçada: encaixe naturalmente na cena de abertura/);
  assert.match(notes, /não como prova/);
  assert.match(notes, /«Petit à petit, l'oiseau fait son nid\.»/);
  assert.match(notes, /Se não encaixar, não force/);
  assert.match(notes, /Vocabulário prioritário do nível A2: parce que, donc/);
  assert.match(notes, /Não é lista para decorar/);
  assert.deepEqual(supportNotes(null), []);
});

test('registro de uso: vocabulário falado, provérbio no Caderno', () => {
  const apoio = {
    vocabulario: { level: 'A2', palavras: ['donc', 'aider', 'salaire'], reiniciado: false },
    proverbio: { expressao: 'Qui ne risque rien n\'a rien.', nivel: 'A2' },
    revisao: null,
  };
  const cad = entry('2026-09-01T00:00:00Z', 7, 'x', [{ frase: "Qui ne risque rien n'a rien.", nuance: '' }]);
  const p = applySupportUsage(progress({ vocabUsado: { A2: ['mais'] } }), {
    apoio,
    teacherText: 'Tu peux aider ton collègue, donc...',
    cadernoEntry: cad,
  });
  assert.deepEqual(p.vocabUsado.A2, ['mais', 'donc', 'aider']);
  assert.deepEqual(p.proverbiosUsados, ["Qui ne risque rien n'a rien."]);
  const semCaderno = applySupportUsage(progress(), { apoio, teacherText: '', cadernoEntry: null });
  assert.deepEqual(semCaderno.proverbiosUsados, []);
});
