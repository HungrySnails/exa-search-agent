"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BroadcastPanel } from "@/components/BroadcastPanel";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CostLine, EmptyHint, ErrorBanner, NoticeBanner, ScopeNote } from "@/components/Notes";
import { ShareActions } from "@/components/ShareActions";
import { SidebarLayout } from "@/components/SidebarLayout";
import { useBroadcast } from "@/hooks/useBroadcast";
import { buildResultTitle, useDocumentTitle } from "@/hooks/useDocumentTitle";
import { EFFORT_OPTIONS, type ResearchEffort } from "@/lib/exa-options";

const MAX_QUERY_CHARS = 500;

type Citation = {
  url: string;
  title: string | null;
};

type ResearchResult = {
  text: string;
  citations: Citation[];
  costDollars: number | null;
  elapsedMs: number;
  effort: ResearchEffort;
  summary: string;
  notices: string[];
};

// Mirrors the NDJSON events app/api/agent/route.ts streams while the Exa
// Agent run is still in progress.
type ResearchStreamEvent =
  | { type: "status"; phase: "translating_query" | "starting" }
  | { type: "status"; phase: "running"; status: string; elapsedMs: number }
  | { type: "status"; phase: "translating_result" }
  | { type: "status"; phase: "summarizing" }
  | {
      type: "result";
      text: string;
      citations: Citation[];
      costDollars: number | null;
      summary: string;
      notices: string[];
    }
  | { type: "error"; error: string };

function describeResearchStatus(event: ResearchStreamEvent): string {
  switch (event.type === "status" ? event.phase : null) {
    case "translating_query":
      return "調査クエリを英語に翻訳しています…";
    case "starting":
      return "調査を開始しています…";
    case "running": {
      const e = event as { status: string; elapsedMs: number };
      const seconds = Math.round(e.elapsedMs / 1000);
      const label = e.status === "queued" ? "待機中(queued)" : "実行中(running)";
      return seconds > 0 ? `${label}…（経過 ${seconds}秒）` : `${label}…`;
    }
    case "translating_result":
      return "調査結果を日本語に翻訳しています…";
    case "summarizing":
      return "要約を作成しています…";
    default:
      return "処理中…";
  }
}

// Shared ReactMarkdown renderers for the report and summary cards.
const markdownComponents = {
  h1: (props: React.ComponentProps<"h1">) => (
    <h1 className="mb-2 mt-4 text-base font-bold text-neutral-100 first:mt-0" {...props} />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mb-2 mt-4 text-base font-bold text-neutral-100 first:mt-0" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mb-1.5 mt-3 text-sm font-bold text-neutral-100 first:mt-0" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => <p className="mb-3 last:mb-0" {...props} />,
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-neutral-100" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-3 list-disc space-y-1 pl-5" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5" {...props} />
  ),
  li: (props: React.ComponentProps<"li">) => <li {...props} />,
  a: (props: React.ComponentProps<"a">) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 underline underline-offset-2"
    />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote className="mb-3 border-l-2 border-neutral-700 pl-3 text-neutral-400" {...props} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code className="break-words rounded bg-neutral-800 px-1 py-0.5 text-xs" {...props} />
  ),
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="mb-3 overflow-x-auto rounded-lg bg-neutral-800 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0"
      {...props}
    />
  ),
  table: (props: React.ComponentProps<"table">) => (
    <div className="mb-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className="border border-neutral-700 px-2 py-1 text-left font-semibold text-neutral-100"
      {...props}
    />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border border-neutral-800 px-2 py-1 align-top" {...props} />
  ),
  hr: () => <hr className="my-4 border-neutral-800" />,
};

