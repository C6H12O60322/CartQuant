import "./widget.css";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  compareBasketWidgetPropsSchema,
  type CompareBasketResponse,
  type CompareBasketWidgetProps,
  type Mode,
  type ItemAlternative,
  type BasketItemWithAlts,
  type BasketPlan,
  type StoreAssignment,
  type TrendDirection,
} from "./types";
import { getMockBasketResponse, DEMO_ITEMS, STORES } from "./mock-data";

export const widgetMetadata: WidgetMetadata = {
  description:
    "Interactive CartQuant grocery comparison with health scores, price predictions, and ingredient flags",
  props: compareBasketWidgetPropsSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: true,
    invoking: "Comparing grocery baskets...",
    invoked: "Basket comparison ready",
  },
};

// ─── Helpers ───

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function healthLabel(score: number): { text: string; bg: string; fg: string } {
  if (score >= 80) return { text: "Clean", bg: "bg-emerald-100", fg: "text-emerald-800" };
  if (score >= 60) return { text: "Okay", bg: "bg-amber-100", fg: "text-amber-800" };
  return { text: "Watch", bg: "bg-red-100", fg: "text-red-800" };
}

function trendArrow(dir: TrendDirection): { symbol: string; color: string } {
  if (dir === "rising") return { symbol: "\u2191", color: "text-red-600" };
  if (dir === "falling") return { symbol: "\u2193", color: "text-green-600" };
  return { symbol: "\u2192", color: "text-gray-500" };
}

/** Deterministic alt ID: "store:productName" */
function altId(alt: ItemAlternative): string {
  return alt.product.store + ":" + alt.product.name;
}

// ─── State ───

interface WidgetState {
  items: string[];
  avoid: string[];
  mode: Mode;
  selectedItemQuery: string | null;
  selectedAltId: string | null;
  activeStoreId: string | null;
  searchQuery: string;
  results: CompareBasketResponse | null;
  loading: boolean;
  error: string | null;
  minimizeStops: boolean;
}

type CompareBasketToolInput = {
  items?: string[];
  avoid?: string[];
  mode?: Mode;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getModeValue(value: unknown): Mode {
  return value === "cheapest" || value === "cleanest" || value === "balanced"
    ? value
    : "balanced";
}

function normalizeToolInput(value: unknown): Required<CompareBasketToolInput> {
  if (!value || typeof value !== "object") {
    return {
      items: [...DEMO_ITEMS],
      avoid: [],
      mode: "balanced",
    };
  }

  const input = value as CompareBasketToolInput;
  const items = toStringArray(input.items);
  return {
    items: items.length > 0 ? items : [...DEMO_ITEMS],
    avoid: toStringArray(input.avoid),
    mode: getModeValue(input.mode),
  };
}

function buildCacheKey(mode: Mode, items: string[], avoid: string[]): string {
  return `${mode}::${items.join("|")}::${avoid.join("|")}`;
}

function extractCompareBasketResponse(result: unknown): CompareBasketResponse | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const outer = result as Record<string, unknown>;
  const structured = outer.structuredContent;
  if (!structured || typeof structured !== "object") {
    return null;
  }

  const response = (structured as Record<string, unknown>).response;
  if (!response || typeof response !== "object") {
    return null;
  }

  const typedResponse = response as CompareBasketResponse;
  if (!Array.isArray(typedResponse.items) || !typedResponse.plan) {
    return null;
  }

  return typedResponse;
}

function buildMockFallbackForItems(mode: Mode, items: string[]): CompareBasketResponse {
  const base = getMockBasketResponse(mode);
  if (items.length === 0) {
    return base;
  }

  const byQuery = new Map(base.items.map((entry) => [entry.query.toLowerCase(), entry]));
  const picked = items
    .map((query) => byQuery.get(query.toLowerCase()))
    .filter((entry): entry is BasketItemWithAlts => Boolean(entry))
    .map((entry) => ({
      query: entry.query,
      alternatives: [...entry.alternatives],
    }));

  if (picked.length === 0) {
    return base;
  }

  return {
    ...base,
    items: picked,
  };
}

// ─── Basket Plan Computation ───

