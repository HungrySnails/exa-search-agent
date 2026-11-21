// setup メッセージを組み立てる。サーバー(トークン発行)とクライアント(接続直後の送信)で共有する。
// 結果への質疑応答に使う。モデル・声・VAD・圧縮は固定する。

export const MODEL = "gemini-3.8-live";
export const VOICE_NAME = "Zephyr";
export const SILENCE_DURATION_MS = 500;

// 声の選択肢。ラベルはGoogle公式(ai.google.dev/gemini-api/docs/speech-generation)の
// 一言Characteristicsをそのまま、labelJaはその簡易な日本語訳。
export interface VoiceOption {
  name: string;
  gender: "male" | "female";
  label: string;
  labelJa: string;
}

export const VOICE_CATALOG: VoiceOption[] = [
  { name: "Achernar", gender: "female", label: "Soft", labelJa: "柔らかい" },
  { name: "Achird", gender: "male", label: "Friendly", labelJa: "親しみやすい" },
  { name: "Algenib", gender: "male", label: "Gravelly", labelJa: "ざらついた" },
  { name: "Algieba", gender: "male", label: "Smooth", labelJa: "滑らか" },
  { name: "Alnilam", gender: "male", label: "Firm", labelJa: "しっかりした" },
  { name: "Aoede", gender: "female", label: "Breezy", labelJa: "軽やか" },
  { name: "Autonoe", gender: "female", label: "Bright", labelJa: "明るい" },
  { name: "Callirrhoe", gender: "female", label: "Easy-going", labelJa: "気楽" },
  { name: "Charon", gender: "male", label: "Informative", labelJa: "説明的" },
  { name: "Despina", gender: "female", label: "Smooth", labelJa: "滑らか" },
  { name: "Enceladus", gender: "male", label: "Breathy", labelJa: "息づかいが感じられる" },
  { name: "Erinome", gender: "female", label: "Clear", labelJa: "澄んだ" },
  { name: "Fenrir", gender: "male", label: "Excitable", labelJa: "興奮しやすい" },
  { name: "Gacrux", gender: "female", label: "Mature", labelJa: "大人びた" },
  { name: "Iapetus", gender: "male", label: "Clear", labelJa: "澄んだ" },
  { name: "Kore", gender: "female", label: "Firm", labelJa: "しっかりした" },
  { name: "Laomedeia", gender: "female", label: "Upbeat", labelJa: "上向き・軽快" },
  { name: "Leda", gender: "female", label: "Youthful", labelJa: "若々しい" },
  { name: "Orus", gender: "male", label: "Firm", labelJa: "しっかりした" },
  { name: "Puck", gender: "male", label: "Upbeat", labelJa: "上向き・軽快" },
  { name: "Pulcherrima", gender: "female", label: "Forward", labelJa: "前のめり" },
  { name: "Rasalgethi", gender: "male", label: "Informative", labelJa: "説明的" },
  { name: "Sadachbia", gender: "male", label: "Lively", labelJa: "活発" },
  { name: "Sadaltager", gender: "male", label: "Knowledgeable", labelJa: "物知り" },
  { name: "Schedar", gender: "male", label: "Even", labelJa: "均一・落ち着いた" },
  { name: "Sulafat", gender: "female", label: "Warm", labelJa: "温かい" },
  { name: "Umbriel", gender: "male", label: "Easy-going", labelJa: "気楽" },
  { name: "Vindemiatrix", gender: "female", label: "Gentle", labelJa: "優しい" },
  { name: "Zephyr", gender: "female", label: "Bright", labelJa: "明るい" },
  { name: "Zubenelgenubi", gender: "male", label: "Casual", labelJa: "くだけた" },
];

export function isValidVoiceName(name: string): boolean {
  return VOICE_CATALOG.some((v) => v.name === name);
}

// 性別を切り替えたときに最初に選ばれる声。
export const DEFAULT_VOICE_BY_GENDER = {
  female: "Zephyr",
  male: "Zubenelgenubi",
} as const;

