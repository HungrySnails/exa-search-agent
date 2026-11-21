import { useEffect, useRef } from "react";

// 声の対話中、画面の自動消灯を止める(Screen Wake Lock API)。対応ブラウザが
// 対象(iOS Safari 16.4+、Android Chromeなど)で、未対応でも黒く失敗するだけ。
// 仕様上、タブが非表示(バックグラウンド)になると自動で解除されるため、
// enabledのままvisibilitychangeで前面に戻ったときは再取得する。
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // 非対応・許可拒否・ページ非表示中のリクエストなど。黒く諦める
        // (画面がつきっぱなしになる保証がないだけで、機能自体には影響しない)。
      }
    }

    void acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) void sentinel.release();
    };
  }, [enabled]);
}
