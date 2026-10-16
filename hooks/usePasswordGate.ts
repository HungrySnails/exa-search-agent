import { useEffect, useState } from "react";

const STORAGE_KEY = "exa-sogo-password";

/**
 * Shared password-gate state: reads the stored password on mount (auto
 * login), and exposes a handler to drop back to the gate on a 401 from any
 * API call.
 */
export function usePasswordGate() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setPassword(saved);
    } catch {
      // localStorage unavailable; fall back to entry screen each time.
    }
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    try {
      localStorage.setItem(STORAGE_KEY, passwordInput);
    } catch {
      // ignore storage errors, still proceed for this session
    }
    setPassword(passwordInput);
  }

  // Call when any API response is a 401 (wrong/expired password).
  function handleUnauthorized() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setPassword(null);
    setPasswordInput("");
  }

  return { password, passwordInput, setPasswordInput, handleUnlock, handleUnauthorized };
}