// 言語・留保・URLの扱いは明示的に指示する。指示が無くても日本語で答え、留保を残し、URLを
// 読み上げないことが多いが、利用者や題材が変わっても同じ挙動になるよう、安全側に倒す。
const SYSTEM_INSTRUCTION_HEADER = `あなたは、以下の「題材」(Exaによる調査レポート)について、ユーザーと対話しながら内容を
掘り下げる相手です。

- 回答は常に日本語の話し言葉で行います。題材が英語でも、日本語で答えてください
- 題材にある区別や留保(「〜ではない」「確認できない」「〜とは限らない」など)は、省略せずに
  そのまま伝えます。言い切りに丸めません
- URLは読み上げません。根拠を聞かれたら、出典の名前(媒体名・組織名)で答えます

接続したら、まず自分から短く話しかけて始めてください(例:「レポートについて、何でも聞いてください」)。
その後はユーザーの発言を待ってください。

題材に無い詳細まで掘り下げたいときは、fetch_source関数で出典(下の「参照元一覧」)の本文を
取得できます。取得を始める前に、どの出典を確認するか一言断ってから呼び出してください。
取得が終わったら、何を取得できたかを一言述べてから、その内容にもとづいて答えてください。

対話の中で、題材にない新しい観点や、もっと掘り下げたい点が見えてきたときは、それを次の調査として
進めたいかユーザーに確認してください。進めることになったら、propose_next_topic関数を呼び、
その内容を日本語版(query_ja)としてひとつの文章に作文してください。英語版(query_en)は、
そのquery_jaの忠実な英訳にします。ユーザーが望んでいないのに自分から提案する必要はありません。

次のAgent調査は、今回の題材(このレポート)を覚えていない、まったく新規の調査として実行されます。
そのため query_ja・query_en には、「この点をもっと深く」のような前提依存の短い言い方ではなく、
今回の題材から必要な背景(分かったこと・まだ分かっていないこと)を一緒に書き込んだ、それだけで
調査を始められる自己完結した一文にしてください。

重要: propose_next_topicは、次の調査の案を画面のクエリ欄に反映するだけです。これを呼んでも
実際の調査は一切始まりません。この対話には、調査を実際に開始する手段がありません。ユーザーが
「その内容で調査して」のように開始を求めても、あなた自身が調査を始めることはできないので、
「開始しました」「バックグラウンドで実行中です」のように、していないことを話してはいけません。
画面の「調査開始」ボタンを押して、声で始める必要がある旨を伝えてください。
`;

export interface LiveCitation {
  url: string;
  title: string | null;
}

function buildReferenceList(citations: LiveCitation[]): string {
  if (citations.length === 0) return "";
  const lines = citations.map(
    (c, i) => `${i + 1}. ${c.title ?? "(タイトル不明)"} — ${c.url}`
  );
  return `\n\n--- 参照元一覧 ---\n${lines.join("\n")}`;
}

// 元の調査テーマ(Agent modeのクエリ欄の入力)を文脈に渡す。無いと、レポート本文からしか
// 元のテーマを推測できず、propose_next_topicで「レポートが元のテーマからどうズレたか」に
// 気づけない。
function buildOriginalQuerySection(originalQuery?: string): string {
  if (!originalQuery) return "";
  return `--- 最初に依頼した調査テーマ ---\n${originalQuery}\n\n`;
}

export function buildSystemInstruction(
  contextText: string,
  citations: LiveCitation[],
  originalQuery?: string
): string {
  return (
    SYSTEM_INSTRUCTION_HEADER +
    "\n" +
    buildOriginalQuerySection(originalQuery) +
    "--- 題材 ---\n" +
    contextText +
    buildReferenceList(citations)
  );
}

// fetch_sourceの1件だけ。音声対話では選択肢が多いほどモデルが迷うため、最小限にする。
// ただしその1件の中で、URLは複数まとめて指定できる。
const QA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "fetch_source",
        description:
          "参照元一覧にある出典のURLを1件以上指定して、その記事の本文をまとめて取得する。題材(調査レポート)に無い詳細を聞かれたときに使う。複数の出典についてまとめて聞かれたときは、1回の呼び出しでURLを複数指定できる。",
        parameters: {
          type: "OBJECT",
          properties: {
            urls: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "取得する出典のURL(参照元一覧に記載されているもの)。1件以上指定する。",
            },
          },
          required: ["urls"],
        },
      },
      {
        name: "propose_next_topic",
        description:
          "質疑応答の中で見えてきた、次の調査テーマを提案して確定する。ユーザーが次の調査として" +
          "進めたいと望んだときだけ呼ぶ。日本語版と英語版の両方を渡す。",
        parameters: {
          type: "OBJECT",
          properties: {
            query_ja: {
              type: "STRING",
              description: "次の調査テーマを作文した、日本語の文章(表示用)。",
            },
            query_en: {
              type: "STRING",
              description: "query_jaの忠実な英訳。",
            },
          },
          required: ["query_ja", "query_en"],
        },
      },
    ],
  },
];

export interface BuildSetupOptions {
  contextText: string;
  citations?: LiveCitation[];
  originalQuery?: string;
  sessionResumptionHandle?: string;
  voiceName?: string;
}

// `setup` オブジェクトの型は厳密に定義せず、API に渡す素のJSONとして扱う
// (項目の出入りが多く、公式ドキュメントの構造にそのまま追従させたいため)。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSetup(options: BuildSetupOptions): any {
  const { contextText, citations, originalQuery, sessionResumptionHandle, voiceName } = options;

  return {
    model: `models/${MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName ?? VOICE_NAME },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: buildSystemInstruction(contextText, citations ?? [], originalQuery) }],
    },
    tools: QA_TOOLS,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        silenceDurationMs: SILENCE_DURATION_MS,
      },
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
    },
    sessionResumption: sessionResumptionHandle
      ? { handle: sessionResumptionHandle }
      : {},
    contextWindowCompression: { slidingWindow: {} },
  };
}
