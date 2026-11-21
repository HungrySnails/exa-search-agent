// 声の対話パネルの色(QAは紫、テーマ相談は空色)。
// Tailwindは、ソースに完全な形で書かれたクラス名だけをCSSに含める。`bg-${accent}-600`の
// ように文字列を組み立てると本番でスタイルが消えるため、完全なクラス名を対応表で持つ。

export type Accent = "violet" | "sky";

export const ACCENT_CLASSES: Record<
  Accent,
  { selected: string; meter: string; primary: string; secondary: string; modelText: string }
> = {
  violet: {
    selected: "border-violet-600 bg-violet-900/50 text-violet-200",
    meter: "bg-violet-500",
    primary: "bg-violet-600",
    secondary: "border-violet-700 text-violet-200",
    modelText: "text-violet-300",
  },
  sky: {
    selected: "border-sky-600 bg-sky-900/50 text-sky-200",
    meter: "bg-sky-500",
    primary: "bg-sky-600",
    secondary: "border-sky-700 text-sky-200",
    modelText: "text-sky-300",
  },
};
