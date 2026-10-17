"use client";

import { useState } from "react";
import { BroadcastPanel } from "@/components/BroadcastPanel";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { CostLine, EmptyHint, ErrorBanner, NoticeBanner, ScopeNote } from "@/components/Notes";
import { ShareActions } from "@/components/ShareActions";
import { SidebarLayout } from "@/components/SidebarLayout";
import { useBroadcast } from "@/hooks/useBroadcast";
import {
  CATEGORY_OPTIONS,
  DEFAULT_CATEGORY,
  MAX_AGE_HOURS_OPTIONS,
  MAX_NUM_RESULTS,
  SEARCH_TYPE_OPTIONS,
  USER_LOCATION_OPTIONS,
  categoryAllowsExcludeDomains,
  categoryAllowsPublishedDate,
  defaultNumResults,
  type SearchCategory,
  type SearchType,
} from "@/lib/exa-options";

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedDate: string | null;
  summary: string;
};

const MAX_QUERY_CHARS = 200;

const FIELD_CLASS =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 outline-none [color-scheme:dark] focus:border-neutral-500 disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function splitDomains(text: string): string[] {
  return text
    .split(/[\s,、]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function SearchMode({
  password,
  onUnauthorized,
  onCost,
  query,
  onQueryChange,
}: {
  password: string;
  onUnauthorized: () => void;
  onCost: (dollars: number) => void;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [overview, setOverview] = useState("");
  const [costDollars, setCostDollars] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [searchType, setSearchType] = useState<SearchType>("auto");
  const [category, setCategory] = useState<SearchCategory | "">(DEFAULT_CATEGORY);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [numResults, setNumResults] = useState("");
  const [includeDomains, setIncludeDomains] = useState("");
  const [excludeDomains, setExcludeDomains] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [userLocation, setUserLocation] = useState("");
  const [maxAgeHours, setMaxAgeHours] = useState("");
  const [moderation, setModeration] = useState(false);
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  // When on, the reading also covers each article's summary below the overview.
  const [readSummaries, setReadSummaries] = useState(false);

  const broadcast = useBroadcast({ password, resetKey: overview });

  const selectedCategory = category || null;
  const allowsPublishedDate = categoryAllowsPublishedDate(selectedCategory);
  const allowsExcludeDomains = categoryAllowsExcludeDomains(selectedCategory);
  const typeHint = SEARCH_TYPE_OPTIONS.find((opt) => opt.id === searchType)?.hint;

  function buildSpeechText(withSummaries = readSummaries) {
    const segments = [overview];
    if (withSummaries) {
      for (const item of items) {
        const summary = item.summary.trim();
        if (!summary) continue;
        segments.push(
          `次に「${item.source}」からの「${item.title}」という記事の要約です。\n${summary}`
        );
      }
    }
    return segments.join("\n\n");
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setNotices([]);
    const startedAt = performance.now();
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-password": password,
        },
        // Fields the selected category can't use are left out, matching the
        // disabled inputs, rather than sent and rejected by the server.
        body: JSON.stringify({
          query: trimmed,
          type: searchType,
          category: selectedCategory,
          numResults: numResults ? Number(numResults) : null,
          includeDomains: splitDomains(includeDomains),
          excludeDomains: allowsExcludeDomains ? splitDomains(excludeDomains) : [],
          startPublishedDate: allowsPublishedDate ? startDate || null : null,
          endPublishedDate: allowsPublishedDate ? endDate || null : null,
          userLocation: userLocation || null,
          moderation,
          maxAgeHours: maxAgeHours === "" ? null : Number(maxAgeHours),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) onUnauthorized();
        throw new Error(data.error ?? "取得に失敗しました");
      }
      setItems(data.items);
      setOverview(data.overview ?? "");
      setCostDollars(typeof data.costDollars === "number" ? data.costDollars : null);
      setElapsedMs(performance.now() - startedAt);
      if (typeof data.costDollars === "number") onCost(data.costDollars);
      setNotices(Array.isArray(data.notices) ? data.notices : []);
      setFetchedAt(data.fetchedAt);
      setSearchLabel(trimmed);
      setListOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SidebarLayout
      sidebar={
        <>
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-bold md:text-2xl">Exa Search</h1>
            {fetchedAt && (
              <span className="text-xs text-neutral-500">
                {new Date(fetchedAt).toLocaleString("ja-JP", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                時点
              </span>
            )}
          </header>

          <form onSubmit={handleSearch} className="space-y-2">
            <textarea
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="調査したいテーマを自由に入力してください（日本語でも英訳して検索します）"
              maxLength={MAX_QUERY_CHARS}
              rows={2}
              className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-neutral-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="検索タイプ(type)">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as SearchType)}
                  className={FIELD_CLASS}
                >
                  {SEARCH_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="カテゴリ(category)">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SearchCategory | "")}
                  className={FIELD_CLASS}
                >
                  <option value="">指定なし</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-[11px] text-neutral-500">
              目安: {typeHint}（10件まで。11件目以降は1件$0.001）
            </p>

            <CollapsibleSection
              label="詳細オプション"
              open={optionsOpen}
              onToggle={() => setOptionsOpen((open) => !open)}
              toggleClassName="mt-1"
            >
              <div className="space-y-3 rounded-xl border border-neutral-800 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="件数(numResults)">
                    <input
                      type="number"
                      min={1}
                      max={MAX_NUM_RESULTS}
                      value={numResults}
                      onChange={(e) => setNumResults(e.target.value)}
                      placeholder={`既定 ${defaultNumResults(searchType)}件`}
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <Field label="地域(userLocation)">
                    <select
                      value={userLocation}
                      onChange={(e) => setUserLocation(e.target.value)}
                      className={FIELD_CLASS}
                    >
                      <option value="">指定なし</option>
                      {USER_LOCATION_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="対象ドメイン(includeDomains)">
                  <textarea
                    value={includeDomains}
                    onChange={(e) => setIncludeDomains(e.target.value)}
                    placeholder="例: nikkei.com（改行区切り）"
                    rows={2}
                    className={`${FIELD_CLASS} resize-none`}
                  />
                </Field>
                <Field
                  label={`除外ドメイン(excludeDomains)${
                    allowsExcludeDomains ? "" : " ※人物(people)では指定できません"
                  }`}
                >
                  <textarea
                    value={excludeDomains}
                    onChange={(e) => setExcludeDomains(e.target.value)}
                    disabled={!allowsExcludeDomains}
                    placeholder="例: example.com（改行区切り）"
                    rows={2}
                    className={`${FIELD_CLASS} resize-none`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="公開日・開始(startPublishedDate)">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={!allowsPublishedDate}
                      className={FIELD_CLASS}
                    />
                  </Field>
                  <Field label="公開日・終了(endPublishedDate)">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={!allowsPublishedDate}
                      className={FIELD_CLASS}
                    />
                  </Field>
                </div>
                {!allowsPublishedDate && (
                  <p className="text-[11px] text-neutral-500">
                    ※企業(company)・人物(people)では公開日を指定できません
                  </p>
                )}
                <Field label="鮮度(maxAgeHours)">
                  <select
                    value={maxAgeHours}
                    onChange={(e) => setMaxAgeHours(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">指定なし（キャッシュ優先）</option>
                    {MAX_AGE_HOURS_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    checked={moderation}
                    onChange={(e) => setModeration(e.target.checked)}
                    className="h-4 w-4 accent-sky-500"
                  />
                  不適切コンテンツ除外(moderation)
                </label>
              </div>
            </CollapsibleSection>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-sm font-semibold text-neutral-100 active:opacity-80 disabled:opacity-40"
            >
              {loading ? "検索中…" : "検索"}
            </button>
          </form>

          <ScopeNote>
            <p>Exaの検索APIには、本アプリで扱っていない次の機能もあります。</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>回答生成(/answer): 検索結果をもとに、出典付きの回答文を直接返す。$0.005/回</li>
              <li>
                構造化出力(outputSchema)・目的(objective)・追加クエリ(additionalQueries)・指示文(systemPrompt):
                検索の意図を細かく伝え、結果をAIに統合・整形させる。料金表に個別の記載なし（outputSchemaは約2秒遅くなる）
              </li>
              <li>
                本文以外の取得: 関連箇所の抜粋(highlights)・ページ要約(summary)・サブページ巡回(subpages)・リンクや画像の取得(extras)など。抜粋と要約は1ページ$0.001
              </li>
              <li>件数26〜100件: 11件目以降は1件$0.001（本アプリは要約処理の都合で25件まで）</li>
              <li>Websets: 条件に合う企業・人物などを大量に集めて検証し、リストにする別サービス。料金体系も別</li>
            </ul>
          </ScopeNote>

          {error && <ErrorBanner message={error} />}
          <NoticeBanner messages={notices} />

          {overview && (
            <section className="mt-6 rounded-xl border border-sky-900 bg-sky-950/40 p-4">
              <div className="mb-2 text-xs font-semibold text-sky-400">
                {searchLabel ? `「${searchLabel}」の総括` : "総括"}
              </div>
              <p className="text-sm leading-relaxed text-neutral-200">{overview}</p>
              <CostLine dollars={costDollars} elapsedMs={elapsedMs} />
              <ShareActions heading={searchLabel ? `「${searchLabel}」の総括` : "総括"} body={overview} />
            </section>
          )}

          {overview && (
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
              idleLabel="ニュース読み上げ"
              playLabel="▶ ニュースを読み上げる"
              afterControls={
                <label
                  className={`mt-3 flex items-center gap-2 text-xs ${
                    items.length === 0 ? "text-neutral-600" : "text-neutral-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={readSummaries}
                    disabled={items.length === 0}
                    onChange={(e) => {
                      setReadSummaries(e.target.checked);
                      if (broadcast.playbackDone) {
                        broadcast.refreshReplayCache(buildSpeechText(e.target.checked));
                      }
                    }}
                    className="h-4 w-4 accent-red-500"
                  />
                  記事の要約も読み上げる（{items.length}件）
                </label>
              }
            />
          )}
        </>
      }
    >
      {items.length > 0 && (
        <CollapsibleSection
          label={`記事一覧（${items.length}件）`}
          open={listOpen}
          onToggle={() => setListOpen((open) => !open)}
          forceOpenAtDesktop
          toggleClassName="mt-6"
        >
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-neutral-800 bg-neutral-900 p-4 active:bg-neutral-800"
                >
                  <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                    <span>{item.source}</span>
                    {item.publishedDate && (
                      <span>
                        {new Date(item.publishedDate).toLocaleString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <h2 className="mb-2 text-base font-semibold leading-snug">{item.title}</h2>
                  <p className="text-sm leading-relaxed text-neutral-300">{item.summary}</p>
                </a>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {!loading && items.length === 0 && !error && (
        <EmptyHint>キーワードを入力して検索してください</EmptyHint>
      )}
    </SidebarLayout>
  );
}