function computePlanBestPerItem(
  items: BasketItemWithAlts[],
  mode: Mode
): BasketPlan {
  const storeMap = new Map<string, { items: string[]; subtotal: number }>();

  for (const item of items) {
    const best = item.alternatives[0]; // already sorted by mode
    if (!best?.product) continue;
    const store = best.product.store;
    const entry = storeMap.get(store) ?? { items: [], subtotal: 0 };
    entry.items.push(item.query);
    entry.subtotal += best.product.priceUsd;
    storeMap.set(store, entry);
  }

  const storeBreakdown: StoreAssignment[] = Array.from(storeMap.entries()).map(
    ([store, data]) => ({
      store,
      items: data.items,
      subtotalUsd: Math.round(data.subtotal * 100) / 100,
    })
  );

  const totalUsd = storeBreakdown.reduce((s, b) => s + b.subtotalUsd, 0);
  const allBest = items.map((i) => i.alternatives[0]).filter(Boolean);
  const avgChange =
    allBest.length > 0
      ? allBest.reduce((sum, alt) => {
          if (!alt?.prediction) return sum;
          const sign = alt.prediction.direction === "falling" ? -1 : 1;
          return sum + alt.prediction.percentChange * sign;
        }, 0) / allBest.length
      : 0;
  const avgConf =
    allBest.length > 0
      ? allBest.reduce((s, a) => s + (a?.prediction?.confidence ?? 0), 0) / allBest.length
      : 0;

  const parts = storeBreakdown.map(
    (s) => `${s.store} for ${s.items.length} item${s.items.length > 1 ? "s" : ""}`
  );

  return {
    summary:
      storeBreakdown.length === 1
        ? `Best plan: all items from ${storeBreakdown[0].store}`
        : `Best plan: ${parts.join(", ")}`,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalPrediction: {
      direction: avgChange > 1 ? "rising" : avgChange < -1 ? "falling" : "flat",
      percentChange: Math.round(Math.abs(avgChange) * 10) / 10,
      confidence: Math.round(avgConf),
      recommendation:
        mode === "cheapest"
          ? "Buy now \u2014 prices trending up across dairy and poultry."
          : mode === "cleanest"
            ? "Organic prices stable. Good time to stock up."
            : "Moderate upward pressure. This basket balances value well.",
    },
    storeBreakdown,
    savings:
      mode === "cheapest"
        ? "Save $8.12 vs Whole Foods basket"
        : mode === "cleanest"
          ? "Pays $15.44 more than cheapest, but 0 health red flags"
          : "Save $4.27 vs cheapest organic, $9.71 vs full Whole Foods",
  };
}

