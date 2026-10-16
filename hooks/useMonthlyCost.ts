import { useEffect, useState } from "react";

const STORAGE_KEY = "exa-sogo-monthly-cost";
const MONTHS_KEPT = 12;

type MonthEntry = { dollars: number; count: number };
type CostHistory = Record<string, MonthEntry>;

/** "YYYY-MM" of the JST calendar month, so totals close at JST month-end. */
function monthKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function previousMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function readHistory(): CostHistory {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Running total of Exa cost per month, recorded in this browser only (other
 * devices are not included). Each mode reports the costDollars Exa returned.
 */
export function useMonthlyCost() {
  const [history, setHistory] = useState<CostHistory>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(readHistory());
  }, []);

  function addCost(dollars: number) {
    const key = monthKey();
    // Re-read so a total added from another tab isn't overwritten.
    const next = readHistory();
    const entry = next[key] ?? { dollars: 0, count: 0 };
    next[key] = { dollars: entry.dollars + dollars, count: entry.count + 1 };
    for (const old of Object.keys(next).sort().slice(0, -MONTHS_KEPT)) delete next[old];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; the total still updates for this session.
    }
    setHistory(next);
  }

  const current = monthKey();
  return {
    month: Number(current.slice(5)),
    current: history[current] ?? { dollars: 0, count: 0 },
    previous: history[previousMonthKey(current)] ?? null,
    addCost,
  };
}
