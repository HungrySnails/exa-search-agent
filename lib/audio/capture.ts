// マイク → 16kHz PCM16LE (AudioWorklet 経由)。Live APIの入力音声の形式に合わせる。

const TARGET_SAMPLE_RATE = 16000;

export class MicCapture {
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  // 捕まえたチャンクとRMS(音量メーター表示用)を常に onChunk に渡す。
  async start(onChunk: (base64Pcm: string, rms: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: TARGET_SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Android など 16000 を拒むブラウザでは実際のサンプルレートに寄るため、
    // AudioContext 側でも明示的に 16000 を要求する。
    this.context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    // 接続ボタンのクリックから時間が経っていると suspended のままになりうるので明示的に resume する。
    await this.context.resume().catch(() => {});
    await this.context.audioWorklet.addModule("/pcm-worklet.js");

    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, "pcm-capture-processor");

    this.workletNode.port.onmessage = (
      event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>
    ) => {
      const { pcm, rms } = event.data;
      const base64 = arrayBufferToBase64(pcm);
      onChunk(base64, rms);
    };

    this.sourceNode.connect(this.workletNode);
    // workletNode を destination には繋がない(マイク音をそのまま再生しない)。
  }

  get actualSampleRate(): number {
    return this.context?.sampleRate ?? TARGET_SAMPLE_RATE;
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.workletNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.context = null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
