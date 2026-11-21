// AudioWorkletProcessor: Float32 入力を Int16LE PCM にまとめてメインスレッドへ渡す。
// 約100ms(16kHzなら1,600サンプル=3,200バイト)ごとに1回 postMessage する。
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._samples = [];
    this._sampleCount = 0;
    // 128サンプル(1クオンタム)× 必要回数で約100msに合わせる。
    this._targetSamples = Math.round(sampleRate * 0.1);
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel) {
      this._samples.push(channel.slice());
      this._sampleCount += channel.length;
    }

    if (this._sampleCount >= this._targetSamples) {
      const merged = new Float32Array(this._sampleCount);
      let offset = 0;
      for (const chunk of this._samples) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const pcm16 = new Int16Array(merged.length);
      let sumSquares = 0;
      for (let i = 0; i < merged.length; i++) {
        const s = Math.max(-1, Math.min(1, merged[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        sumSquares += s * s;
      }
      const rms = Math.sqrt(sumSquares / merged.length);

      this.port.postMessage({ pcm: pcm16.buffer, rms }, [pcm16.buffer]);
      this._samples = [];
      this._sampleCount = 0;
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