export function AgentMode({
  password,
  onUnauthorized,
  onCost,
  query: queryInput,
  onQueryChange: setQueryInput,
}: {
  password: string;
  onUnauthorized: () => void;
  onCost: (dollars: number) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [effort, setEffort] = useState<ResearchEffort>("minimal");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [queryLabel, setQueryLabel] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Default reads only the summary; checking this reads the full report.
  const [readFullText, setReadFullText] = useState(false);

  const broadcast = useBroadcast({ password, resetKey: result });
  const resultEffortLabel = result
    ? (EFFORT_OPTIONS.find((opt) => opt.id === result.effort)?.label ?? result.effort)
    : null;
  useDocumentTitle(
    queryLabel && result ? buildResultTitle(queryLabel, `Exa Agent (${resultEffortLabel})`) : null,
  );

  function buildSpeechText(full = readFullText) {
    if (!result) return "";
    return full || !result.summary ? result.text : result.summary;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = queryInput.trim();
    if (!query) return;

    setLoading(true);
    setError(null);
    setStatusMessage("調査を開始しています…");
    setResult(null);
    setSourcesOpen(false);

    const startedAt = performance.now();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-password": password,
        },
        body: JSON.stringify({ query, effort }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) onUnauthorized();
        throw new Error(data.error ?? "調査に失敗しました");
      }
      if (!res.body) throw new Error("応答の読み取りに失敗しました");

      // The server streams progress events (NDJSON) while the Exa Agent run
      // is still polling, then a final "result" or "error" event.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: Omit<ResearchResult, "elapsedMs" | "effort"> | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ResearchStreamEvent;
          if (event.type === "status") {
            setStatusMessage(describeResearchStatus(event));
          } else if (event.type === "result") {
            finalResult = {
              text: event.text,
              citations: event.citations,
              costDollars: event.costDollars,
              summary: event.summary,
              notices: event.notices ?? [],
            };
          } else if (event.type === "error") {
            streamError = event.error;
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!finalResult) throw new Error("調査結果の取得に失敗しました");
      setResult({ ...finalResult, elapsedMs: performance.now() - startedAt, effort });
      if (finalResult.costDollars !== null) onCost(finalResult.costDollars);
      setQueryLabel(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  }

  return (
    <SidebarLayout
      sidebar={
        <>
          <header className="mb-6">
            <h1 className="text-xl font-bold md:text-2xl">Exa Agent</h1>
          </header>

          <form onSubmit={handleSearch} className="space-y-2">
            <textarea
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="調査したいテーマを自由に入力してください（日本語でも英訳して検索します）"
              maxLength={MAX_QUERY_CHARS}
              rows={3}
              className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-neutral-500"
            />
            <div>
              <div className="mb-1 text-xs text-neutral-500">調査レベル(effort)・1回の料金</div>
              <div className="grid grid-cols-4 gap-1">
                {EFFORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEffort(opt.id)}
                    className={`rounded-lg border px-1 py-1.5 text-xs font-medium leading-tight ${
                      effort === opt.id
                        ? "border-sky-500 bg-sky-950/60 text-sky-200"
                        : "border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {opt.label}
                    <span className="block text-[10px] font-normal">({opt.id})</span>
                    <span className="block text-[10px] font-normal opacity-70">{opt.price}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !queryInput.trim()}
              className="w-full rounded-xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 active:opacity-80 disabled:opacity-40"
            >
              {loading ? "調査中…" : "調査開始"}
            </button>
          </form>

          {loading && statusMessage && (
            <p className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
              {statusMessage}（最大数分かかります）
            </p>
          )}

          {error && <ErrorBanner message={error} />}
          {result && <NoticeBanner messages={result.notices} />}

          {result?.summary && (
            <section className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4">
              <h2 className="mb-2 text-xs font-semibold text-emerald-400">
                {queryLabel ? `「${queryLabel}」の要約` : "要約"}
              </h2>
              <div className="report-markdown text-sm leading-relaxed text-neutral-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {result.summary}
                </ReactMarkdown>
              </div>
              <ShareActions
                heading={queryLabel ? `「${queryLabel}」の要約` : "要約"}
                body={result.summary}
              />
            </section>
          )}

          {result && (
            <BroadcastPanel
              isSpeaking={broadcast.isSpeaking}
              isPaused={broadcast.isPaused}
              isSynthesizing={broadcast.isSynthesizing}
              playbackDone={broadcast.playbackDone}
              replayFromCache={broadcast.replayFromCache}
              ttsSupported={broadcast.ttsSupported}
              ttsEngine={broadcast.ttsEngine}
              ttsError={broadcast.ttsError}
              onEngineChange={broadcast.changeEngine}
              onToggle={() => broadcast.toggle(buildSpeechText())}
              onStop={broadcast.stop}
              idleLabel="レポート読み上げ"
              playLabel="▶ レポートを読み上げる"
              beforeControls={
                <label className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    checked={readFullText}
                    onChange={(e) => {
                      if (broadcast.isSpeaking) broadcast.stop();
                      setReadFullText(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-red-500"
                  />
                  全文を読み上げる（既定では要約のみ）
                </label>
              }
            />
          )}

          <ScopeNote>
            <p>
              Exaの調査レベルには、ほかに次の3つがあります。本アプリは1回の処理をVercelの実行時間の上限（300秒）内に収める作りのため、対象外にしています。
            </p>
            <ul className="list-disc space-y-1 pl-4">
              <li>最高(xhigh): 固定料金で最も徹底した調査。$1.00/回</li>
              <li>自動(auto): 調査の範囲に応じてExaが計算量を決める。従量課金で、上限は既定$5/回（$1〜$100で指定可）</li>
              <li>ウルトラ(ultra): 大規模なリスト作成や網羅的な調査向け。通常30分前後、最長3時間。従量課金で、上限は既定$20/回</li>
            </ul>
            <p>
              従量課金の単価は、計算量1単位(ACU)あたり$0.10、検索1回あたり$0.005です。このほか、結果をJSONで受け取る構造化出力(outputSchema)、前回の調査の続き(previousRunId)、外部データ連携(dataSources)にも対応していません。
            </p>
          </ScopeNote>
        </>
      }
    >
      {result && (
        <section className="mt-6 rounded-xl border border-sky-900 bg-sky-950/40 p-4">
          <h2 className="mb-1 text-xs font-semibold text-sky-400">
            {queryLabel ? `「${queryLabel}」の調査結果` : "調査結果"}
          </h2>
          <p className="mb-2 text-[11px] text-neutral-500">
            Exa Agent ・ 調査レベル {resultEffortLabel}({result.effort})
          </p>
          <div className="report-markdown text-sm leading-relaxed text-neutral-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {result.text}
            </ReactMarkdown>
          </div>
          <CostLine dollars={result.costDollars} elapsedMs={result.elapsedMs} />
          <ShareActions
            heading={queryLabel ? `「${queryLabel}」の調査結果` : "調査結果"}
            body={result.text}
            citations={result.citations}
          />
        </section>
      )}

      {result && result.citations.length > 0 && (
        <CollapsibleSection
          label={`参照元（${result.citations.length}件）`}
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((open) => !open)}
        >
          <ul className="space-y-3">
            {result.citations.map((citation, i) => (
              <li key={`${citation.url}-${i}`}>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-neutral-800 bg-neutral-900 p-4 active:bg-neutral-800"
                >
                  <h3 className="mb-1 text-sm font-semibold leading-snug">
                    {citation.title ?? citation.url}
                  </h3>
                  <p className="truncate text-xs text-neutral-500">{citation.url}</p>
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {!loading && !result && !error && (
        <EmptyHint>調査したいテーマを入力して「調査開始」を押してください</EmptyHint>
      )}
    </SidebarLayout>
  );
}
