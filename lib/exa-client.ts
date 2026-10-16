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