function computePlanMinStops(
  items: BasketItemWithAlts[],
  mode: Mode
): BasketPlan {
  const storeScores = new Map<string, number>();
  const storePrices = new Map<string, Map<string, number>>();

  for (const item of items) {
    for (const alt of item.alternatives) {
      if (!alt?.product || !alt?.health) continue;
      const store = alt.product.store;
      const price = alt.product.priceUsd;
      const health = alt.health.score;
      let score: number;
      switch (mode) {
        case "cheapest":
          score = -price;
          break;
        case "cleanest":
          score = health;
          break;
        default:
          score = health * 0.6 - price * 0.4;
      }
      storeScores.set(store, (storeScores.get(store) ?? 0) + score);
      if (!storePrices.has(store)) storePrices.set(store, new Map());
      storePrices.get(store)!.set(item.query, price);
    }
  }

  let bestStore = "";
  let bestScore = -Infinity;
  for (const [store, score] of storeScores) {
    if (score > bestScore) {
      bestStore = store;
      bestScore = score;
    }
  }

  const singleTotal = items.reduce((sum, item) => {
    const alt = item.alternatives.find((a) => a?.product?.store === bestStore);
    return sum + (alt?.product?.priceUsd ?? item.alternatives[0]?.product?.priceUsd ?? 0);
  }, 0);

  const storeNames = Array.from(storeScores.keys());
  let bestComboTotal = singleTotal;
  let bestCombo: [string, string] | null = null;

  for (let i = 0; i < storeNames.length; i++) {
    for (let j = i + 1; j < storeNames.length; j++) {
      const s1 = storeNames[i];
      const s2 = storeNames[j];
      let total = 0;
      for (const item of items) {
        const p1 = storePrices.get(s1)?.get(item.query) ?? Infinity;
        const p2 = storePrices.get(s2)?.get(item.query) ?? Infinity;
        total += Math.min(p1, p2);
      }
      if (total < bestComboTotal * 0.9) {
        bestComboTotal = total;
        bestCombo = [s1, s2];
      }
    }
  }

  const assignments = new Map<string, { items: string[]; subtotal: number }>();

  if (bestCombo) {
    const [s1, s2] = bestCombo;
    for (const item of items) {
      const p1 = storePrices.get(s1)?.get(item.query) ?? Infinity;
      const p2 = storePrices.get(s2)?.get(item.query) ?? Infinity;
      const chosen = p1 <= p2 ? s1 : s2;
      const entry = assignments.get(chosen) ?? { items: [], subtotal: 0 };
      entry.items.push(item.query);
      entry.subtotal += Math.min(p1, p2);
      assignments.set(chosen, entry);
    }
  } else {
    for (const item of items) {
      const alt = item.alternatives.find((a) => a?.product?.store === bestStore);
      const price = alt?.product?.priceUsd ?? item.alternatives[0]?.product?.priceUsd ?? 0;
      const entry = assignments.get(bestStore) ?? { items: [], subtotal: 0 };
      entry.items.push(item.query);
      entry.subtotal += price;
      assignments.set(bestStore, entry);
    }
  }

  const storeBreakdown: StoreAssignment[] = Array.from(assignments.entries()).map(
    ([store, data]) => ({
      store,
      items: data.items,
      subtotalUsd: Math.round(data.subtotal * 100) / 100,
    })
  );

  const totalUsd = storeBreakdown.reduce((s, b) => s + b.subtotalUsd, 0);
  const parts = storeBreakdown.map(
    (s) => `${s.store} for ${s.items.length} item${s.items.length > 1 ? "s" : ""}`
  );

  return {
    summary:
      storeBreakdown.length === 1
        ? `Fewest stops: all items from ${storeBreakdown[0].store}`
        : `Fewest stops: ${parts.join(" + ")}`,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalPrediction: {
      direction: "flat",
      percentChange: 1.2,
      confidence: 72,
      recommendation: "Optimized for fewer store visits.",
    },
    storeBreakdown,
    savings: `${storeBreakdown.length} store${storeBreakdown.length > 1 ? "s" : ""} to visit`,
  };
}

// ─── TopBar ───

