// Reconhecimento de fala nativo do navegador (Web Speech API). Sem servidor próprio, sem custo.
// Chrome/Edge/Safari expõem a API (às vezes com prefixo webkit); Firefox não.

export const LANGS = {
  fr: { code: 'fr-FR', label: 'FR' },
  pt: { code: 'pt-BR', label: 'PT' },
};

// Pausa (sem nenhum resultado novo) que conta como "terminou de falar".
export const SILENCE_MS = 1800;

export function getSpeechRecognition(scope = globalThis) {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const isSpeechRecognitionSupported = () => getSpeechRecognition() !== null;

const ERROR_MESSAGES = {
  'not-allowed': 'Permissão de microfone negada. Libere o microfone para este site nas configurações do navegador.',
  'service-not-allowed': 'O navegador bloqueou o reconhecimento de voz. Verifique as permissões de microfone e de reconhecimento de fala.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'O reconhecimento de voz do navegador precisa de internet e não conseguiu se conectar.',
  'language-not-supported': 'Este navegador não reconhece fala neste idioma.',
};

export class SpeechError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] ?? `Erro no reconhecimento de voz (${code}).`);
    this.name = 'SpeechError';
    this.code = code;
  }
}

// Uma escuta = uma fala do aluno. Mostra texto interino enquanto a pessoa fala e
// entrega o texto final quando ela para (silêncio) ou quando finish() é chamado.
export class Listener {
  constructor({ lang, onInterim, onFinal, onError, silenceMs = SILENCE_MS, Recognition = getSpeechRecognition() }) {
    if (!Recognition) throw new SpeechError('unsupported');
    this.Recognition = Recognition;
    this.lang = lang;
    this.silenceMs = silenceMs;
    this.onInterim = onInterim ?? (() => {});
    this.onFinal = onFinal ?? (() => {});
    this.onError = onError ?? (() => {});
    this.finalText = '';
    this.interimText = '';
    this.done = false;
  }

  start() {
    const rec = new this.Recognition();
    this.rec = rec;
    rec.lang = this.lang;
    rec.continuous = true; // não corta na primeira pausa curta; o fim é decidido pelo timer de silêncio
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      this.finalText = finalText;
      this.interimText = interimText;
      this.onInterim(this.text());
      this.armSilenceTimer();
    };

    rec.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') return; // tratado no onend como fala vazia
      this.error = new SpeechError(event.error);
    };

    rec.onend = () => {
      clearTimeout(this.silenceTimer);
      if (this.done) return;
      this.done = true;
      if (this.error && !this.text()) this.onError(this.error);
      else this.onFinal(this.text());
    };

    rec.start();
  }

  text() {
    return `${this.finalText}${this.interimText}`.replace(/\s+/g, ' ').trim();
  }

  armSilenceTimer() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.finish(), this.silenceMs);
  }

  // Encerra a escuta e entrega o que foi reconhecido (via onFinal, no evento onend).
  finish() {
    clearTimeout(this.silenceTimer);
    this.rec?.stop();
  }

  // Descarta a escuta sem entregar nada.
  cancel() {
    clearTimeout(this.silenceTimer);
    this.done = true;
    this.rec?.abort();
  }
}
