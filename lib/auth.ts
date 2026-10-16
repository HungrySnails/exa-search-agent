import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

// Hashing first makes both sides 32 bytes, so the comparison takes the same
// time whatever the supplied password's length.
function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Verifies the x-app-password header against APP_PASSWORD. Returns an error
 * response to short-circuit the route on failure, or null when authorized.
 */
export function checkAppPassword(req: NextRequest): NextResponse | null {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json(
      { error: "サーバー側の環境変数が設定されていません。" },
      { status: 500 }
    );
  }
  const suppliedPassword = req.headers.get("x-app-password") ?? "";
  if (!safeEqual(suppliedPassword, appPassword)) {
    return NextResponse.json(
      { error: "パスワードが正しくありません。" },
      { status: 401 }
    );
  }
  return null;
}
