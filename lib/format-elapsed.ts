// Formats a duration in milliseconds for the result footer: "3.2秒" under
// ten seconds, "42秒" under a minute, then "4分12秒".
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const tenths = Math.round(totalSeconds * 10) / 10;
  if (tenths < 10) return `${tenths.toFixed(1)}秒`;
  const rounded = Math.round(totalSeconds);
  if (rounded < 60) return `${rounded}秒`;
  return `${Math.floor(rounded / 60)}分${rounded % 60}秒`;
}
