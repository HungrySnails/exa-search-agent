# Exa総合検索

*This project's UI and documentation are written in Japanese, as it was built for Japanese-speaking
users. The app itself works regardless of language, but expect Japanese throughout the interface and
this README.*

[Exa API](https://exa.ai/) の2つの機能を切り替えて使えるツールです。1つの画面・1つのパスワードゲートの中に、
速い検索の **Exa Search** と、深い多段階調査の **Exa Agent** という独立した2つのモードを用意しており、
目的に応じて横断的に使い分けられます。両モードとも [Google AI Studio (Gemini API)](https://aistudio.google.com/)
で日本語訳・要約・読み上げを行います。Vercelの無料枠にデプロイすることを想定しています。

> **想定している使い方**: 本アプリは、利用者が各自でExa・GeminiのAPIキーを取得し、自分自身（または
> 身内程度の少人数）の個人的な利用のためにデプロイして使うことを想定して開発しています。不特定多数への
> 公開や商用利用を妨げるものではありません（ライセンスは[MIT](#ライセンス)です）が、そうした用途は
> 動作確認やサポートの対象外であり、APIコストやセキュリティ面の配慮は利用者自身の責任で行ってください。

## モード

UI上の選択肢は、Exa側の呼称（APIの値）にそろえて「日本語(API値)」の形で表記しています。

### Exa Search（検索）
- Exaの `/search` API + Geminiの日本語要約による、速いWeb検索
- 自由入力でキーワード検索し、入力中のクエリはモード切替をまたいで保持される
- **検索タイプ(type)**: 自動(auto)※既定 / 高速(fast) / 即時(instant) / 軽量ディープ(deep-lite) /
  ディープ(deep) / ディープ推論(deep-reasoning)。ディープ系は既定で10件を取得して多角的な総括を、それ以外は6件
- **カテゴリ(category)**: 指定なし / ニュース(news)※既定 / 企業(company) / 学術文献(publication) /
  個人サイト(personal site) / 財務報告(financial report) / 人物(people)
- **詳細オプション**: 件数(numResults、1〜25件) / 対象ドメイン(includeDomains) / 除外ドメイン(excludeDomains) /
  公開日(startPublishedDate・endPublishedDate) / 地域(userLocation) / 鮮度(maxAgeHours) /
  不適切コンテンツ除外(moderation)。Exaが受け付けない組み合わせ（企業・人物での公開日、人物での除外ドメイン）は入力不可
- 要約カードにExaの呼び出しコストを表示
- レスポンス: 数秒〜1分程度

### Exa Agent（調査）
- [Exa Agent API](https://exa.ai/docs/agent/quickstart) による、出典付きの多段階Web調査レポート生成
- **調査レベル(effort)**: 最小(minimal)※既定 / 低(low) / 中(medium) / 高(high)。NDJSONストリーミングで進捗を表示
- 出典付きレポート（Markdown表示）と参照元一覧、コスト表示
- レスポンス: 数十秒〜数分

### 本アプリで扱っていないExaの機能
Exaの選択肢をすべて網羅してはいません。各モードの画面下部にも同じ注記を折りたたみで表示しています。

| 機能 | できること | 料金 |
|---|---|---|
| 最高(xhigh) | 固定料金で最も徹底したAgent調査 | $1.00/回 |
| 自動(auto) | 調査の範囲に応じてExaが計算量を決めるAgent調査 | 従量課金。上限は既定$5/回（$1〜$100で指定可） |
| ウルトラ(ultra) | 大規模なリスト作成や網羅的な調査。通常30分前後、最長3時間 | 従量課金。上限は既定$20/回 |
| 構造化出力(outputSchema)ほか | Agentの調査の継続(previousRunId)・外部データ連携(dataSources)、Searchの目的(objective)・追加クエリ(additionalQueries)・指示文(systemPrompt) | 料金表に個別の記載なし |
| 回答生成(/answer) | 検索結果をもとに出典付きの回答文を直接返す | $0.005/回 |
| 本文以外の取得 | 抜粋(highlights)・ページ要約(summary)・サブページ巡回(subpages)・リンクや画像(extras) | 抜粋・要約は1ページ$0.001 |
| 件数26〜100件 | 1回の検索で多くの結果を取得 | 11件目以降は1件$0.001 |
| Websets | 条件に合う企業・人物などを大量に集めて検証し、リスト化する別サービス | 別体系 |

Agentの従量課金の単価は、計算量1単位(ACU)あたり$0.10、検索1回あたり$0.005です。`xhigh`・`auto`・`ultra`は、
1回の処理をVercelの実行時間の上限（300秒）内に収める本アプリの作りでは扱えないため対象外にしています。

両モード共通で、次の仕組みがあります。

- **月ごとのExa利用額**: モード切替タブの下に、今月（日本時間の月末締め）と先月のExa利用額・回数を表示します。
  各回の結果に含まれるExaのコストをブラウザに記録して合計しているため、他の端末での利用分は含みません。
- **Geminiが失敗しても結果を捨てない**: Exaの検索・調査が済んだ後にGeminiの翻訳・要約が失敗した場合（利用上限など）は、
  英語の原文や要約なしの記事一覧を、理由の注記付きで表示します。Exaに支払った分の結果が失われないようにするためです。
- **エラーの日本語化**: Exa・Geminiのエラーは、利用上限・クレジット残高不足・APIキーの問題などを日本語で表示します。
- **共有・書式付きコピー**: 総括・要約・調査結果の各カードから、メールなどへ転記できます（主な用途はモバイルから
  新規メールの下書きを起こすこと）。
  - 「共有」… OSの共有シート（Web Share API）にMarkdown本文を渡します。対応ブラウザでのみ表示されます。
  - 「書式付きコピー」… 書式付き（HTML）とMarkdownテキストを同時にクリップボードへ書き込みます。
    貼り付け先が書式に対応していれば見出し・太字・表の罫線が残り、非対応ならMarkdownが貼られます。
  - URLはリンクにせず平文で記載し、調査結果には末尾に参照元一覧を付けます。ただし受信側のメールアプリが
    URLを自動でリンク化することは防げません。
  - どちらもHTTPS（または`localhost`）でのみ動作します。LAN内のIPアドレス（`http://192.168.x.x:3000`等）で
    開いた開発サーバーでは使えません。

両モードとも、結果を音声で読み上げ可能です（ブラウザ標準の音声合成、またはGemini TTSの `/api/tts`。詳細は
「TTS（読み上げ）について」を参照）。

## 構成

- Next.js (App Router) + TypeScript + Tailwind CSS。Exa・Gemini共にSDKは使わず、素の `fetch` で呼び出し
- `lib/auth.ts` … 固定パスワードの検証
- `lib/http.ts` … APIルート共通の認証+環境変数チェック（`requireEnv`）、クエリ検証（`validateQuery`）
- `lib/exa-client.ts` … Exa APIへの共通fetch基盤（`/search`・Agent Runs両方が使用）
- `lib/exa-options.ts` … UIに出すExaの選択肢（表記・料金の目安）と、APIルートでの入力検証（両モード共通）
- `lib/gemini.ts` … Gemini呼び出しの共通ヘルパー（日本語判定、翻訳、要約、タイトル翻訳）
- `lib/news.ts` … Exa `/search` 検索 + Gemini要約（Search modeのみが使用）
- `lib/exa-agent.ts` … Exa Agent Runs APIのラッパー（Agent modeのみが使用）
- `lib/speech/segment.ts` … TTS用のテキスト分割・リンク除去（両モード共通）
- `lib/share-export.ts` … 共有・コピー用テキストの組み立て（Markdownリンクの平文化、参照元一覧の付加）
- `hooks/useBroadcast.ts` … 読み上げ（ブラウザ/Gemini二択、再生・一時停止・キャッシュ・リトライ）の状態管理（両モード共通）
- `hooks/usePasswordGate.ts` … パスワードゲートの状態管理
- `components/BroadcastPanel.tsx` / `components/PasswordGate.tsx` / `components/SidebarLayout.tsx` /
  `components/CollapsibleSection.tsx` / `components/Notes.tsx`（エラー表示・コスト表示・空状態ヒント） /
  `components/ShareActions.tsx`（共有・書式付きコピー。書式付きコピー用のHTMLも`react-markdown`から生成） … 共通UI
- `components/modes/SearchMode.tsx` / `components/modes/AgentMode.tsx` … モード別UI
- `app/api/search/route.ts` … Search mode用APIルート
- `app/api/agent/route.ts` … Agent mode用APIルート（NDJSONストリーミング）
- `app/api/tts/route.ts` … Gemini音声合成APIルート（両モード共通）
- `app/page.tsx` … シェル（パスワードゲート + モード切替タブ、検索クエリの状態を保持）

## 事前準備

1. **Exa APIキー**: https://dashboard.exa.ai/ で発行（Agent Runs APIを使う場合は対応プランが必要）
2. **Gemini APIキー**: https://aistudio.google.com/apikey で無料のAPIキーを発行
3. 任意の合言葉（配布用の固定パスワード）を決める

## ローカル開発

```bash
npm install
cp .env.local.example .env.local
# .env.local を編集して EXA_API_KEY / GEMINI_API_KEY / APP_PASSWORD を設定
npm run dev
```

http://localhost:3000 を開いて動作確認できます。

## Vercelへのデプロイ

1. GitHubなどにリポジトリをpushする
2. [Vercel](https://vercel.com/new) でこのリポジトリをインポート
3. Project Settings → Environment Variables に以下を設定
   - `EXA_API_KEY`
   - `GEMINI_API_KEY`
   - `APP_PASSWORD`
   - （任意）`SHOW_GEMINI_USAGE` = `1` : 画面上部の月額表示に、Geminiのトークン数の月間合計を加えます。金額は出しません（単価や無料枠は変わりやすいため）。読み上げ(TTS)の分は含みません
4. Deploy

デプロイ後に発行されるURLに、スマートフォンなどからアクセスしてください。初回アクセス時にパスワードを
入力するとブラウザに保存され、以降は入力不要になります。

## Vercel Hobbyプランでの運用に関する注意

このアプリはVercelの無料枠（Hobbyプラン）での運用を想定していますが、Hobbyプランには以下の制約があります
（2026年時点のVercel公式ドキュメントに基づく）。

- **非商用・個人利用限定**: Hobbyプランは[Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)上、
  個人の非商用利用のみを対象としています。収益化や業務利用を行う場合はProプラン（有料）が必要です。
- **Function実行時間**: Hobbyプランの関数実行時間はデフォルト・上限ともに300秒です（Fluid Computeが有効な
  場合。新規プロジェクトではデフォルトで有効）。本アプリの`app/api/agent/route.ts`は`maxDuration=300`を
  指定しておりHobbyプランの上限と同値のため、Fluid Computeが無効化されていると最大300秒まで動作しない
  可能性があります。プロジェクト設定で有効になっているか確認してください。
- **呼び出し回数・CPU時間などの枠**: Function Invocations（月100万回）、Active CPU時間（月4時間）、
  Fast Data Transfer（月100GB）などの上限があります。個人利用であれば通常は十分な余裕がありますが、
  上限に達すると機能が一時停止し、原則30日間再利用できません。
- **Runtime Logsの保持期間**: Hobbyプランでは1時間のみです。デプロイ後のエラー調査は早めに行う必要があります。
- **デプロイ回数**: 1日あたり100回までです。
- 本アプリの合言葉（`APP_PASSWORD`）によるパスワードゲートは、アプリケーション層で独自に実装したものです。
  Vercelの「Deployment Protection」機能（Hobbyでも利用できる`Vercel Authentication`や、Pro限定の
  `Password Protection`）とは別物なので、混同しないよう注意してください。

## 無料枠・利用コストに関する余裕度

呼び出し先ごとに無料枠/コストの余裕度がかなり異なるため、把握しておくと運用で困りにくくなります。

- **Exaの無料クレジット**: 登録時に$10が付与され、毎月1日に$10へ戻る（支払い方法の登録は不要）。
  ダッシュボードでのオンボーディング完了で、初回のみ$10のボーナスもある。
- **Exa `/search`（Search mode）**: 1回あたり（10件まで）即時(instant) $0.004、自動(auto)・高速(fast) $0.007、
  軽量ディープ(deep-lite)・ディープ(deep) $0.012、ディープ推論(deep-reasoning) $0.015（11件目以降は
  1件$0.001の追加）。月$10の無料枠で数百〜千回以上使える。
- **Exa Agent（Agent mode）**: 調査レベル(effort)ごとの固定課金（最小(minimal) $0.012 / 低(low) $0.025 /
  中(medium) $0.10 / 高(high) $0.50 per request）で、Search modeより1回あたりのコストが大きい。
  月$10の無料枠では、高(high)なら20回、低(low)なら400回が目安になるため、高い調査レベルでの連続実行は余裕を見ながら行うこと。
- **Gemini（テキスト生成・翻訳・要約、`gemini-3.5-flash-lite`）**: 無料枠のレート制限は比較的緩く、
  通常のインタラクティブな利用であれば日常的に上限に達することは少ない。
- **Gemini TTS（音声合成）**: 無料枠のレート制限が非常に厳しく（1日あたりの呼び出し回数上限が一桁台に
  設定されている場合がある）、他の呼び出しに比べて圧倒的に余裕がない。詳細は次項を参照。

## TTS（読み上げ）について

読み上げ機能のGemini音声エンジンは **実験的な機能** として用意しているものです。長文は複数セグメントに
分割してから音声合成APIを呼び出す実装になっているため、1回の読み上げ操作だけで無料枠の呼び出し回数上限に
達してしまうことが十分にあり得ます（要約1回分の読み上げでも内部的に複数回のAPI呼び出しが発生する）。
上限に達すると自動的にブラウザ標準の音声合成（追加コストなし・無制限）にフォールバックしますが、
Gemini音声を前提にした運用（安定した音質・多人数配布など）は想定していません。普段使いには
ブラウザ音声エンジンを基本とし、Gemini音声は「試せる時に試す」程度の位置づけで利用してください。

## 注意

- Search modeは操作時のみ実行されます（自動更新なし）。
- Agent modeはNDJSONで進捗をストリーミングするため、調査レベルによって数秒〜数分かかります（`maxDuration=300`）。
- 無料枠の上限に達した場合はエラーメッセージが表示されます（TTSはブラウザ音声への自動フォールバックあり）。

## セキュリティに関する注意

- `APP_PASSWORD`による認証は、固定の合言葉をリクエストヘッダーで都度送信する簡易的な仕組みです
  （ハッシュ化やセッション管理は行っていません）。身内・少人数への配布を想定した簡易ゲートであり、
  不特定多数へ公開する用途には向いていません。URLとパスワードの両方を知る人は誰でもAPIを呼び出せる
  （＝API利用コストを発生させられる）ため、合言葉は推測されにくいものにし、他人に知られた場合は
  速やかに変更してください。
- `.env*`は`.gitignore`で除外済みです（テンプレートの`.env.local.example`のみ例外的にコミット対象）。
  ただし、GitHubへの初回push前には`git status`で実際にAPIキーなどの秘密情報を含むファイルが
  含まれていないか必ず確認してください。
- Exa・Gemini（Google AI Studio）のAPIキーは各自で取得したものを使用してください。本リポジトリに
  APIキーは含まれておらず、利用時はExa・Googleそれぞれの利用規約・料金ポリシーに従う責任は利用者側にあります。
  特に、送信する検索クエリやレポート本文の扱いについては次項「送信データの取り扱いについて」も参照してください。

## 送信データの取り扱いについて（Exa / Gemini）

本アプリは入力した検索クエリ・調査テーマや、取得した記事・レポート本文をExaおよびGemini（Google AI Studio）
のAPIに送信します。両社とも無料枠での利用時は送信データを自社サービスの改善・モデルの学習に使う場合がある
ことを利用規約・プライバシーポリシーで明記しているため、公開前に把握しておくことを推奨します。

- **Exa**: [プライバシーポリシー](https://exa.ai/privacy-policy)には、検索クエリ等の利用データ
  （Query Data）について「当社製品・技術の改善に利用し、これにはサービスを支えるモデルの学習・
  ファインチューニングを含む」と明記されています。保持期間やAPI利用者向けのオプトアウト手段についての
  記載は（2026年時点で確認できる範囲では）見当たりません。個人情報や機密情報を検索クエリに含めないよう
  注意してください。
- **Gemini API / Google AI Studio**: [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)
  では、**課金が有効化されていない（無料枠の）利用**は「Unpaid Services」として扱われ、送信したプロンプト・
  生成結果をGoogleの製品・MLモデルの改善に利用すること、人によるレビューが行われる可能性があることが
  明記されています（レビュー前にアカウント等の情報とは切り離される）。一方、**課金を有効化した利用**は
  「Paid Services」として扱われ、改善目的での利用は行われません（濫用検知のため一定期間のログは保持されます）。
  本アプリの`.env.local.example`で案内している無料のAPIキーはデフォルトでは「Unpaid Services」に該当するため、
  同様に機密情報・個人情報を含むクエリやレポートを送らないよう注意してください。
- いずれの制約も利用規約・料金プラン次第で変わり得るため、実際に公開・運用する前に各社の最新の
  利用規約・プライバシーポリシーを直接確認することを推奨します。

## ライセンス

[MIT License](./LICENSE)（[日本語参考訳](./LICENSE.ja.md)。法的効力を持つのは英語の原文のみです）

