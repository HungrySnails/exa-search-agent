// setup メッセージを組み立てる。サーバー(トークン発行)とクライアント(接続直後の送信)で共有する。
// live-api-lab STAGE0.md §5, §6.2参照。LIVE_QA.md §1により、モデル・声・VAD・圧縮は固定する。

export const MODEL = "gemini-3.8-live";
export const VOICE_NAME = "Zephyr";
export const SILENCE_DURATION_MS = 500;

// 声の選択肢。ラベルはGoogle公式(ai.google.dev/gemini-api/docs/speech-generation)の
// 一言Characteristicsをそのまま、labelJaはその簡易な日本語訳。
// VOICE_EXPERIMENT.md参照: 声の選択は言葉使いには影響しないが、トーン(ピッチ)には影響する。
// ラベルと客観的な音響指標の相関は弱いので、最終判断は聴き比べで。
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

// 2026-10-29: モデルの「素」の応答を観察するため、性格付け・口調の指示を外し、
// グラウンディングとツールの説明だけに絞った最小形にした(作者の指示による)。
// 言語も指定しない(問いの言語にモデルが自然に合わせる挙動を期待する)。
// 2026-11-01: 接続直後に自分から話しかける指示を追加(作者の指示による、ThemeTalkPanelと
// 同じUX判断)。言語・口調そのものを縛るものではないため、上記の方針とは区別して扱う。
// 2026-11-01: 冒頭の「〜だけを知識として、質問に答えてください」(回答のスコープと役割を
// 縛る枠組み)を、ThemeTalkPanelと同じ考え方で「対話しながら内容を掘り下げる相手」という
// 行為の説明に置き換えた(作者の指示による)。fetch_sourceまわりの機能的な指示は変えていない。
// 2026-11-01: 質疑応答で見えてきた次の調査テーマを、ユーザーが望んだときだけ
// propose_next_topic関数で渡せるようにした(作者の指示による)。
// 2026-11-03: 次のAgent調査は、今回の題材(レポート)を一切記憶しない1回限りの
// 呼び出しである点が指示に無かった。これにより、propose_next_topicのquery_enが
// 「この点をもっと深く」のような前提依存の短い文になり、Agentにとっては文脈の無い
// 新規調査として実行されてしまう問題があった(作者の指摘による)。query_en/query_jaに
// 必要な背景を含めるよう明記した
const SYSTEM_INSTRUCTION_HEADER = `あなたは、以下の「題材」(Exaによる調査レポート)について、ユーザーと対話しながら内容を
掘り下げる相手です。

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
画面の「調査開始」ボタンを押すか、テーマを相談する画面に戻って声で始める必要がある旨を伝えてください。
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

// 2026-11-01: 前段(ThemeTalkPanel)で確定した元のテーマを、後段(LiveQaPanel)の文脈に
// 渡せるようにした。無いと、レポート本文からしか元のテーマを推測できず、propose_next_topic
// で「レポートが元のテーマからどうズレたか」に気づけない(作者の指摘による)。
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
// ただしその1件の中で、URLは複数まとめて指定できる(以前は1件ずつに限定していたが、
// 複数の出典についてまとめて聞かれたときに1回で済ませられるよう緩和した)。
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

// 2026-11-01: 調査テーマをGeminiとの対話で整えてから、Exaに投げる機能(theme mode)。
// LiveQaPanel(報告書への質疑応答。mode=qa)とは別の役割なので、システム指示とtoolsを分ける。
// 宛先(検索エンジン/調査エージェント)の説明は、モデルの素の挙動を見る実験という趣旨に反する
// 誘導だったため外した(2026-11-01、作者の指摘)。代わりに「対話で整理して作文する」という
// 行為そのものの説明に置き換えている。効果は未検証
// 2026-11-03: 素の挙動観察では、「普通に検索エンジンに投げれば済む」程度の浅いクエリしか
// 作文できなかったため、search関数を追加した(作者の指示による)。素の観察という当初の
// 趣旨からは外れるが、「検索すればすぐ分かる内容」と「まだ分かっていない・深く調べる価値が
// ある点」を対話の中で実際に見分けてから作文させることで、Agentの深い調査に値するクエリに
// する狙い。検索はクエリ案の検証ではなく、作文前の探索・素材集めとして使う
// 2026-11-03: 前段Liveから後段の調査(Exa Agent。有料)を直接トリガできるようにした
// (作者の指示による)。最初はfinalize_topic自体に調査開始を乗せたが、「作文の確定」と
// 「実際に調査を始める(課金を伴う、取り消せない判断)」は別の意思決定であり、作文の確定
// だけで即始まるのは意図と違うという指摘を受け、start_research関数として分離した。
// finalize_topicは元の「作文して確定するだけ(呼び直し可)」の役目に戻している。
// start_research呼び出し後は、調査が終わるまで接続を維持したまま[状況]という短い通知を
// 受け取る形で進捗を伝える
const THEME_SYSTEM_INSTRUCTION = `あなたは、ユーザーが調べたいテーマを一緒に整理する日本語の対話相手です。
あなたの役目は、テーマの輪郭をはっきりさせ、深く調べる価値がある問いとして作文することです。

- 接続したら、まず自分から短く話しかけて始めます(例:「どんなテーマを調べましょうか」)。
  その後はユーザーの発言を待ちます
