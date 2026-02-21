import "./widget.css";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useCallback, useRef, type KeyboardEvent } from "react";
import {
  propSchema,
  compareBasketWidgetPropsSchema,
  type CartPlanWidgetProps,
  type CompareBasketResponse,
  type CompareBasketWidgetProps,
  type Mode,
  type BasketItem,
  type TrendDirection,
} from "./types";
import { getMockBasketResponse, DEMO_ITEMS } from "./mock-data";

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

// ─── State ───

interface WidgetState {
  items: string[];
  avoid: string[];
  mode: Mode;
  results: CompareBasketResponse | null;
  loading: boolean;
  error: string | null;
}

// ─── BasketInput ───

function BasketInput({
  items,
  avoid,
  onAddItem,
  onRemoveItem,
  onAddAvoid,
  onRemoveAvoid,
  onRun,
  onLoadDemo,
  loading,
}: {
  items: string[];
  avoid: string[];
  onAddItem: (item: string) => void;
  onRemoveItem: (item: string) => void;
  onAddAvoid: (flag: string) => void;
  onRemoveAvoid: (flag: string) => void;
  onRun: () => void;
  onLoadDemo: () => void;
  loading: boolean;
}) {
  const itemRef = useRef<HTMLInputElement>(null);
  const avoidRef = useRef<HTMLInputElement>(null);

  const handleItemKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && itemRef.current) {
      const val = itemRef.current.value.trim();
      if (val && !items.includes(val.toLowerCase())) {
        onAddItem(val.toLowerCase());
        itemRef.current.value = "";
      }
    }
  };

  const handleAvoidKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && avoidRef.current) {
      const val = avoidRef.current.value.trim();
      if (val && !avoid.includes(val.toLowerCase())) {
        onAddAvoid(val.toLowerCase());
        avoidRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Items input */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Shopping List
        </label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full"
            >
              {item}
              <button
                type="button"
                onClick={() => onRemoveItem(item)}
                className="hover:text-indigo-500 font-bold leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <input
          ref={itemRef}
          type="text"
          placeholder="Type item + Enter"
          onKeyDown={handleItemKey}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Avoid input */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Avoid List
        </label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {avoid.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full"
            >
              {flag}
              <button
                type="button"
                onClick={() => onRemoveAvoid(flag)}
                className="hover:text-orange-500 font-bold leading-none"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <input
          ref={avoidRef}
          type="text"
          placeholder="Type ingredient to avoid + Enter"
          onKeyDown={handleAvoidKey}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRun}
          disabled={loading || items.length === 0}
          className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-1.5 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Comparing..." : "Run Comparison"}
        </button>
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={loading}
          className="text-sm text-indigo-600 font-medium hover:underline disabled:opacity-40"
        >
          Load Demo
        </button>
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

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
      {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 text-sm font-medium py-1 px-3 rounded-md transition-colors ${
            m === mode
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-200"
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

// ─── BasketSummary ───

function BasketSummary({ data }: { data: CompareBasketResponse }) {
  const trend = trendArrow(data.totalPrediction.direction);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-gray-900">
          {formatUsd(data.totalUsd)}
        </span>
        <span className={`text-sm font-semibold ${trend.color}`}>
          {trend.symbol} {data.totalPrediction.percentChange}% 7d
        </span>
      </div>
      <p className="text-sm text-gray-700">{data.recommendation}</p>
      <p className="text-xs text-indigo-600 font-medium">{data.savings}</p>
    </div>
  );
}

// ─── ItemResultCard ───

function ItemResultCard({
  item,
  onFlagClick,
}: {
  item: BasketItem;
  onFlagClick: (flag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = healthLabel(item.health.score);
  const trend = trendArrow(item.prediction.direction);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {item.product.name}
            </span>
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.fg}`}
            >
              {badge.text} {item.health.score}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {item.product.brand} &middot; {item.product.size} &middot;{" "}
            <span className="font-medium text-gray-700">
              {item.product.store}
            </span>
          </p>
        </div>
        <span className="text-base font-bold text-gray-900 shrink-0">
          {formatUsd(item.product.priceUsd)}
        </span>
      </div>

      {/* Flags */}
      {item.health.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.health.flags.map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => onFlagClick(flag)}
              title={`Add "${flag}" to avoid list`}
              className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-200 transition-colors"
            >
              {flag}
            </button>
          ))}
        </div>
      )}

      {/* Prediction row */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className={`font-semibold ${trend.color}`}>
          {trend.symbol} {item.prediction.percentChange}%
        </span>
        <span>Confidence {item.prediction.confidence}%</span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-indigo-600 hover:underline font-medium"
        >
          {expanded ? "Hide" : "Why?"}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 space-y-1">
          <p>
            <span className="font-semibold">Health:</span>{" "}
            {item.health.summary}
          </p>
          <p>
            <span className="font-semibold">Prediction:</span>{" "}
            {item.prediction.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── SkeletonLoader ───

function SkeletonLoader() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 animate-pulse"
        >
          <div className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="flex gap-1">
            <div className="h-5 bg-orange-100 rounded-full w-16" />
            <div className="h-5 bg-orange-100 rounded-full w-20" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 bg-gray-100 rounded w-12" />
            <div className="h-3 bg-gray-100 rounded w-24" />
          </div>
        </div>
      ))}
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
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-2">
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
  const widgetData = useWidget<CompareBasketWidgetProps>();

  const [state, setState] = useState<WidgetState>(() => {
    const initial = widgetData.props?.response ?? null;
    return {
      items: initial ? initial.items.map((i) => i.query) : [],
      avoid: [],
      mode: initial?.mode ?? "balanced",
      results: initial,
      loading: false,
      error: null,
    };
  });

  const cache = useRef<Partial<Record<Mode, CompareBasketResponse>>>({});

  // Populate cache with initial data
  if (state.results && !cache.current[state.results.mode]) {
    cache.current[state.results.mode] = state.results;
  }

  const fetchResults = useCallback(
    (mode: Mode) => {
      // Check cache first
      if (cache.current[mode]) {
        setState((s) => ({
          ...s,
          mode,
          results: cache.current[mode]!,
          loading: false,
          error: null,
        }));
        return;
      }

      setState((s) => ({ ...s, mode, loading: true, error: null }));

      // Simulate async fetch with mock data
      setTimeout(() => {
        try {
          const data = getMockBasketResponse(mode);
          cache.current[mode] = data;
          setState((s) => ({
            ...s,
            results: data,
            loading: false,
          }));
        } catch {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Failed to fetch basket comparison. Please try again.",
          }));
        }
      }, 600);
    },
    []
  );

  const handleRun = useCallback(() => {
    // Clear cache to force re-fetch
    cache.current = {};
    fetchResults(state.mode);
  }, [state.mode, fetchResults]);

  const handleModeChange = useCallback(
    (m: Mode) => {
      fetchResults(m);
    },
    [fetchResults]
  );

  const handleAddItem = useCallback((item: string) => {
    setState((s) => ({ ...s, items: [...s.items, item] }));
  }, []);

  const handleRemoveItem = useCallback((item: string) => {
    setState((s) => ({
      ...s,
      items: s.items.filter((i) => i !== item),
    }));
  }, []);

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

  const handleLoadDemo = useCallback(() => {
    cache.current = {};
    setState((s) => ({
      ...s,
      items: [...DEMO_ITEMS],
      avoid: [],
      loading: true,
      error: null,
    }));
    setTimeout(() => {
      try {
        const data = getMockBasketResponse(state.mode);
        cache.current[state.mode] = data;
        setState((s) => ({ ...s, results: data, loading: false }));
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Failed to load demo data.",
        }));
      }
    }, 600);
  }, [state.mode]);

  const handleFlagClick = useCallback(
    (flag: string) => {
      handleAddAvoid(flag);
    },
    [handleAddAvoid]
  );

  return (
    <McpUseProvider>
      <div className="bg-gradient-to-br from-slate-50 to-indigo-50 p-4 font-sans space-y-3 min-w-[320px] max-w-[480px]">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-gray-900">CartQuant</h2>
          <p className="text-xs text-gray-500">
            Compare prices, health scores &amp; trends across stores
          </p>
        </div>

        {/* Input */}
        <BasketInput
          items={state.items}
          avoid={state.avoid}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onAddAvoid={handleAddAvoid}
          onRemoveAvoid={handleRemoveAvoid}
          onRun={handleRun}
          onLoadDemo={handleLoadDemo}
          loading={state.loading}
        />

        {/* Mode toggle */}
        <ModeToggle mode={state.mode} onChange={handleModeChange} />

        {/* Error */}
        {state.error && (
          <ErrorBanner message={state.error} onRetry={handleRun} />
        )}

        {/* Loading */}
        {state.loading && <SkeletonLoader />}

        {/* Results */}
        {!state.loading && state.results && (
          <>
            <BasketSummary data={state.results} />
            <div className="space-y-2">
              {state.results.items.map((item) => (
                <ItemResultCard
                  key={item.query}
                  item={item}
                  onFlagClick={handleFlagClick}
                />
              ))}
            </div>
          </>
        )}

        {/* Empty state */}
        {!state.loading && !state.results && !state.error && (
          <div className="text-center py-6 text-sm text-gray-400">
            Add items and hit Run, or Load Demo to get started.
          </div>
        )}
      </div>
    </McpUseProvider>
  );
};

export default CartQuantWidget;
