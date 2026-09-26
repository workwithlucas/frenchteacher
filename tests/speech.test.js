// Testa a escuta (Web Speech API) com um SpeechRecognition simulado e relógio falso.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Listener, SILENCE_MS, getSpeechRecognition, LANGS } from '../src/lib/speech.js';

class FakeRecognition {
  static last = null;
  constructor() {
    FakeRecognition.last = this;
    this.started = false;
    this.stopped = false;
    this.aborted = false;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onerror?.({ error: 'aborted' });
    this.onend?.();
  }
  // Simula um evento onresult: lista de [texto, isFinal]
  emit(results) {
    const list = results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult({ results: list });
  }
  fail(error) {
    this.onerror({ error });
    this.onend();
  }
}

function makeListener(opts = {}) {
  const calls = { interim: [], final: [], error: [] };
  const listener = new Listener({
    lang: LANGS.fr.code,
    Recognition: FakeRecognition,
    onInterim: (t) => calls.interim.push(t),
    onFinal: (t) => calls.final.push(t),
    onError: (e) => calls.error.push(e),
    ...opts,
  });
  return { listener, calls };
}

test('detecta a API com e sem prefixo webkit', () => {
  assert.equal(getSpeechRecognition({}), null);
  assert.equal(getSpeechRecognition({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
  assert.equal(getSpeechRecognition({ SpeechRecognition: FakeRecognition }), FakeRecognition);
});

test('sem suporte no navegador: recusa criar a escuta', () => {
  assert.throws(() => new Listener({ lang: 'fr-FR', Recognition: null }), /unsupported/);
});

test('configura fr-FR, escuta contínua e resultados interinos', () => {
  const { listener } = makeListener();
  listener.start();
  const rec = FakeRecognition.last;
  assert.equal(rec.lang, 'fr-FR');
  assert.equal(rec.continuous, true);
  assert.equal(rec.interimResults, true);
  assert.ok(rec.started);
});

test('mostra texto interino enquanto fala e envia após silêncio', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { listener, calls } = makeListener();
    listener.start();
    const rec = FakeRecognition.last;
    rec.emit([['Je suis', false]]);
    rec.emit([['Je suis allé', false]]);
    rec.emit([['Je suis allé au marché.', true], [' Et puis', false]]);
    assert.deepEqual(calls.interim, ['Je suis', 'Je suis allé', 'Je suis allé au marché. Et puis']);

    mock.timers.tick(SILENCE_MS - 100);
    assert.equal(rec.stopped, false, 'ainda não passou o tempo de silêncio');
    rec.emit([['Je suis allé au marché.', true], [' Et puis hier', true]]);
    mock.timers.tick(SILENCE_MS - 100);
    assert.equal(rec.stopped, false, 'nova fala reinicia o timer');

    mock.timers.tick(200);
    assert.ok(rec.stopped);
    assert.deepEqual(calls.final, ['Je suis allé au marché. Et puis hier']);
  } finally {
    mock.timers.reset();
  }
});

test('toque para enviar antes do silêncio entrega o texto (inclusive interino)', () => {
  const { listener, calls } = makeListener();
  listener.start();
  FakeRecognition.last.emit([['Bonjour', false]]);
  listener.finish();
  assert.deepEqual(calls.final, ['Bonjour']);
});

test('nada foi dito: entrega texto vazio, sem erro', () => {
  const { listener, calls } = makeListener();
  listener.start();
  FakeRecognition.last.fail('no-speech');
  assert.deepEqual(calls.final, ['']);
  assert.equal(calls.error.length, 0);
});

test('permissão negada vira erro com mensagem clara', () => {
  const { listener, calls } = makeListener();
  listener.start();
  FakeRecognition.last.fail('not-allowed');
  assert.equal(calls.final.length, 0);
  assert.match(calls.error[0].message, /Permissão de microfone negada/);
});

test('cancelar não entrega nada', () => {
  const { listener, calls } = makeListener();
  listener.start();
  FakeRecognition.last.emit([['Bonjour', false]]);
  listener.cancel();
  assert.ok(FakeRecognition.last.aborted);
  assert.deepEqual(calls.final, []);
  assert.deepEqual(calls.error, []);
});

test('escuta em português quando o seletor está em PT', () => {
  const { listener } = makeListener({ lang: LANGS.pt.code });
  listener.start();
  assert.equal(FakeRecognition.last.lang, 'pt-BR');
});
