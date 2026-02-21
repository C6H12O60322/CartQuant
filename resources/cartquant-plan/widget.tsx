import "./widget.css";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  compareBasketWidgetPropsSchema,
  type CompareBasketResponse,
  type CompareBasketWidgetProps,
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

function healthColor(score: number): { bg: string; fg: string; text: string } {
  if (score >= 80) return { bg: "#ECFDF5", fg: "#059669", text: "Clean" };
  if (score >= 60) return { bg: "#FFF7ED", fg: "#D97706", text: "Okay" };
  return { bg: "#FEF2F2", fg: "#DC2626", text: "Watch" };
}

function trendInfo(dir: TrendDirection): { symbol: string; color: string } {
  if (dir === "rising") return { symbol: "\u2191", color: "#DC2626" };
  if (dir === "falling") return { symbol: "\u2193", color: "#059669" };
  return { symbol: "\u2192", color: "#64748B" };
}

function altId(alt: ItemAlternative): string {
  return alt.product.store + ":" + alt.product.name;
}

// ─── State ───

interface WidgetState {
  view: "overview" | "detail";
  selectedItemQuery: string | null;
  results: CompareBasketResponse | null;
  loading: boolean;
  error: string | null;
  activeStoreId: string | null;
  customPicks: Record<string, string>; // itemQuery -> altId
}

// ─── Basket Plan Computation (respects customPicks) ───

function computePlan(
  items: BasketItemWithAlts[],
  customPicks: Record<string, string>
): BasketPlan {
  const storeMap = new Map<string, { items: string[]; subtotal: number }>();
  const pickedAlts: ItemAlternative[] = [];

  for (const item of items) {
    const pickId = customPicks[item.query];
    const picked = pickId
      ? item.alternatives.find((a) => altId(a) === pickId) ?? item.alternatives[0]
      : item.alternatives[0];
    if (!picked?.product) continue;

    pickedAlts.push(picked);
    const store = picked.product.store;
    const entry = storeMap.get(store) ?? { items: [], subtotal: 0 };
    entry.items.push(item.query);
    entry.subtotal += picked.product.priceUsd;
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

  const avgChange =
    pickedAlts.length > 0
      ? pickedAlts.reduce((sum, alt) => {
          if (!alt?.prediction) return sum;
          const sign = alt.prediction.direction === "falling" ? -1 : 1;
          return sum + alt.prediction.percentChange * sign;
        }, 0) / pickedAlts.length
      : 0;
  const avgConf =
    pickedAlts.length > 0
      ? pickedAlts.reduce((s, a) => s + (a?.prediction?.confidence ?? 0), 0) / pickedAlts.length
      : 0;

  const parts = storeBreakdown.map(
    (s) => `${s.store} for ${s.items.length} item${s.items.length > 1 ? "s" : ""}`
  );

  return {
    summary:
      storeBreakdown.length === 1
        ? `All items from ${storeBreakdown[0].store}`
        : parts.join(", "),
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalPrediction: {
      direction: avgChange > 1 ? "rising" : avgChange < -1 ? "falling" : "flat",
      percentChange: Math.round(Math.abs(avgChange) * 10) / 10,
      confidence: Math.round(avgConf),
      recommendation: "Moderate upward pressure. This basket balances value well.",
    },
    storeBreakdown,
    savings: "Save $4.27 vs cheapest organic, $9.71 vs full Whole Foods",
  };
}

// ─── Circular Score SVG ───

function CircularScore({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#059669" : score >= 60 ? "#D97706" : "#DC2626";
  const bgColor = score >= 80 ? "#ECFDF5" : score >= 60 ? "#FFF7ED" : "#FEF2F2";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill={bgColor} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#E2E8F0"
        strokeWidth="6"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="20"
        fontWeight="700"
        fill="#0F172A"
      >
        {score}
      </text>
    </svg>
  );
}

// ─── Leaflet Map Panel ───

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const SF_CENTER: [number, number] = [37.7749, -122.4194];
const MAP_ZOOM = 13;

function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) {
      resolve();
      return;
    }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) {
      const check = setInterval(() => {
        if ((window as any).L) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(script);
  });
}

