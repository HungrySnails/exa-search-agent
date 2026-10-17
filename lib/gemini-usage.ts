import { AsyncLocalStorage } from "node:async_hooks";

// Token counts the Gemini API reports for text generation, summed over one
// request (a search or an agent run makes several calls). Only counts, never
// a price: unit prices and free tiers change too often to hard-code. The
// client keeps a monthly total next to the Exa cost. Text-to-speech is not
// included. Shown only when the server sets SHOW_GEMINI_USAGE=1.
export type GeminiUsage = { inputTokens: number; outputTokens: number };

const store = new AsyncLocalStorage<GeminiUsage>();

export function newGeminiUsage(): GeminiUsage {
  return { inputTokens: 0, outputTokens: 0 };
}

/** Calls made inside `fn` (including async continuations) add to `usage`. */
export function runWithGeminiUsage<T>(usage: GeminiUsage, fn: () => T): T {
  return store.run(usage, fn);
}

/** Adds one generateContent response's usageMetadata to the active tally. */
export function recordGeminiUsage(metadata: unknown) {
  const usage = store.getStore();
  if (!usage || !metadata || typeof metadata !== "object") return;
  const m = metadata as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === "number" && value > 0 ? value : 0);
  usage.inputTokens += count(m.promptTokenCount);
  // Thinking tokens are billed as output.
  usage.outputTokens += count(m.candidatesTokenCount) + count(m.thoughtsTokenCount);
}

/** The usage to put in a response, or null unless the operator opted in. */
export function geminiUsageForResponse(usage: GeminiUsage): GeminiUsage | null {
  if (process.env.SHOW_GEMINI_USAGE !== "1") return null;
  return usage.inputTokens + usage.outputTokens > 0 ? usage : null;
}
