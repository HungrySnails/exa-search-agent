import { NextRequest, NextResponse } from "next/server";
import { checkAppPassword } from "@/lib/auth";

/**
 * Checks the app password, then that every named env var is set. Returns
 * the resolved values, or an error NextResponse to return as-is.
 */
export function requireEnv<K extends string>(
  req: NextRequest,
  names: readonly K[]
): Record<K, string> | NextResponse {
  const authError = checkAppPassword(req);
  if (authError) return authError;

  const values = {} as Record<K, string>;
  for (const name of names) {
    const value = process.env[name];
    if (!value) {
      return NextResponse.json(
        { error: "サーバー側の環境変数が設定されていません。" },
        { status: 500 }
      );
    }
    values[name] = value;
  }
  return values;
}

/** Validates a trimmed query string is non-empty and within `maxChars`. */
export function validateQuery(
  query: string,
  { label, maxChars }: { label: string; maxChars: number }
): NextResponse | null {
  if (!query) {
    return NextResponse.json({ error: `${label}を入力してください。` }, { status: 400 });
  }
  if (query.length > maxChars) {
    return NextResponse.json({ error: `${label}が長すぎます。` }, { status: 400 });
  }
  return null;
}
