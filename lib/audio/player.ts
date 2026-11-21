// 24kHz PCM16LE の逐次再生。interrupted 受信時にスケジュール済みの再生を破棄する。

const PLAYBACK_SAMPLE_RATE = 24000;

interface ScheduledSource {
  node: AudioBufferSourceNode;
  startAt: number;
  duration: number;
}

export class PcmPlayer {
  private context: AudioContext;
  private nextStartTime = 0;
  private activeSources: ScheduledSource[] = [];

  constructor() {
    this.context = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
  }

  // Android の自動再生制限を避けるため、ユーザー操作(接続ボタン)の中で呼ぶ。
  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  get currentTime(): number {
    return this.context.currentTime;
  }

  // 予約済みの音声があと何秒で鳴り終わるか。音声はサーバーから実時間より速く届き、
  // 先の時刻に予約されるため、turnCompleteの時点ではまだ鳴っていない部分がある。
  get remainingPlaybackSeconds(): number {
    return Math.max(0, this.nextStartTime - this.context.currentTime);
  }

  // 新しい出力ターンの開始。
  beginTurn(): void {
    this.activeSources = [];
  }

  enqueueBase64Pcm(base64: string): void {
    const bytes = base64ToUint8Array(base64);
    const pcm16 = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength / 2
    );
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x8000;
    }

    const buffer = this.context.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    const startAt = Math.max(this.nextStartTime, this.context.currentTime);
    const duration = buffer.duration;
    source.start(startAt);
    this.nextStartTime = startAt + duration;

    const entry: ScheduledSource = { node: source, startAt, duration };
    this.activeSources.push(entry);
    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== entry);
    };
  }

  // interrupted: 予定済みの再生を全て止め、次の再生開始位置を現在時刻に戻す。
  interrupt(): void {
    for (const s of this.activeSources) {
      try {
        s.node.stop();
      } catch {
        // already stopped/ended; ignore
      }
    }
    this.activeSources = [];
    this.nextStartTime = this.context.currentTime;
  }

  close(): void {
    this.interrupt();
    this.context.close();
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
