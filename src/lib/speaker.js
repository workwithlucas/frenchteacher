// Fila de reprodução: toca os trechos de TTS em ordem, enquanto os seguintes ainda
// estão sendo sintetizados. Usa um único <audio> "destravado" num toque do usuário,
// requisito do iOS para tocar áudio que chega depois de uma chamada de rede.

function silentWavUrl() {
  const sampleRate = 8000;
  const samples = 400; // 50 ms
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export class Speaker {
  constructor({ onSpeakingChange, onError } = {}) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = [];
    this.generation = 0;
    this.speaking = false;
    this.pumping = false;
    this.onSpeakingChange = onSpeakingChange ?? (() => {});
    this.onError = onError ?? (() => {});
  }

  // Chamar dentro de um evento de toque/clique.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.src = silentWavUrl();
    this.audio.play().catch(() => {});
  }

  setSpeaking(value) {
    if (this.speaking !== value) {
      this.speaking = value;
      this.onSpeakingChange(value);
    }
  }

  // blobPromise: Promise<Blob> de um trecho de áudio (já em andamento).
  enqueue(blobPromise) {
    blobPromise.catch(() => {}); // o erro é tratado quando chegar a vez do trecho
    this.queue.push(blobPromise);
    if (!this.pumping) this.pump();
  }

  async pump() {
    const gen = this.generation;
    this.pumping = true;
    this.setSpeaking(true);
    while (this.queue.length && gen === this.generation) {
      const next = this.queue.shift();
      let blob;
      try {
        blob = await next;
      } catch (err) {
        if (gen === this.generation) this.onError(err);
        continue;
      }
      if (gen !== this.generation) break;
      await this.play(blob);
    }
    if (gen === this.generation) {
      this.pumping = false;
      this.setSpeaking(false);
      this.idleResolvers?.forEach((r) => r());
      this.idleResolvers = [];
    }
  }

  play(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const done = () => {
        this.audio.onended = this.audio.onerror = null;
        this.finishCurrent = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      this.finishCurrent = done;
      this.audio.onended = done;
      this.audio.onerror = done;
      this.audio.src = url;
      this.audio.play().catch((err) => {
        this.onError(err);
        done();
      });
    });
  }

  // Resolve quando a fila atual terminar de tocar (ou for interrompida).
  whenIdle() {
    if (!this.pumping) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleResolvers = [...(this.idleResolvers ?? []), resolve];
    });
  }

  // Interrompe a fala imediatamente (ex.: aluno começou a falar).
  stop() {
    this.generation += 1;
    this.queue = [];
    this.audio.pause();
    this.finishCurrent?.();
    this.pumping = false;
    this.setSpeaking(false);
    this.idleResolvers?.forEach((r) => r());
    this.idleResolvers = [];
  }
}
