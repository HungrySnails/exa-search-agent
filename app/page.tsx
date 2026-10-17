"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { PasswordGate } from "@/components/PasswordGate";
import { useMonthlyCost } from "@/hooks/useMonthlyCost";
import { usePasswordGate } from "@/hooks/usePasswordGate";
import { SearchMode } from "@/components/modes/SearchMode";

// Agent mode pulls in react-markdown/remark-gfm; lazy-load it so a
// Search-mode-only session doesn't pay that bundle cost.
const AgentMode = dynamic(() =>
  import("@/components/modes/AgentMode").then((mod) => mod.AgentMode)
);

type Mode = "search" | "agent";

const MODE_OPTIONS: { id: Mode; label: string }[] = [
  { id: "search", label: "Exa Search" },
  { id: "agent", label: "Exa Agent" },
];

export default function Home() {
  const { password, passwordInput, setPasswordInput, handleUnlock, handleUnauthorized } =
    usePasswordGate();
  const [mode, setMode] = useState<Mode>("search");
  // Shared across modes so switching tabs doesn't lose what was typed.
  const [query, setQuery] = useState("");
  const monthlyCost = useMonthlyCost();

  if (!password) {
    return (
      <PasswordGate
        passwordInput={passwordInput}
        onPasswordInputChange={setPasswordInput}
        onSubmit={handleUnlock}
      />
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-8 md:max-w-3xl md:px-8 2xl:max-w-[1600px] 2xl:px-12">
        <div className="mb-6 flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900 p-1">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === opt.id
                  ? "bg-neutral-100 text-neutral-950"
                  : "text-neutral-400"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <aside
          className="-mt-4 mb-6 text-right text-[11px] text-neutral-500"
          title="このブラウザで実行した分のみの集計です（他の端末の利用分は含みません）"
        >
          {monthlyCost.month}月のExa利用額: ${monthlyCost.current.dollars.toFixed(3)}（
          {monthlyCost.current.count}回）
          {monthlyCost.previous && ` ／ 先月: $${monthlyCost.previous.dollars.toFixed(3)}`}
        </aside>

        {mode === "search" ? (
          <SearchMode
            password={password}
            onUnauthorized={handleUnauthorized}
            onCost={monthlyCost.addCost}
            query={query}
            onQueryChange={setQuery}
          />
        ) : (
          <AgentMode
            password={password}
            onUnauthorized={handleUnauthorized}
            onCost={monthlyCost.addCost}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </div>
    </main>
  );
}