function TopBar({
  mode,
  onModeChange,
  minimizeStops,
  onMinimizeStopsChange,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  minimizeStops: boolean;
  onMinimizeStopsChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
      <div>
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">CartQuant</h1>
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle mode={mode} onChange={onModeChange} />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={minimizeStops}
            onChange={(e) => onMinimizeStopsChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Min Stops
        </label>
      </div>
    </div>
  );
}

// ─── ModeToggle ───

const MODE_LABELS: Record<Mode, string> = {
  cheapest: "Cheapest",
  cleanest: "Cleanest",
  balanced: "Balanced",
};

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
      {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`text-xs font-medium py-1 px-3 rounded-md transition-colors ${
            m === mode
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

// ─── ItemTabs ───

function ItemTabs({
  items,
  selectedItemQuery,
  onSelect,
}: {
  items: string[];
  selectedItemQuery: string | null;
  onSelect: (tab: string) => void;
}) {
  return (
    <div className="flex gap-1 px-5 py-2 border-b border-gray-200 bg-white overflow-x-auto">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className={`text-sm px-3 py-1.5 capitalize whitespace-nowrap transition-colors ${
            item === selectedItemQuery
              ? "border-b-2 border-gray-900 text-gray-900 font-semibold"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

// ─── FilterInput ───

function FilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
        &#128269;
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter alternatives"
        className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
      />
    </div>
  );
}

// ─── AvoidChips ───

function AvoidChips({
  avoid,
  onRemove,
}: {
  avoid: string[];
  onRemove: (flag: string) => void;
}) {
  if (avoid.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-xs text-gray-500 mr-1">Avoiding:</span>
      {avoid.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-100 text-xs px-2 py-0.5 rounded-full"
        >
          {flag}
          <button
            type="button"
            onClick={() => onRemove(flag)}
            className="hover:text-red-800 font-bold leading-none"
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}

// ─── AlternativeCard ───

function AlternativeCard({
  alt,
  isSelected,
  isRecommended,
  onClick,
}: {
  alt: ItemAlternative;
  isSelected: boolean;
  isRecommended: boolean;
  onClick: () => void;
}) {
  const score = alt.health?.score ?? 0;
  const badge = healthLabel(score);
  const direction = alt.prediction?.direction ?? "flat";
  const trend = trendArrow(direction);
  const pctChange = alt.prediction?.percentChange ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? "border-gray-900 ring-1 ring-gray-900 shadow-md bg-white"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isRecommended && (
            <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-md text-amber-700 bg-amber-50 border border-amber-200">
              &#9733;
            </span>
          )}
          <span className="text-sm font-semibold text-gray-900 truncate">
            {alt.product?.store ?? "Unknown Store"}
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900 shrink-0">
          {formatUsd(alt.product?.priceUsd ?? 0)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.fg}`}
        >
          {badge.text} {score}
        </span>
        <span className={`text-xs font-medium ${trend.color}`}>
          {trend.symbol}{pctChange}%
        </span>
        <span className="text-xs text-gray-400 truncate">
          {alt.product?.name ?? ""}
        </span>
      </div>
    </button>
  );
}

// ─── SkeletonCardList ───

function SkeletonCardList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 animate-pulse"
        >
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-12" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 bg-gray-100 rounded-full w-16" />
            <div className="h-5 bg-gray-100 rounded w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SkeletonDetail ───

function SkeletonDetail() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-gray-100 rounded-xl p-4 space-y-2">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
      <div className="bg-gray-100 rounded-xl p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-3/4" />
      </div>
    </div>
  );
}

// ─── BasketPlanHero ───

function BasketPlanHero({ plan }: { plan: BasketPlan }) {
  const direction = plan.totalPrediction?.direction ?? "flat";
  const trend = trendArrow(direction);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            Recommended Basket Plan
          </div>
          <p className="text-sm font-medium text-gray-800">{plan.summary}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold text-gray-900">{formatUsd(plan.totalUsd)}</div>
          <div className={`text-xs font-semibold ${trend.color}`}>
            {trend.symbol}{plan.totalPrediction?.percentChange ?? 0}% 7d
          </div>
        </div>
      </div>

      {/* Store breakdown */}
      <div className="space-y-1">
        {plan.storeBreakdown.map((sb) => (
          <div key={sb.store} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">{sb.store}</span>
              <span className="text-gray-400">
                {sb.items.map((i) => i).join(", ")}
              </span>
            </div>
            <span className="font-semibold text-gray-700">{formatUsd(sb.subtotalUsd)}</span>
          </div>
        ))}
      </div>

      <div className="text-xs text-indigo-600 font-medium">{plan.savings}</div>
    </div>
  );
}

// ─── MapPlaceholder ───

function MapPlaceholder({
  storeBreakdown,
  activeStoreId,
  onStoreClick,
}: {
  storeBreakdown: StoreAssignment[];
  activeStoreId: string | null;
  onStoreClick: (storeName: string) => void;
}) {
  return (
    <div className="bg-gray-100 border border-dashed border-gray-300 rounded-xl p-4">
      <div className="text-center mb-3">
        <span className="text-2xl">&#128506;&#65039;</span>
        <p className="text-xs text-gray-400 mt-1">Google Maps coming soon</p>
      </div>
      <div className="space-y-1.5">
        {STORES.map((store) => {
          const assigned = storeBreakdown.find((s) => s.store === store.name);
          const isActive = activeStoreId === store.name;
          return (
            <button
              type="button"
              key={store.name}
              onClick={() => onStoreClick(store.name)}
              className={`w-full flex items-center justify-between text-xs px-2 py-1 rounded-md text-left transition-colors ${
                isActive
                  ? "bg-indigo-50 border border-indigo-300 ring-1 ring-indigo-300"
                  : assigned
                    ? "bg-white border border-gray-200 hover:border-gray-300"
                    : "text-gray-400 hover:text-gray-500"
              }`}
            >
              <span className={assigned || isActive ? "font-medium text-gray-700" : ""}>
                {assigned ? "\u2022 " : ""}{store.name}
              </span>
              {assigned && (
                <span className="text-gray-500">{assigned.items.length} items</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── SelectedDetail ───

function SelectedDetail({
  alt,
  query,
  onFlagClick,
}: {
  alt: ItemAlternative;
  query: string;
  onFlagClick: (flag: string) => void;
}) {
  const score = alt.health?.score ?? 0;
  const badge = healthLabel(score);
  const direction = alt.prediction?.direction ?? "flat";
  const trend = trendArrow(direction);
  const flags = alt.health?.flags ?? [];
  const pctChange = alt.prediction?.percentChange ?? 0;
  const confidence = alt.prediction?.confidence ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
            {query}
          </div>
          <h3 className="text-base font-bold text-gray-900">{alt.product?.name ?? "Unknown"}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {alt.product?.brand ?? ""} &middot; {alt.product?.size ?? ""} &middot;{" "}
            <span className="font-medium text-gray-700">{alt.product?.store ?? ""}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-gray-900">
            {formatUsd(alt.product?.priceUsd ?? 0)}
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.fg}`}
          >
            {badge.text} {score}
          </span>
        </div>
      </div>

      {/* Health summary */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1">Health</div>
        <p className="text-sm text-gray-700">{alt.health?.summary ?? "No health data available."}</p>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">Flags</div>
          <div className="flex flex-wrap gap-1">
            {flags.map((flag) => (
              <button
                key={flag}
                type="button"
                onClick={() => onFlagClick(flag)}
                title={`Add "${flag}" to avoid list`}
                className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-100 transition-colors"
              >
                {flag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prediction */}
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1">Price Prediction</div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${trend.color}`}>
            {trend.symbol}{pctChange}%
          </span>
          <span className="text-xs text-gray-500">
            Confidence {confidence}%
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1">{alt.prediction?.recommendation ?? ""}</p>
      </div>
    </div>
  );
}

// ─── EmptyDetailState ───

function EmptyDetailState() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
      <div className="text-3xl mb-2">&#128722;</div>
      <p className="text-sm text-gray-500">
        Select an alternative from the left panel to see full details.
      </p>
    </div>
  );
}

// ─── ErrorBanner ───

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-5 mt-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-2">
      <p className="text-sm text-red-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 text-sm font-semibold text-red-600 hover:underline"
      >
        Retry
      </button>
    </div>
  );
}

