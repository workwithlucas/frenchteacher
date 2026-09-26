// Captura de repetição guiada: STT + confiança de pronúncia via AssemblyAI Universal
// Streaming (fala → texto em tempo real, mais confiança por palavra). Só entra em cena
// quando o professor pede pra repetir uma palavra/frase específica (tag expectedRepeat);
// o resto da conversa continua na Web Speech API, sem passar por aqui.
import { getAssemblyAiToken } from './api.js';
import { keytermsFor, summarizeWords } from '../../shared/pronunciation.js';

const WS_URL = 'wss://streaming.assemblyai.com/v3/ws';
const SPEECH_MODEL = 'universal-3-5-pro';

export class RepeatCaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RepeatCaptureError';
  }
}

export function isRepeatCaptureSupported(scope = globalThis) {
  return Boolean(scope.WebSocket && (scope.AudioContext || scope.webkitAudioContext));
}

// Mesma "forma" da Listener (start/finish/cancel + onInterim/onFinal/onError), pra caber
// no mesmo lugar do fluxo de captura em App.jsx.
export class RepeatCapture {
  constructor({
    expectedRepeat,
    onInterim,
    onFinal,
    onError,
    fetchToken = getAssemblyAiToken,
    WebSocketImpl = globalThis.WebSocket,
    AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext,
    getMedia = () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
  } = {}) {
    if (!WebSocketImpl || !AudioContextImpl) {
      throw new RepeatCaptureError('Captura de repetição não suportada neste navegador.');
    }
    this.expectedRepeat = expectedRepeat;
    this.onInterim = onInterim ?? (() => {});
    this.onFinal = onFinal ?? (() => {});
    this.onError = onError ?? (() => {});
    this.fetchToken = fetchToken;
    this.WebSocketImpl = WebSocketImpl;
    this.AudioContextImpl = AudioContextImpl;
    this.getMedia = getMedia;
    this.done = false;
    this.lastTranscript = '';
    this.lastWords = [];
  }

  async start() {
    try {
      const token = await this.fetchToken();
      if (this.done) return;
      this.stream = await this.getMedia();
      if (this.done) return this.cleanup();
      this.audioCtx = new this.AudioContextImpl();
      await this.connect(token, this.audioCtx.sampleRate);
      if (this.done) return this.cleanup();
      this.startAudio();
    } catch (err) {
      this.done = true;
      this.cleanup();
      this.onError(err instanceof Error ? err : new RepeatCaptureError(String(err)));
    }
  }

  connect(token, sampleRate) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        sample_rate: String(Math.round(sampleRate)),
        encoding: 'pcm_s16le',
        speech_model: SPEECH_MODEL,
        format_turns: 'true',
        keyterms_prompt: JSON.stringify(keytermsFor(this.expectedRepeat)),
        token,
      });
      const ws = new this.WebSocketImpl(`${WS_URL}?${params.toString()}`);
      this.ws = ws;
      this.wsOpenState = this.WebSocketImpl.OPEN ?? 1;
      ws.binaryType = 'arraybuffer';
      let opened = false;
      ws.onopen = () => {
        opened = true;
        resolve();
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
      ws.onerror = () => {
        if (!opened) reject(new RepeatCaptureError('Não consegui conectar ao reconhecimento de pronúncia.'));
      };
      ws.onclose = () => {
        if (!this.done) this.finishWithLast();
      };
    });
  }

  startAudio() {
    this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);
    // ScriptProcessorNode é obsoleto, mas funciona em todos os navegadores atuais sem
    // exigir publicar um módulo de AudioWorklet à parte — suficiente pra um trecho curto.
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== this.wsOpenState) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.ws.send(int16.buffer);
    };
    this.sourceNode.connect(this.processor);
    this.processor.connect(this.audioCtx.destination); // necessário no Safari pro processor rodar
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type !== 'Turn') return;
    this.lastTranscript = msg.transcript ?? '';
    this.lastWords = msg.words ?? [];
    this.onInterim(this.lastTranscript);
    if (msg.end_of_turn) this.finishWithLast();
  }

  finishWithLast() {
    if (this.done) return;
    this.done = true;
    const transcript = this.lastTranscript.trim();
    const { media, piorPalavra } = transcript ? summarizeWords(this.lastWords) : { media: null, piorPalavra: null };
    this.sendTerminate();
    this.cleanup();
    this.onFinal({ transcript, media, piorPalavra });
  }

  // Encerra e finaliza com o que já foi reconhecido até agora (equivalente a Listener.finish()).
  finish() {
    this.finishWithLast();
  }

  // Descarta a captura sem entregar nada.
  cancel() {
    if (this.done) return;
    this.done = true;
    this.sendTerminate();
    this.cleanup();
  }

  sendTerminate() {
    try {
      if (this.ws?.readyState === this.wsOpenState) this.ws.send(JSON.stringify({ type: 'Terminate' }));
    } catch {
      // já fechado
    }
  }

  cleanup() {
    try {
      this.processor?.disconnect();
    } catch {
      /* nó já desconectado */
    }
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* nó já desconectado */
    }
    this.audioCtx?.close?.().catch(() => {});
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      this.ws?.close();
    } catch {
      /* já fechado */
    }
  }
}
