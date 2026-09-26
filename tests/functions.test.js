// Testa as Netlify Functions com fetch interceptado (nenhuma chamada real às APIs).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.FISH_AUDIO_API_KEY = 'test-fish';
process.env.ANTHROPIC_BASE_URL = 'https://anthropic.test';

const calls = [];
let routes = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
  if (!route) return realFetch(input, init);
  calls.push({ url, init });
  return routes[route](url, init);
};

const { default: chat } = await import('../netlify/functions/chat.mjs');
const { default: tts } = await import('../netlify/functions/tts.mjs');
const { default: summarize } = await import('../netlify/functions/summarize.mjs');
const { teacherPromptVars, createInitialProgress } = await import('../shared/progress.js');
const { STREAM_ERROR_MARKER } = await import('../shared/protocol.js');

const post = (path, body, headers = {}) =>
  new Request(`https://app.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body),
  });

function sse(events) {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

const message = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } };

beforeEach(() => {
  calls.length = 0;
  routes = {};
  delete process.env.APP_ACCESS_CODE;
  delete process.env.FISH_AUDIO_VOICE_ID;
});

test('chat: monta o prompt no servidor e devolve o texto em streaming', async () => {
  routes['https://anthropic.test/v1/messages'] = () =>
    sse([
      { type: 'message_start', message },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Bonjour Lucas ! ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Imagine que você chega em Paris.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } },
      { type: 'message_stop' },
    ]);

  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  const res = await chat(post('/api/chat', { vars, messages: [{ role: 'user', content: 'Oi' }] }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'Bonjour Lucas ! Imagine que você chega em Paris.');

  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, 'claude-sonnet-5');
  assert.equal(sent.stream, true);
  assert.deepEqual(sent.thinking, { type: 'disabled' });
  assert.deepEqual(sent.cache_control, { type: 'ephemeral' });
  assert.match(sent.system, /professor particular de francês de Lucas/);
  assert.equal(calls[0].init.headers['x-api-key'] ?? new Headers(calls[0].init.headers).get('x-api-key'), 'test-anthropic');
});

test('chat: erro no meio do stream vira marcador', async () => {
  routes['https://anthropic.test/v1/messages'] = () =>
    sse([
      { type: 'message_start', message },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Bon' } },
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ]);
  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  const res = await chat(post('/api/chat', { vars, messages: [{ role: 'user', content: 'Oi' }] }));
  const body = await res.text();
  assert.ok(body.startsWith('Bon'));
  assert.ok(body.endsWith(STREAM_ERROR_MARKER));
});

test('chat: chave inválida da Anthropic vira erro JSON legível', async () => {
  routes['https://anthropic.test/v1/messages'] = () =>
    Response.json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, { status: 401 });
  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  const res = await chat(post('/api/chat', { vars, messages: [{ role: 'user', content: 'Oi' }] }));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /ANTHROPIC_API_KEY/);
});

test('chat: rejeita histórico malformado e variáveis ausentes', async () => {
  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  let res = await chat(post('/api/chat', { vars, messages: [{ role: 'assistant', content: 'x' }] }));
  assert.equal(res.status, 400);
  res = await chat(post('/api/chat', { vars: { nome_aluno: 'x' }, messages: [{ role: 'user', content: 'x' }] }));
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('código de acesso: bloqueia sem o header quando APP_ACCESS_CODE existe', async () => {
  process.env.APP_ACCESS_CODE = 'segredo';
  let res = await tts(post('/api/tts', { text: 'Bonjour' }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'bad_access_code');

  routes['https://api.fish.audio/'] = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });
  res = await tts(post('/api/tts', { text: 'Bonjour' }, { 'x-access-code': 'segredo' }));
  assert.equal(res.status, 200);
});

test('tts: repassa texto e voz ao Fish Audio e devolve mp3', async () => {
  process.env.FISH_AUDIO_VOICE_ID = 'voz-fr';
  routes['https://api.fish.audio/'] = () => new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'audio/mpeg' } });
  const res = await tts(post('/api/tts', { text: 'Bonjour' }));
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [9, 9]);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.text, 'Bonjour');
  assert.equal(sent.reference_id, 'voz-fr');
  assert.equal(sent.format, 'mp3');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-fish');
});

test('summarize: usa o Haiku e devolve resumo + Caderno estruturados', async () => {
  const out = {
    regra_ensinada: 'Nasais',
    novos_erros: ['troca un por um'],
    avancar_bloco: false,
    caderno: {
      cena: 'Café em Lyon.',
      regra: 'As vogais nasais...',
      exemplos: [{ frase: 'Un bon vin blanc.', nuance: 'três nasais seguidas' }],
      pergunta_aberta: 'Quel vin tu préfères ?',
    },
  };
  routes['https://anthropic.test/v1/messages'] = () =>
    Response.json({ ...message, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
  const res = await summarize(
    post('/api/summarize', { bloco: 'Bloco 1: Fonética', errosRegistrados: [], tagProfessor: null, transcript: 'Aluno: oi' }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), out);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.model, 'claude-haiku-4-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.ok(sent.output_config.format.schema.properties.caderno, 'schema inclui o Caderno');
  assert.match(sent.system, /caderno/);
});

test('summarize: sessão sem regra nova devolve caderno null', async () => {
  const out = { regra_ensinada: 'Revisão', novos_erros: [], avancar_bloco: false, caderno: null };
  routes['https://anthropic.test/v1/messages'] = () =>
    Response.json({ ...message, content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
  const res = await summarize(
    post('/api/summarize', { bloco: 'Bloco 1: Fonética', errosRegistrados: [], tagProfessor: null, transcript: 'Aluno: oi' }),
  );
  assert.deepEqual(await res.json(), out);
});

test('chat continua no Sonnet', async () => {
  routes['https://anthropic.test/v1/messages'] = () =>
    sse([
      { type: 'message_start', message },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } },
      { type: 'message_stop' },
    ]);
  const vars = teacherPromptVars(createInitialProgress('Lucas'));
  await (await chat(post('/api/chat', { vars, messages: [{ role: 'user', content: 'Oi' }] }))).text();
  assert.equal(JSON.parse(calls[0].init.body).model, 'claude-sonnet-5');
});

test('variável de ambiente ausente gera mensagem clara', async () => {
  const saved = process.env.FISH_AUDIO_API_KEY;
  delete process.env.FISH_AUDIO_API_KEY;
  const res = await tts(post('/api/tts', { text: 'Bonjour' }));
  process.env.FISH_AUDIO_API_KEY = saved;
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /FISH_AUDIO_API_KEY/);
});