// ─── Main Widget ───

const CartQuantWidget: React.FC = () => {
  const widgetData = useWidget<
    CompareBasketWidgetProps,
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>,
    CompareBasketToolInput
  >();

  const initialToolInput = normalizeToolInput(widgetData.toolInput);

  const [state, setState] = useState<WidgetState>(() => {
    const initial = widgetData.props?.response ?? null;
    const initialItems =
      initial?.items.map((entry) => entry.query) ?? initialToolInput.items;
    const initialMode = initial?.mode ?? initialToolInput.mode;
    const firstItem = initialItems[0] ?? DEMO_ITEMS[0];

    return {
      items: initialItems,
      avoid: initialToolInput.avoid,
      mode: initialMode,
      selectedItemQuery: firstItem,
      selectedAltId: null,
      activeStoreId: null,
      searchQuery: "",
      results: initial,
      loading: false,
      error: null,
      minimizeStops: false,
    };
  });

  const cache = useRef<Record<string, CompareBasketResponse>>({});

  if (state.results) {
    const key = buildCacheKey(state.results.mode, state.items, state.avoid);
    if (!cache.current[key]) {
      cache.current[key] = state.results;
    }
  }

  const fetchResults = useCallback(
    async (
      mode: Mode,
      overrides?: {
        items?: string[];
        avoid?: string[];
      }
    ) => {
      const items = overrides?.items ?? state.items;
      const avoid = overrides?.avoid ?? state.avoid;
      const cacheKey = buildCacheKey(mode, items, avoid);
      const cached = cache.current[cacheKey];

      if (cached) {
        setState((s) => ({
          ...s,
          mode,
          items: [...items],
          avoid: [...avoid],
          results: cached,
          loading: false,
          error: null,
          selectedItemQuery: cached.items[0]?.query ?? s.selectedItemQuery,
          selectedAltId: null,
          activeStoreId: null,
        }));
        return;
      }

      setState((s) => ({
        ...s,
        mode,
        items: [...items],
        avoid: [...avoid],
        loading: true,
        error: null,
        selectedAltId: null,
        activeStoreId: null,
      }));

      try {
        const toolResult = await widgetData.callTool("compare-basket", {
          items,
          mode,
          ...(avoid.length > 0 ? { avoid } : {}),
        });

        const response = extractCompareBasketResponse(toolResult);
        if (!response) {
          throw new Error("Missing structured response from compare-basket tool.");
        }

        cache.current[cacheKey] = response;
        setState((s) => ({
          ...s,
          mode,
          items: response.items.map((entry) => entry.query),
          avoid: [...avoid],
          results: response,
          loading: false,
          error: null,
          selectedItemQuery: response.items[0]?.query ?? s.selectedItemQuery,
          selectedAltId: null,
          activeStoreId: null,
        }));
      } catch {
        const fallback = buildMockFallbackForItems(mode, items);
        cache.current[cacheKey] = fallback;
        setState((s) => ({
          ...s,
          mode,
          items: fallback.items.map((entry) => entry.query),
          avoid: [...avoid],
          results: fallback,
          loading: false,
          error: "Live compare tool failed, showing fallback data.",
          selectedItemQuery: fallback.items[0]?.query ?? s.selectedItemQuery,
          selectedAltId: null,
          activeStoreId: null,
        }));
      }
    },
    [state.items, state.avoid, widgetData.callTool]
  );

  const handleRun = useCallback(() => {
    cache.current = {};
    fetchResults(state.mode);
  }, [state.mode, fetchResults]);

  const handleModeChange = useCallback(
    (m: Mode) => fetchResults(m),
    [fetchResults]
  );

  const handleLoadDemo = useCallback(() => {
    cache.current = {};
    fetchResults(state.mode, { items: [...DEMO_ITEMS], avoid: [] });
  }, [fetchResults, state.mode]);

  const handleAddAvoid = useCallback((flag: string) => {
    setState((s) => {
      if (s.avoid.includes(flag.toLowerCase())) return s;
      return { ...s, avoid: [...s.avoid, flag.toLowerCase()] };
    });
  }, []);

  const handleRemoveAvoid = useCallback((flag: string) => {
    setState((s) => ({
      ...s,
      avoid: s.avoid.filter((f) => f !== flag),
    }));
  }, []);

  const handleSelectAlt = useCallback((alt: ItemAlternative) => {
    const id = altId(alt);
    const store = alt.product?.store ?? null;
    setState((s) => ({
      ...s,
      selectedAltId: s.selectedAltId === id ? null : id,
      activeStoreId: s.selectedAltId === id ? null : store,
    }));
  }, []);

  const handleStoreClick = useCallback((storeName: string) => {
    setState((s) => ({
      ...s,
      activeStoreId: s.activeStoreId === storeName ? null : storeName,
    }));
  }, []);

  // Active tab's item data
  const activeItem = useMemo(
    () => state.results?.items.find((i) => i.query === state.selectedItemQuery) ?? null,
    [state.results, state.selectedItemQuery]
  );

  // Filtered alternatives (client-side only, NEVER calls tools)
  const filteredAlts = useMemo(() => {
    if (!activeItem) return [];
    const q = state.searchQuery.toLowerCase();
    return activeItem.alternatives.filter((alt) => {
      if (!alt?.product) return false;
      return (
        !q ||
        alt.product.store.toLowerCase().includes(q) ||
        alt.product.name.toLowerCase().includes(q) ||
        alt.product.brand.toLowerCase().includes(q)
      );
    });
  }, [activeItem, state.searchQuery]);

  // Selected alternative (resolved by selectedAltId)
  const selectedAlt = useMemo(() => {
    if (!state.selectedAltId || !activeItem) return null;
    return (
      activeItem.alternatives.find((a) => altId(a) === state.selectedAltId) ?? null
    );
  }, [activeItem, state.selectedAltId]);

  // Basket plan (recomputed based on minimize stops)
  const basketPlan = useMemo(() => {
    if (!state.results) return null;
    return state.minimizeStops
      ? computePlanMinStops(state.results.items, state.mode)
      : computePlanBestPerItem(state.results.items, state.mode);
  }, [state.results, state.mode, state.minimizeStops]);

  const itemList = state.results?.items.map((i) => i.query) ?? state.items;

  // ─── Render ───

  // Empty state: no results yet
  if (!state.results && !state.loading && !state.error) {
    return (
      <McpUseProvider>
        <div className="bg-white h-full flex flex-col font-sans">
          <TopBar
            mode={state.mode}
            onModeChange={handleModeChange}
            minimizeStops={state.minimizeStops}
            onMinimizeStopsChange={(v) => setState((s) => ({ ...s, minimizeStops: v }))}
          />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="text-4xl">&#128722;</div>
              <p className="text-sm text-gray-500">
                Compare prices, health scores &amp; trends across stores
              </p>
              <button
                type="button"
                onClick={handleLoadDemo}
                className="bg-gray-900 text-white text-sm font-semibold py-2 px-5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Load Demo Basket
              </button>
            </div>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider>
      <div className="bg-gray-50 h-full flex flex-col font-sans">
        {/* Top Bar */}
        <TopBar
          mode={state.mode}
          onModeChange={handleModeChange}
          minimizeStops={state.minimizeStops}
          onMinimizeStopsChange={(v) => setState((s) => ({ ...s, minimizeStops: v }))}
        />

        {/* Item Tabs */}
        <ItemTabs
          items={itemList}
          selectedItemQuery={state.selectedItemQuery}
          onSelect={(tab) =>
            setState((s) => ({ ...s, selectedItemQuery: tab, selectedAltId: null, activeStoreId: null }))
          }
        />

        {/* Error */}
        {state.error && <ErrorBanner message={state.error} onRetry={handleRun} />}

        {/* Main Layout: Two-panel Luma-style */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel (~380px): alternative cards list */}
          <div className="w-[380px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 space-y-3">
            <FilterInput
              value={state.searchQuery}
              onChange={(v) => setState((s) => ({ ...s, searchQuery: v }))}
            />

            <AvoidChips avoid={state.avoid} onRemove={handleRemoveAvoid} />

            {state.loading ? (
              <SkeletonCardList />
            ) : (
              <div className="space-y-2">
                {filteredAlts.map((alt, idx) => {
                  const id = altId(alt);
                  return (
                    <AlternativeCard
                      key={id}
                      alt={alt}
                      isSelected={id === state.selectedAltId}
                      isRecommended={idx === 0}
                      onClick={() => handleSelectAlt(alt)}
                    />
                  );
                })}
                {filteredAlts.length === 0 && !state.loading && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    No alternatives match your filter.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Panel (flex-1): BasketPlanHero, MapPlaceholder, SelectedDetail */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {state.loading ? (
              <SkeletonDetail />
            ) : (
              <>
                {/* Basket Plan Hero */}
                {basketPlan && <BasketPlanHero plan={basketPlan} />}

                {/* Map Placeholder */}
                {basketPlan && (
                  <MapPlaceholder
                    storeBreakdown={basketPlan.storeBreakdown}
                    activeStoreId={state.activeStoreId}
                    onStoreClick={handleStoreClick}
                  />
                )}

                {/* Selected Detail */}
                {selectedAlt && activeItem ? (
                  <SelectedDetail
                    alt={selectedAlt}
                    query={activeItem.query}
                    onFlagClick={handleAddAvoid}
                  />
                ) : (
                  <EmptyDetailState />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </McpUseProvider>
  );
};

export default CartQuantWidget;
