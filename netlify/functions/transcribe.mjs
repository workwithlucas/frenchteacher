// STT: recebe o áudio gravado (multipart, campo "file") e repassa ao Whisper.
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';

// Dica de contexto pro Whisper: o aluno alterna português e francês.
const WHISPER_PROMPT =
  'Aula de francês. O aluno brasileiro fala em português e em francês. Bonjour, je voudrais pratiquer le passé composé.';

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  try {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!file || typeof file === 'string') return jsonError(400, 'Arquivo de áudio ausente.');

    const form = new FormData();
    form.append('file', file, file.name || 'audio.webm');
    form.append('model', 'whisper-1');
    form.append('prompt', WHISPER_PROMPT);
    form.append('response_format', 'json');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text();
      return jsonError(res.status, `Whisper falhou (${res.status}).`, { detail: detail.slice(0, 500) });
    }
    const data = await res.json();
    return Response.json({ text: (data.text ?? '').trim() });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: '/api/transcribe' };