function makeIcon(L: any, color: string, size: number, badge?: number): any {
  const badgeSvg =
    badge != null
      ? `<circle cx="${size - 6}" cy="5" r="6" fill="#4f46e5" stroke="#fff" stroke-width="1"/>
         <text x="${size - 6}" y="8" text-anchor="middle" font-size="8" font-weight="bold" fill="#fff">${badge}</text>`
      : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(${size / 24})">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="12" cy="9" r="2.5" fill="#fff"/>
      </g>
      ${badgeSvg}
    </svg>`,
  });
}

function MapPanel({
  storeBreakdown,
  activeStoreId,
  onStoreClick,
}: {
  storeBreakdown: StoreAssignment[];
  activeStoreId: string | null;
  onStoreClick: (storeName: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const onStoreClickRef = useRef(onStoreClick);
  const [ready, setReady] = useState(false);

  onStoreClickRef.current = onStoreClick;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = (window as any).L;
      const map = L.map(containerRef.current, {
        center: SF_CENTER,
        zoom: MAP_ZOOM,
        zoomControl: true,
        attributionControl: false,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      for (const store of STORES) {
        const marker = L.marker([store.lat, store.lng], {
          icon: makeIcon(L, "#9ca3af", 28),
          title: store.name,
        }).addTo(map);
        marker.bindTooltip(store.name, { direction: "top", offset: [0, -24] });
        marker.on("click", () => onStoreClickRef.current(store.name));
        markersRef.current.set(store.name, marker);
      }

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const L = (window as any).L;
    if (!L) return;
    const assignedStores = new Set(storeBreakdown.map((s) => s.store));

    for (const store of STORES) {
      const marker = markersRef.current.get(store.name);
      if (!marker) continue;
      const isActive = store.name === activeStoreId;
      const isInPlan = assignedStores.has(store.name);
      const assigned = storeBreakdown.find((s) => s.store === store.name);

      const color = isActive ? "#4f46e5" : isInPlan ? "#2563eb" : "#9ca3af";
      const size = isActive ? 36 : 28;
      const badge = isInPlan && assigned ? assigned.items.length : undefined;
      marker.setIcon(makeIcon(L, color, size, badge));

      const label =
        isInPlan && assigned
          ? `<b>${store.name}</b><br/>${assigned.items.length} item${assigned.items.length > 1 ? "s" : ""} · ${formatUsd(assigned.subtotalUsd)}`
          : store.name;
      marker.setTooltipContent(label);

      if (isActive) marker.setZIndexOffset(1000);
      else marker.setZIndexOffset(0);
    }

    if (activeStoreId && mapRef.current) {
      const activeStore = STORES.find((s) => s.name === activeStoreId);
      if (activeStore) {
        mapRef.current.panTo([activeStore.lat, activeStore.lng], {
          animate: true,
          duration: 0.4,
        });
      }
    }
  }, [storeBreakdown, activeStoreId, ready]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{ width: "100%", height: "100%", minHeight: 200 }}
    />
  );
}

// ─── SkeletonCardList ───

function SkeletonCardList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 14,
          }}
          className="animate-pulse"
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ height: 16, background: "#E2E8F0", borderRadius: 4, width: "50%" }} />
            <div style={{ height: 16, background: "#E2E8F0", borderRadius: 4, width: 48 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ height: 20, background: "#F1F5F9", borderRadius: 10, width: 64 }} />
            <div style={{ height: 20, background: "#F1F5F9", borderRadius: 4, width: 40 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ErrorBanner ───

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        margin: "8px 20px",
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <p style={{ fontSize: 14, color: "#DC2626", margin: 0 }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#DC2626",
          background: "none",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Overview: Basket Plan Hero Card ───

function BasketPlanHero({ plan }: { plan: BasketPlan }) {
  const direction = plan.totalPrediction?.direction ?? "flat";
  const trend = trendInfo(direction);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)",
        border: "1px solid #C7D2FE",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#4F46E5",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        Recommended Basket Plan
      </div>
      <p style={{ fontSize: 14, fontWeight: 500, color: "#1E293B", margin: "0 0 12px 0" }}>
        {plan.summary}
      </p>

      {/* Total price + trend */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: "#0F172A" }}>
          {formatUsd(plan.totalUsd)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: trend.color }}>
          {trend.symbol}
          {plan.totalPrediction?.percentChange ?? 0}%
        </span>
        <span style={{ fontSize: 12, color: "#64748B" }}>7d</span>
      </div>

      {/* Store breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {plan.storeBreakdown.map((sb) => (
          <div
            key={sb.store}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, color: "#334155" }}>{sb.store}</span>
              <span style={{ color: "#94A3B8" }}>
                {sb.items.length} item{sb.items.length > 1 ? "s" : ""}
              </span>
            </div>
            <span style={{ fontWeight: 600, color: "#334155" }}>{formatUsd(sb.subtotalUsd)}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: "#4F46E5", fontWeight: 500 }}>{plan.savings}</div>
    </div>
  );
}

// ─── Overview: Item Card ───

function OverviewItemCard({
  item,
  customPicks,
  onClick,
}: {
  item: BasketItemWithAlts;
  customPicks: Record<string, string>;
  onClick: () => void;
}) {
  const pickId = customPicks[item.query];
  const picked = pickId
    ? item.alternatives.find((a) => altId(a) === pickId) ?? item.alternatives[0]
    : item.alternatives[0];

  if (!picked?.product) return null;

  const isRecommended = !pickId; // recommended = using default best
  const score = picked.health?.score ?? 0;
  const hc = healthColor(score);
  const direction = picked.prediction?.direction ?? "flat";
  const trend = trendInfo(direction);
  const pctChange = picked.prediction?.percentChange ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        background: "#FFFFFF",
        cursor: "pointer",
        transition: "all 0.15s ease",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLElement).style.borderColor = "#CBD5E1";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
      }}
    >
      {/* Row 1: Star + Store name -> Price */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {isRecommended && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 6,
                color: "#92400E",
                background: "#FEF3C7",
                border: "1px solid #FDE68A",
                flexShrink: 0,
              }}
            >
              &#9733;
            </span>
          )}
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#0F172A",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {picked.product.store}
          </span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", flexShrink: 0 }}>
          {formatUsd(picked.product.priceUsd)}
        </span>
      </div>

      {/* Row 2: Health badge + Trend + Product name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: hc.bg,
            color: hc.fg,
            flexShrink: 0,
          }}
        >
          {hc.text} {score}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: trend.color, flexShrink: 0 }}>
          {trend.symbol}
          {pctChange}%
        </span>
        <span
          style={{
            fontSize: 13,
            color: "#64748B",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {picked.product.name}
        </span>
      </div>
    </button>
  );
}

// ─── Detail: Alternative Card with Swap button ───

function DetailAltCard({
  alt,
  onSwap,
}: {
  alt: ItemAlternative;
  onSwap: () => void;
}) {
  const score = alt.health?.score ?? 0;
  const hc = healthColor(score);
  const direction = alt.prediction?.direction ?? "flat";
  const trend = trendInfo(direction);
  const pctChange = alt.prediction?.percentChange ?? 0;

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        background: "#FFFFFF",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Top row: product name + price */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#0F172A",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {alt.product.name}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 2 }}>
            {alt.product.store}
          </div>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", flexShrink: 0 }}>
          {formatUsd(alt.product.priceUsd)}
        </span>
      </div>

      {/* Bottom row: health badge + trend + swap button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 10,
              background: hc.bg,
              color: hc.fg,
            }}
          >
            {hc.text} {score}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: trend.color }}>
            {trend.symbol}
            {pctChange}%
          </span>
        </div>
        <button
          type="button"
          onClick={onSwap}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#FFFFFF",
            background: "#4F46E5",
            border: "none",
            borderRadius: 8,
            padding: "6px 16px",
            cursor: "pointer",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#4338CA";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#4F46E5";
          }}
        >
          Swap
        </button>
      </div>
    </div>
  );
}

// ─── Detail View: Product Detail + Alternatives ───

function DetailView({
  item,
  customPicks,
  onBack,
  onSwap,
  activeStoreId,
}: {
  item: BasketItemWithAlts;
  customPicks: Record<string, string>;
  onBack: () => void;
  onSwap: (itemQuery: string, swapAltId: string) => void;
  activeStoreId: string | null;
}) {
  const pickId = customPicks[item.query];
  const picked = pickId
    ? item.alternatives.find((a) => altId(a) === pickId) ?? item.alternatives[0]
    : item.alternatives[0];

  const score = picked.health?.score ?? 0;
  const ingredients = picked.ingredients ?? [];
  const otherAlts = item.alternatives.filter((a) => altId(a) !== altId(picked));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        animation: "fadeIn 0.2s ease",
      }}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          fontWeight: 500,
          color: "#4F46E5",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span style={{ fontSize: 18 }}>&larr;</span>
        Back to basket
      </button>

      {/* Product Detail Card */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {picked.product.name}
            </h2>
            <p style={{ fontSize: 14, color: "#64748B", margin: "4px 0 0 0" }}>
              {picked.product.store} &middot; {picked.product.brand} &middot; {picked.product.size}
            </p>
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0F172A",
                margin: "12px 0 0 0",
              }}
            >
              {formatUsd(picked.product.priceUsd)}
            </p>
          </div>

          {/* Circular Score */}
          <div style={{ flexShrink: 0 }}>
            <CircularScore score={score} size={80} />
          </div>
        </div>

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}
            >
              Ingredients:
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {ingredients.map((ing, i) => (
                <li key={i} style={{ fontSize: 13, color: "#64748B" }}>
                  {ing}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Health summary */}
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
            {picked.health?.summary ?? "No health data available."}
          </p>
        </div>
      </div>

      {/* Alternatives Section */}
      {otherAlts.length > 0 && (
        <div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#0F172A",
              margin: "0 0 12px 0",
            }}
          >
            Alternatives
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {otherAlts.map((alt) => (
              <DetailAltCard
                key={altId(alt)}
                alt={alt}
                onSwap={() => onSwap(item.query, altId(alt))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Widget ───

const CartQuantWidget: React.FC = () => {
  const widgetData = useWidget<CompareBasketWidgetProps>();

  const [state, setState] = useState<WidgetState>(() => {
    const initial = widgetData.props?.response ?? null;
    return {
      view: "overview",
      selectedItemQuery: null,
      results: initial,
      loading: false,
      error: null,
      activeStoreId: null,
      customPicks: {},
    };
  });

  const fetchResults = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setTimeout(() => {
      try {
        const data = getMockBasketResponse("balanced");
        setState((s) => ({
          ...s,
          results: data,
          loading: false,
          customPicks: {},
        }));
      } catch {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Failed to fetch basket comparison. Please try again.",
        }));
      }
    }, 600);
  }, []);

  const handleLoadDemo = useCallback(() => {
    fetchResults();
  }, [fetchResults]);

  const handleStoreClick = useCallback((storeName: string) => {
    setState((s) => ({
      ...s,
      activeStoreId: s.activeStoreId === storeName ? null : storeName,
    }));
  }, []);

  const handleItemClick = useCallback((query: string) => {
    setState((s) => ({
      ...s,
      view: "detail",
      selectedItemQuery: query,
    }));
  }, []);

  const handleBack = useCallback(() => {
    setState((s) => ({
      ...s,
      view: "overview",
      selectedItemQuery: null,
    }));
  }, []);

  const handleSwap = useCallback((itemQuery: string, swapAltId: string) => {
    setState((s) => ({
      ...s,
      customPicks: { ...s.customPicks, [itemQuery]: swapAltId },
      view: "overview",
      selectedItemQuery: null,
    }));
  }, []);

  // Basket plan (recomputed when customPicks or results change)
  const basketPlan = useMemo(() => {
    if (!state.results) return null;
    return computePlan(state.results.items, state.customPicks);
  }, [state.results, state.customPicks]);

  // Selected item for detail view
  const selectedItem = useMemo(
    () =>
      state.results?.items.find((i) => i.query === state.selectedItemQuery) ?? null,
    [state.results, state.selectedItemQuery]
  );

  // ─── Render: Empty state ───
  if (!state.results && !state.loading && !state.error) {
    return (
      <McpUseProvider>
        <div
          style={{
            background: "#F8FAFC",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, Inter, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid #E2E8F0",
              background: "#FFFFFF",
            }}
          >
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                letterSpacing: "-0.025em",
              }}
            >
              CartQuant
            </h1>
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>&#128722;</div>
              <p style={{ fontSize: 14, color: "#64748B", margin: "0 0 16px 0" }}>
                Compare prices, health scores &amp; trends across stores
              </p>
              <button
                type="button"
                onClick={handleLoadDemo}
                style={{
                  background: "#4F46E5",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "10px 24px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#4338CA";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#4F46E5";
                }}
              >
                Load Demo Basket
              </button>
            </div>
          </div>
        </div>
      </McpUseProvider>
    );
  }

  // ─── Render: Main (Overview or Detail) ───
  return (
    <McpUseProvider>
      <div
        style={{
          background: "#F8FAFC",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, Inter, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid #E2E8F0",
            background: "#FFFFFF",
          }}
        >
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#0F172A",
              margin: 0,
              letterSpacing: "-0.025em",
            }}
          >
            CartQuant
          </h1>
        </div>

        {/* Error */}
        {state.error && <ErrorBanner message={state.error} onRetry={fetchResults} />}

        {/* Main two-column layout */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left Column (~50%) */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {state.loading ? (
              <SkeletonCardList />
            ) : state.view === "detail" && selectedItem ? (
              <DetailView
                item={selectedItem}
                customPicks={state.customPicks}
                onBack={handleBack}
                onSwap={handleSwap}
                activeStoreId={state.activeStoreId}
              />
            ) : (
              /* Overview content */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  animation: "fadeIn 0.2s ease",
                }}
              >
                {/* Basket Plan Hero */}
                {basketPlan && <BasketPlanHero plan={basketPlan} />}

                {/* Item Cards */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {state.results?.items.map((item) => (
                    <OverviewItemCard
                      key={item.query}
                      item={item}
                      customPicks={state.customPicks}
                      onClick={() => handleItemClick(item.query)}
                    />
                  ))}
                </div>

                {/* Book Button */}
                <button
                  type="button"
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    background: "#4F46E5",
                    border: "none",
                    borderRadius: 14,
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                    marginTop: 4,
                    boxShadow: "0 2px 8px rgba(79,70,229,0.25)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#4338CA";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#4F46E5";
                  }}
                >
                  Book
                </button>
              </div>
            )}
          </div>

          {/* Right Column (~50%): Map */}
          <div
            style={{
              flex: 1,
              borderLeft: "1px solid #E2E8F0",
              position: "relative",
              minHeight: 300,
            }}
          >
            {basketPlan && (
              <MapPanel
                storeBreakdown={basketPlan.storeBreakdown}
                activeStoreId={state.activeStoreId}
                onStoreClick={handleStoreClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* Inline keyframe for fadeIn animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </McpUseProvider>
  );
};

export default CartQuantWidget;
