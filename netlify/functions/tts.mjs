// TTS: texto → áudio MP3 via Fish Audio.
import { checkAccess, handleError, jsonError, methodGuard, requireEnv } from './_lib/http.mjs';

const MAX_CHARS = 2000;

export default async (req) => {
  const denied = methodGuard(req) ?? checkAccess(req);
  if (denied) return denied;

  try {
    const apiKey = requireEnv('FISH_AUDIO_API_KEY');
    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) return jsonError(400, 'Texto vazio.');
    if (text.length > MAX_CHARS) return jsonError(400, 'Texto longo demais para um trecho de TTS.');

    const body = { text, format: 'mp3', mp3_bitrate: 64, latency: 'balanced' };
    if (process.env.FISH_AUDIO_VOICE_ID) body.reference_id = process.env.FISH_AUDIO_VOICE_ID;

    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (process.env.FISH_AUDIO_MODEL) headers.model = process.env.FISH_AUDIO_MODEL;

    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      return jsonError(res.status, `Fish Audio falhou (${res.status}).`, { detail: detail.slice(0, 500) });
    }
    const audio = await res.arrayBuffer();
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: '/api/tts' };
