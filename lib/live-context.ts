// Exa Agentの生出力をLive APIのシステム指示に埋め込む前の前処理。LIVE_QA.md §4参照。
// 見出し・箇条書き・表などは変えず、要約も和訳もしない。リンクだけ、読み上げの対象から外す。

export function prepareLiveContext(rawText: string): string {
  return rawText
    .replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "");
}
