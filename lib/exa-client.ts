export const EXA_BASE_URL = "https://api.exa.ai";

function describeExaError(status: number, detail: string): string {
  const suffix = `（HTTP ${status}${detail ? `: ${detail.slice(0, 150)}` : ""}）`;
  if (status === 402) return `Exaのクレジット残高が不足しています${suffix}`;
  if (status === 429) {
    return `Exaの利用上限（レート制限・同時実行数）に達しました。時間をおいて再試行してください${suffix}`;
  }
  if (status === 401 || status === 403) {
    return `ExaがAPIキーを拒否したか、この機能の利用が許可されていません${suffix}`;
  }
  if (status >= 500) return `Exaが一時的に応答できません。時間をおいて再試行してください${suffix}`;
  return `Exa APIエラー${suffix}`;
}

/** Shared low-level client for all Exa API calls (search, Agent Runs). */
export async function exaFetch(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${EXA_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = [data?.message, data?.error].find((v) => typeof v === "string") ?? "";
    throw new Error(describeExaError(res.status, detail));
  }
  return res.json();
}

// 声で質問するのfetch_sourceツール呼び出しから叩かれる。1件ごとに成功/失敗が
// 分かれるため、一部のURLが失敗しても残りの結果は返す(全体を失敗扱いにしない)。
// 文脈に一度に注入する量を抑えるための上限であり、Exaの/contents自体はこれより
// 多いurlsを渡せる。
export const MAX_FETCH_URLS = 5;

// レポート本文(citations)の要約とは別の、音声対話に注入する軽量な抜粋。
const CONTENTS_MAX_CHARACTERS = 6000;

export type FetchedSource = {
  url: string;
  title: string | null;
  text: string | null;
  error: string | null;
};

export async function fetchSourceContents(
  apiKey: string,
  urls: string[]
): Promise<FetchedSource[]> {
  const targets = urls.slice(0, MAX_FETCH_URLS);
  const data = await exaFetch(apiKey, "/contents", {
    method: "POST",
    body: JSON.stringify({
      urls: targets,
      text: { maxCharacters: CONTENTS_MAX_CHARACTERS },
    }),
  });
  return targets.map((url, i) => {
    const result = data?.results?.[i];
    const status = data?.statuses?.[i]?.status;
    if (!result?.text || status !== "success") {
      return {
        url,
        title: null,
        text: null,
        error: `取得に失敗しました(status: ${status ?? "unknown"})`,
      };
    }
    return {
      url: result.url ?? url,
      title: result.title ?? null,
      text: result.text,
      error: null,
    };
  });
}
