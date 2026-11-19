// AudioWorklet : renvoie des blocs PCM mono + niveau RMS au thread principal.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          let s = 0;
          for (let j = 0; j < this.n; j++) s += this.buf[j] * this.buf[j];
          const rms = Math.sqrt(s / this.n);
          const out = this.buf.slice(0);
          this.port.postMessage({ pcm: out, rms }, [out.buffer]);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
