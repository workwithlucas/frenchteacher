import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keytermsFor, summarizeWords, pronunciationNote } from '../shared/pronunciation.js';

test('keytermsFor: palavra única vira um único termo', () => {
  assert.deepEqual(keytermsFor('bonjour'), ['bonjour']);
});

test('keytermsFor: frase vira a frase inteira + cada palavra, sem pontuação nem duplicata', () => {
  const terms = keytermsFor('Un bon vin blanc.');
  assert.deepEqual(terms, ['Un bon vin blanc.', 'Un', 'bon', 'vin', 'blanc']);
});

test('keytermsFor: respeita o limite máximo de termos', () => {
  const frase = Array.from({ length: 10 }, (_, i) => `mot${i}`).join(' ');
  assert.equal(keytermsFor(frase, 5).length, 5);
});

test('summarizeWords: média e pior palavra', () => {
  const words = [
    { text: 'Un', confidence: 0.9 },
    { text: 'bon', confidence: 0.6 },
    { text: 'vin', confidence: 0.5 },
    { text: 'blanc', confidence: 0.95 },
  ];
  const { media, piorPalavra } = summarizeWords(words);
  assert.ok(Math.abs(media - 0.7375) < 1e-9);
  assert.deepEqual(piorPalavra, { palavra: 'vin', confianca: 0.5 });
});

test('summarizeWords: sem palavras válidas devolve nulos', () => {
  assert.deepEqual(summarizeWords([]), { media: null, piorPalavra: null });
  assert.deepEqual(summarizeWords(undefined), { media: null, piorPalavra: null });
  assert.deepEqual(summarizeWords([{ text: 'x' }]), { media: null, piorPalavra: null });
});

test('summarizeWords: uma palavra só', () => {
  assert.deepEqual(summarizeWords([{ text: 'oui', confidence: 0.8 }]), {
    media: 0.8,
    piorPalavra: { palavra: 'oui', confianca: 0.8 },
  });
});

test('pronunciationNote: null quando não há nada a avaliar', () => {
  assert.equal(pronunciationNote({ expectedRepeat: 'x', media: null, piorPalavra: null }), null);
});

test('pronunciationNote: acima do limiar não avisa; abaixo, avisa', () => {
  const alta = pronunciationNote({
    expectedRepeat: 'un bon vin blanc',
    media: 0.92,
    piorPalavra: { palavra: 'vin', confianca: 0.85 },
  });
  assert.match(alta, /confiança média 0\.92/);
  assert.match(alta, /menor confiança: "vin" \(0\.85\)/);
  assert.doesNotMatch(alta, /merece atenção/);

  const baixa = pronunciationNote({
    expectedRepeat: 'un bon vin blanc',
    media: 0.55,
    piorPalavra: { palavra: 'vin', confianca: 0.3 },
  });
  assert.match(baixa, /merece atenção/);
  assert.match(baixa, /"vin" \(0\.30\)/);
});
