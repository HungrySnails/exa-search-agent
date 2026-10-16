/**
 * Exa options exposed in the UI, shared by the client (labels) and the API
 * routes (allow-lists). Labels follow the "日本語(API値)" convention so the
 * UI matches Exa's own naming. Prices are from https://exa.ai/pricing.
 */

export const SEARCH_TYPE_OPTIONS = [
  { id: "auto", label: "自動(auto)", hint: "約1秒・$0.007/回" },
  { id: "fast", label: "高速(fast)", hint: "約0.45秒・$0.007/回" },
  { id: "instant", label: "即時(instant)", hint: "約0.25秒・$0.004/回" },
  { id: "deep-lite", label: "軽量ディープ(deep-lite)", hint: "約4秒・$0.012/回" },
  { id: "deep", label: "ディープ(deep)", hint: "4〜15秒・$0.012/回" },
  { id: "deep-reasoning", label: "ディープ推論(deep-reasoning)", hint: "12〜40秒・$0.015/回" },
] as const;
export type SearchType = (typeof SEARCH_TYPE_OPTIONS)[number]["id"];

export const CATEGORY_OPTIONS = [
  { id: "news", label: "ニュース(news)" },
  { id: "company", label: "企業(company)" },
  { id: "publication", label: "学術文献(publication)" },
  { id: "personal site", label: "個人サイト(personal site)" },
  { id: "financial report", label: "財務報告(financial report)" },
  { id: "people", label: "人物(people)" },
] as const;
export type SearchCategory = (typeof CATEGORY_OPTIONS)[number]["id"];
export const DEFAULT_CATEGORY: SearchCategory = "news";

// Exa rejects these combinations with a 400.
export function categoryAllowsPublishedDate(category: SearchCategory | null): boolean {
  return category !== "company" && category !== "people";
}
export function categoryAllowsExcludeDomains(category: SearchCategory | null): boolean {
  return category !== "people";
}

export const USER_LOCATION_OPTIONS = [
  { id: "JP", label: "日本(JP)" },
  { id: "US", label: "米国(US)" },
  { id: "GB", label: "英国(GB)" },
  { id: "CN", label: "中国(CN)" },
  { id: "KR", label: "韓国(KR)" },
  { id: "DE", label: "ドイツ(DE)" },
  { id: "FR", label: "フランス(FR)" },
  { id: "IN", label: "インド(IN)" },
] as const;
export type UserLocation = (typeof USER_LOCATION_OPTIONS)[number]["id"];

export const MAX_AGE_HOURS_OPTIONS = [
  { id: 0, label: "常に最新を取得(0)" },
  { id: 24, label: "24時間以内(24)" },
  { id: 168, label: "1週間以内(168)" },
  { id: 720, label: "30日以内(720)" },
  { id: -1, label: "キャッシュのみ(-1)" },
] as const;
export type MaxAgeHours = (typeof MAX_AGE_HOURS_OPTIONS)[number]["id"];

// Exa allows up to 100, but every result is summarized in a single Gemini
// prompt within the route's 60s limit, so the UI caps it lower.
export const MAX_NUM_RESULTS = 25;
export const MAX_DOMAINS = 50;

export function defaultNumResults(type: SearchType): number {
  return type.startsWith("deep") ? 10 : 6;
}

export type SearchParams = {
  type: SearchType;
  category: SearchCategory | null;
  numResults: number;
  includeDomains: string[];
  excludeDomains: string[];
  /** YYYY-MM-DD, interpreted in JST. */
  startPublishedDate: string | null;
  endPublishedDate: string | null;
  userLocation: UserLocation | null;
  moderation: boolean;
  maxAgeHours: MaxAgeHours | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN_RE = /^[a-z0-9*][a-z0-9*.-]*(\/\S*)?$/i;

function pick<T extends string | number>(
  options: readonly { id: T }[],
  value: unknown
): T | undefined {
  return options.find((opt) => opt.id === value)?.id;
}

function parseDomains(value: unknown, label: string): string[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return `${label}の形式が正しくありません。`;
  const domains = value
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean);
  if (domains.length > MAX_DOMAINS) return `${label}は${MAX_DOMAINS}件までです。`;
  const invalid = domains.find((d) => d.length > 253 || !DOMAIN_RE.test(d));
  if (invalid) return `${label}に不正な値があります: ${invalid}`;
  return domains;
}

