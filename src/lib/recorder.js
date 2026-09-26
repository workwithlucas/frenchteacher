// Gravação do microfone com MediaRecorder. Safari/iOS grava em audio/mp4; Chrome/Firefox em webm/ogg.

const CANDIDATES = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'mp4' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
];

function pickFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported?.(c.mime)) ?? { mime: '', ext: 'webm' };
}

export async function openMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não permite gravar áudio (é preciso HTTPS e um navegador recente).');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

export function closeMicrophone(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

export class Recorder {
  constructor(stream) {
    this.stream = stream;
    this.format = pickFormat();
    if (!this.format) throw new Error('Gravação de áudio não suportada neste navegador.');
  }

  start() {
    this.chunks = [];
    this.startedAt = performance.now();
    this.recorder = new MediaRecorder(this.stream, this.format.mime ? { mimeType: this.format.mime } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
  }

  // Resolve com { blob, filename, durationMs } quando a gravação termina.
  stop() {
    return new Promise((resolve) => {
      const rec = this.recorder;
      rec.onstop = () => {
        const type = rec.mimeType || this.format.mime || 'audio/webm';
        const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        resolve({
          blob: new Blob(this.chunks, { type }),
          filename: `fala.${ext}`,
          durationMs: performance.now() - this.startedAt,
        });
      };
      rec.stop();
    });
  }

  cancel() {
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
  }
}
