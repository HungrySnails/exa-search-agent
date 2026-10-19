import { exaFetch } from "@/lib/exa-client";
import type { ResearchEffort } from "@/lib/exa-options";

export type { ResearchEffort };

const POLL_INTERVAL_MS = 6000;
// Leaves ~30s of the route's 300s maxDuration for query/result translation
// and network overhead around the poll loop.
const MAX_POLL_MS = 270_000;

type AgentRunCitation = {
  url: string;
  title?: string | null;
};

type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type AgentRun = {
  id: string;
  status: AgentRunStatus;
  output: {
    text: string;
    grounding?: { citations?: AgentRunCitation[] }[];
  } | null;
  costDollars?: { total: number } | null;
};

export type ResearchResult = {
  text: string;
  citations: { url: string; title: string | null }[];
  costDollars: number | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ResearchProgress = {
  status: AgentRunStatus;
  elapsedMs: number;
};

export type ProgressCallback = (progress: ResearchProgress) => void;

/**
 * Starts an Exa Agent run and polls until it completes, fails, or the
 * deadline passes. Agent runs are async (queued -> running -> completed),
 * so there is no streaming/webhook path here, only polling; onProgress is
 * invoked after each poll so a caller can relay status to the client.
 */
export async function runDeepResearch(
  apiKey: string,
  query: string,
  effort: ResearchEffort,
  onProgress?: ProgressCallback
): Promise<ResearchResult> {
  const startedAt = Date.now();
  const created: AgentRun = await exaFetch(apiKey, "/agent/runs", {
    method: "POST",
    body: JSON.stringify({ query, effort }),
  });
  onProgress?.({ status: created.status, elapsedMs: Date.now() - startedAt });

  const deadline = Date.now() + MAX_POLL_MS;
  let run = created;
  while (run.status === "queued" || run.status === "running") {
    if (Date.now() > deadline) {
      throw new Error("調査がタイムアウトしました。より低い調査レベル(effort)で再試行してください。");
    }
    await sleep(POLL_INTERVAL_MS);
    run = await exaFetch(apiKey, `/agent/runs/${created.id}`);
    onProgress?.({ status: run.status, elapsedMs: Date.now() - startedAt });
  }

  if (run.status !== "completed" || !run.output) {
    throw new Error("調査に失敗しました。");
  }

  const citations = (run.output.grounding ?? [])
    .flatMap((g) => g.citations ?? [])
    .reduce<{ url: string; title: string | null }[]>((acc, c) => {
      if (!acc.some((existing) => existing.url === c.url)) {
        acc.push({ url: c.url, title: c.title ?? null });
      }
      return acc;
    }, []);

  return {
    text: run.output.text,
    citations,
    costDollars: run.costDollars?.total ?? null,
  };
}
