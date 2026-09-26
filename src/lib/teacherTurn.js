// Um turno do professor: stream do Claude → trechos de frase → TTS em paralelo → fila de áudio.
import { chatStream, tts } from './api.js';
import { extractAdvanceTag, extractExpectedRepeat, safeSpeakLength, takeSpeakableChunks } from '../../shared/progress.js';

const FIRST_CHUNK_MIN = 25; // primeiro trecho curto: a voz começa logo
const NEXT_CHUNK_MIN = 120; // depois, trechos maiores: menos chamadas e prosódia melhor

// Nenhuma das duas tags ocultas (avancar_bloco, expectedRepeat) é falada ou mostrada.
const stripHiddenTags = (text) => extractAdvanceTag(extractExpectedRepeat(text).clean).clean;

export async function runTeacherTurn({ vars, messages, speaker, onText, signal }) {
  let spokenUpTo = 0; // índice no texto bruto até onde já foi mandado ao TTS
  const speak = (text) => speaker.enqueue(tts(text));

  const raw = await chatStream({
    vars,
    messages,
    signal,
    onDelta: (text) => {
      const safe = text.slice(0, safeSpeakLength(text));
      onText(safe);
      const { chunks, consumed } = takeSpeakableChunks(
        safe.slice(spokenUpTo),
        spokenUpTo === 0 ? FIRST_CHUNK_MIN : NEXT_CHUNK_MIN,
      );
      spokenUpTo += consumed;
      chunks.forEach(speak);
    },
  });

  // O que sobrou depois do último fim de frase (sem as tags, que não são faladas).
  const rest = stripHiddenTags(raw.slice(spokenUpTo));
  if (rest) speak(rest);

  const { value: expectedRepeat, clean: withoutRepeatTag } = extractExpectedRepeat(raw);
  const { value: advanceTag, clean } = extractAdvanceTag(withoutRepeatTag);
  onText(clean);
  return { raw, clean, advanceTag, expectedRepeat };
}