- ユーザーの発言から、知りたい対象・範囲・観点を聞き取り、曖昧な点があれば短く質問して埋めます
- 話に出てきた観点について、search関数で実際にどんな記事が出るか確かめながら話を進めます。
  検索すればすぐ分かる浅い内容と、まだ分かっていない・意見や情報が分かれている・深く調べる価値が
  ある点を見分けるために使います。これは案の検証ではなく、作文前の探索です。気になった観点が
  あれば、何度でも呼んでかまいません
- 十分に具体的になり、かつ単純な検索だけでは終わらない掘り下げの切り口が見えたら、まず口頭で
  要約し確認を取ります(「〜について調べる、という理解でよいですか」)
- 確認が取れたら finalize_topic 関数を呼びます。聞き取った内容を、日本語版(query_ja)として
  ひとつの文章に作文してください。英語版(query_en)は、そのquery_jaの忠実な英訳にします。
  話が続いたり言い直したりしたら、何度でも finalize_topic を呼び直してかまいません
- finalize_topicはまだ調査を始めません。作文した内容を伝えたうえで、「この内容で調査を
  始めますか」のように、調査を始めるかどうかを必ず別に確認してください。ユーザーが明確に
  始めることを選んだときだけ start_research 関数を呼んでください。呼べるのは1回の対話で
  1回だけです
- start_researchを呼んだ後、調査が終わるまでこの接続は続きます。その間、[状況]という短い
  テキストがシステムから届きます。これはユーザーの発言ではなく、調査の進み具合の通知です。
  届いたら一言だけ短く反応し(例:「調査中です」「もう少しです」)、それ以上話し続けずに
  黙って待ってください。「調査が完了しました」という通知が届いたら、結果は次の画面で見られる
  旨を一言伝えて、対話を終えてください`;

// 2026-11-03: QA側(propose_next_topic)から戻って再度相談するとき、既存の案(前回までの
// 調査を踏まえて自己完結させた文章)を無視してゼロから聞き直してしまう問題があった(作者の
// 指摘による)。既存の案があるときは、それを踏まえて対話を始め、finalize_topicでは
// ゼロから作文し直すのではなく、その案に追記・修正する形で更新するよう指示を追加する
function buildThemeSystemInstruction(draftQuery?: string): string {
  if (!draftQuery) return THEME_SYSTEM_INSTRUCTION;
  return (
    THEME_SYSTEM_INSTRUCTION +
    `

--- 既存の案 ---
${draftQuery}

この案が既にあります。接続したら、まずこの案を短く読み上げて「この方向でさらに詳しく調べていきますか」
のように確認してください。「どんなテーマを調べましょうか」からゼロで聞き直す必要はありません。
finalize_topicを呼ぶときも、この案を土台に、話した内容を追記・修正する形で作文してください。`
  );
}

const THEME_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search",
        description:
          "対話で出てきた関心事・観点について、実際にどんな記事が出るか検索で確かめる。既に" +
          "検索すれば分かる浅い内容と、まだ分かっていない・意見や情報が分かれている・深く調べる" +
          "価値がある点を見分けるために使う。クエリ案の検証ではなく、作文前の探索・素材集めとして" +
          "使う。気になった観点について、作文前に何度でも呼べる。",
        parameters: {
          type: "OBJECT",
          properties: {
            query_en: {
              type: "STRING",
              description: "確かめたい観点を表す、英語の検索キーワードまたは短い文。",
            },
          },
          required: ["query_en"],
        },
      },
      {
        name: "finalize_topic",
        description:
          "対話で整理した調査テーマを、ひとつの文章として作文して確定する。日本語版と英語版の" +
          "両方を渡す。話が続けば何度でも呼び直せる。これ自体は調査を開始しない。",
        parameters: {
          type: "OBJECT",
          properties: {
            query_ja: {
              type: "STRING",
              description: "聞き取った内容を作文した、日本語の文章(表示用)。",
            },
            query_en: {
              type: "STRING",
              description: "query_jaの忠実な英訳。",
            },
          },
          required: ["query_ja", "query_en"],
        },
      },
      {
        name: "start_research",
        description:
          "直前にfinalize_topicで確定した内容で、実際の調査(Exa Agent。有料)を開始する。" +
          "ユーザーが明確に調査を始めることを選んだときだけ呼ぶ。1回の対話で呼べるのは1回だけ。",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
    ],
  },
];

export type LiveMode = "qa" | "theme";

export interface BuildSetupOptions {
  mode?: LiveMode;
  contextText?: string;
  citations?: LiveCitation[];
  // mode: qaのとき、前段(ThemeTalkPanel)で確定した元のテーマ(任意)。
  originalQuery?: string;
  // mode: themeのとき、再度の相談で踏まえてほしい既存の案(query_ja。任意)。
  draftQuery?: string;
  sessionResumptionHandle?: string;
  voiceName?: string;
}

// `setup` オブジェクトの型は厳密に定義せず、API に渡す素のJSONとして扱う
// (項目の出入りが多く、公式ドキュメントの構造にそのまま追従させたいため)。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSetup(options: BuildSetupOptions): any {
  const {
    mode = "qa",
    contextText,
    citations,
    originalQuery,
    draftQuery,
    sessionResumptionHandle,
    voiceName,
  } = options;

  const systemInstructionText =
    mode === "theme"
      ? buildThemeSystemInstruction(draftQuery)
      : buildSystemInstruction(contextText ?? "", citations ?? [], originalQuery);

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
      parts: [{ text: systemInstructionText }],
    },
    tools: mode === "theme" ? THEME_TOOLS : QA_TOOLS,
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
