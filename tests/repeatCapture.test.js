// Testa a captura de repetição guiada com WebSocket, AudioContext e microfone simulados
// (nenhuma conexão real à AssemblyAI, nenhum áudio de verdade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RepeatCapture, RepeatCaptureError, isRepeatCaptureSupported } from '../src/lib/repeatCapture.js';

class FakeAudioContext {
  constructor() {
    this.sampleRate = 16000;
    this.destination = {};
    this.closed = false;
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createScriptProcessor() {
    return { connect() {}, disconnect() {}, onaudioprocess: null };
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeStream {
  constructor() {
    this.stopped = false;
  }
  getTracks() {
    return [{ stop: () => (this.stopped = true) }];
  }
}

class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.last = this;
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  // Helpers de teste (não fazem parte da API real de WebSocket)
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  emit(msg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}
FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSED = 3;

function makeCapture(overrides = {}) {
  const calls = { interim: [], final: [], error: [] };
  const stream = new FakeStream();
  const capture = new RepeatCapture({
    expectedRepeat: 'un bon vin blanc',
    onInterim: (t) => calls.interim.push(t),
    onFinal: (r) => calls.final.push(r),
    onError: (e) => calls.error.push(e),
    fetchToken: async () => 'tok-123',
    WebSocketImpl: FakeWebSocket,
    AudioContextImpl: FakeAudioContext,
    getMedia: async () => stream,
    ...overrides,
  });
  return { capture, calls, stream };
}

// Deixa passar exatamente os dois `await` internos do start() (fetchToken, getMedia) até o
// ponto em que o WebSocket já foi construído (mas ainda não aberto).
async function untilConnecting() {
  await Promise.resolve();
  await Promise.resolve();
}

test('detecta suporte (WebSocket + AudioContext)', () => {
  assert.equal(isRepeatCaptureSupported({}), false);
  assert.equal(isRepeatCaptureSupported({ WebSocket: FakeWebSocket }), false);
  assert.equal(isRepeatCaptureSupported({ WebSocket: FakeWebSocket, AudioContext: FakeAudioContext }), true);
});

test('sem suporte no navegador: recusa criar a captura', () => {
  assert.throws(
    () => new RepeatCapture({ expectedRepeat: 'x', WebSocketImpl: null, AudioContextImpl: null }),
    /não suportada/,
  );
});

test('conecta com sample_rate do AudioContext, modelo, formatação e keyterms_prompt', async () => {
  const { capture } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  const url = new URL(ws.url);
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.host, 'streaming.assemblyai.com');
  assert.equal(url.searchParams.get('token'), 'tok-123');
  assert.equal(url.searchParams.get('speech_model'), 'universal-3-5-pro');
  assert.equal(url.searchParams.get('sample_rate'), '16000');
  assert.equal(url.searchParams.get('encoding'), 'pcm_s16le');
  assert.equal(url.searchParams.get('format_turns'), 'true');
  const keyterms = JSON.parse(url.searchParams.get('keyterms_prompt'));
  assert.deepEqual(keyterms, ['un bon vin blanc', 'un', 'bon', 'vin', 'blanc']);
  ws.open();
  await p;
});

test('turno final: entrega transcrição, confiança média e a pior palavra; termina a conexão', async () => {
  const { capture, calls, stream } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  ws.open();
  await p;

  ws.emit({
    type: 'Turn',
    transcript: 'Un bon',
    end_of_turn: false,
    words: [
      { text: 'Un', confidence: 0.9 },
      { text: 'bon', confidence: 0.6 },
    ],
  });
  assert.deepEqual(calls.interim, ['Un bon']);
  assert.equal(calls.final.length, 0);

  ws.emit({
    type: 'Turn',
    transcript: 'Un bon vin blanc.',
    end_of_turn: true,
    words: [
      { text: 'Un', confidence: 0.9 },
      { text: 'bon', confidence: 0.6 },
      { text: 'vin', confidence: 0.5 },
      { text: 'blanc.', confidence: 0.95 },
    ],
  });

  assert.equal(calls.final.length, 1);
  const r = calls.final[0];
  assert.equal(r.transcript, 'Un bon vin blanc.');
  assert.ok(Math.abs(r.media - 0.7375) < 1e-9);
  assert.deepEqual(r.piorPalavra, { palavra: 'vin', confianca: 0.5 });

  assert.ok(ws.sent.some((s) => typeof s === 'string' && JSON.parse(s).type === 'Terminate'));
  assert.equal(ws.readyState, FakeWebSocket.CLOSED);
  assert.ok(stream.stopped);
});

test('finish() manual finaliza com o que já foi ouvido, mesmo sem end_of_turn', async () => {
  const { capture, calls } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  ws.open();
  await p;

  ws.emit({ type: 'Turn', transcript: 'Un bon vin', end_of_turn: false, words: [{ text: 'Un', confidence: 0.9 }] });
  capture.finish();

  assert.equal(calls.final.length, 1);
  assert.equal(calls.final[0].transcript, 'Un bon vin');
  // uma segunda chamada a finish()/o fechamento do socket depois não duplica a entrega
  ws.close();
  assert.equal(calls.final.length, 1);
});

test('nada foi ouvido: transcrição e confiança vêm nulas, sem erro', async () => {
  const { capture, calls } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  ws.open();
  await p;

  capture.finish();
  assert.deepEqual(calls.final, [{ transcript: '', media: null, piorPalavra: null }]);
  assert.equal(calls.error.length, 0);
});

test('cancel() não entrega nada e libera o microfone', async () => {
  const { capture, calls, stream } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  ws.open();
  await p;

  capture.cancel();
  assert.deepEqual(calls.final, []);
  assert.ok(stream.stopped);
});

test('finish() chamado antes mesmo de conectar não trava nem falha', async () => {
  const { capture, calls } = makeCapture();
  const p = capture.start();
  capture.finish(); // aluno tocou de novo antes do token/microfone resolverem
  await p;
  assert.deepEqual(calls.final, [{ transcript: '', media: null, piorPalavra: null }]);
  assert.equal(calls.error.length, 0);
});

test('erro ao buscar o token chama onError (ex: ASSEMBLYAI_API_KEY ausente no servidor)', async () => {
  const { capture, calls } = makeCapture({
    fetchToken: async () => {
      throw new Error('Variável de ambiente ASSEMBLYAI_API_KEY não configurada no Netlify.');
    },
  });
  await capture.start();
  assert.equal(calls.final.length, 0);
  assert.equal(calls.error.length, 1);
  assert.ok(calls.error[0] instanceof Error);
  assert.match(calls.error[0].message, /ASSEMBLYAI_API_KEY/);
});

test('erro de conexão (onerror antes de abrir) chama onError com RepeatCaptureError', async () => {
  const { capture, calls } = makeCapture();
  const p = capture.start();
  await untilConnecting();
  const ws = FakeWebSocket.last;
  ws.onerror();
  await p;
  assert.equal(calls.error.length, 1);
  assert.ok(calls.error[0] instanceof RepeatCaptureError);
});