function parseDate(value: unknown, label: string): string | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    return { error: `${label}の形式が正しくありません。` };
  }
  return value;
}

/**
 * Validates untrusted request fields against the allow-lists above. Returns
 * the parsed params, or a Japanese error message for a 400 response.
 */
export function parseSearchParams(body: Record<string, unknown>): SearchParams | string {
  const type = body.type === undefined ? "auto" : pick(SEARCH_TYPE_OPTIONS, body.type);
  if (!type) return "検索タイプ(type)が正しくありません。";

  let category: SearchCategory | null = null;
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    const picked = pick(CATEGORY_OPTIONS, body.category);
    if (!picked) return "カテゴリ(category)が正しくありません。";
    category = picked;
  }

  let numResults = defaultNumResults(type);
  if (body.numResults !== undefined && body.numResults !== null) {
    const n = body.numResults;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_NUM_RESULTS) {
      return `件数(numResults)は1〜${MAX_NUM_RESULTS}の整数で指定してください。`;
    }
    numResults = n;
  }

  const includeDomains = parseDomains(body.includeDomains, "対象ドメイン(includeDomains)");
  if (typeof includeDomains === "string") return includeDomains;
  const excludeDomains = parseDomains(body.excludeDomains, "除外ドメイン(excludeDomains)");
  if (typeof excludeDomains === "string") return excludeDomains;
  if (excludeDomains.length > 0 && !categoryAllowsExcludeDomains(category)) {
    return "人物(people)カテゴリでは除外ドメイン(excludeDomains)を指定できません。";
  }

  const start = parseDate(body.startPublishedDate, "公開日・開始(startPublishedDate)");
  if (typeof start === "object" && start !== null) return start.error;
  const end = parseDate(body.endPublishedDate, "公開日・終了(endPublishedDate)");
  if (typeof end === "object" && end !== null) return end.error;
  if ((start || end) && !categoryAllowsPublishedDate(category)) {
    return "企業(company)・人物(people)カテゴリでは公開日を指定できません。";
  }
  if (start && end && start > end) return "公開日の開始が終了より後になっています。";

  let userLocation: UserLocation | null = null;
  if (body.userLocation !== undefined && body.userLocation !== null && body.userLocation !== "") {
    const picked = pick(USER_LOCATION_OPTIONS, body.userLocation);
    if (!picked) return "地域(userLocation)が正しくありません。";
    userLocation = picked;
  }

  if (body.moderation !== undefined && typeof body.moderation !== "boolean") {
    return "不適切コンテンツ除外(moderation)の形式が正しくありません。";
  }

  let maxAgeHours: MaxAgeHours | null = null;
  if (body.maxAgeHours !== undefined && body.maxAgeHours !== null) {
    const picked = pick(MAX_AGE_HOURS_OPTIONS, body.maxAgeHours);
    if (picked === undefined) return "鮮度(maxAgeHours)が正しくありません。";
    maxAgeHours = picked;
  }

  return {
    type,
    category,
    numResults,
    includeDomains,
    excludeDomains,
    startPublishedDate: start,
    endPublishedDate: end,
    userLocation,
    moderation: body.moderation === true,
    maxAgeHours,
  };
}

export const EFFORT_OPTIONS = [
  { id: "minimal", label: "最小", price: "$0.012" },
  { id: "low", label: "低", price: "$0.025" },
  { id: "medium", label: "中", price: "$0.10" },
  { id: "high", label: "高", price: "$0.50" },
] as const;
export type ResearchEffort = (typeof EFFORT_OPTIONS)[number]["id"];

export function parseEffort(value: unknown): ResearchEffort | undefined {
  return pick(EFFORT_OPTIONS, value);
}
