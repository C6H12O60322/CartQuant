import "./widget.css";
import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
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

// ─── Store Location Types (from Google Places API) ───

interface StoreLocationPin {
  name: string;
  placeId: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  openNow: boolean | null;
}

/** Map of store chain name → array of real locations */
type StoreLocationsMap = Record<string, StoreLocationPin[]>;

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
  addingItem: boolean;
  searchQuery: string;
  storeLocations: StoreLocationsMap | null;
  mapCenter: { lat: number; lng: number } | null;
  locationsLoading: boolean;
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
const SF_CENTER_OBJ = { lat: 37.7749, lng: -122.4194 };
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

/**
 * Flatten dynamic store locations into a simple pin array.
 * Each pin gets a `chainName` (the search key, e.g. "Trader Joe's") so we can
 * match it back to the basket plan's store breakdown.
 */
interface FlatPin {
  key: string;       // unique key for React / marker map
  chainName: string; // matches StoreAssignment.store
  name: string;      // actual place name from Google
  lat: number;
  lng: number;
  address: string;
}

function flattenLocations(
  locations: StoreLocationsMap | null
): FlatPin[] {
  if (!locations) return [];
  const pins: FlatPin[] = [];
  for (const [chainName, locs] of Object.entries(locations)) {
    for (const loc of locs) {
      pins.push({
        key: loc.placeId || `${chainName}:${loc.lat}:${loc.lng}`,
        chainName,
        name: loc.name,
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address,
      });
    }
  }
  return pins;
}

/** Build FlatPin array from the hardcoded STORES fallback */
function fallbackPins(): FlatPin[] {
  return STORES.map((s) => ({
    key: `fallback:${s.name}`,
    chainName: s.name,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    address: "",
  }));
}

function MapPanel({
  storeBreakdown,
  activeStoreId,
  onStoreClick,
  storeLocations,
  mapCenter,
}: {
  storeBreakdown: StoreAssignment[];
  activeStoreId: string | null;
  onStoreClick: (storeName: string) => void;
  storeLocations: StoreLocationsMap | null;
  mapCenter: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const onStoreClickRef = useRef(onStoreClick);
  const [ready, setReady] = useState(false);

  onStoreClickRef.current = onStoreClick;

  // Resolve pins: use dynamic locations if available, else fallback
  const pins = useMemo(
    () => {
      const dynamic = flattenLocations(storeLocations);
      return dynamic.length > 0 ? dynamic : fallbackPins();
    },
    [storeLocations]
  );

  const center = mapCenter ?? SF_CENTER_OBJ;

  // Initialize map
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = (window as any).L;
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
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

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 100);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter map when center changes
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], MAP_ZOOM, {
      animate: true,
      duration: 0.4,
    });
  }, [center.lat, center.lng, ready]);

  // Sync markers when pins or breakdown change
  useEffect(() => {
    if (!ready) return;
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    const assignedStores = new Set(storeBreakdown.map((s) => s.store));
    const currentKeys = new Set(pins.map((p) => p.key));

    // Remove markers no longer in pins
    for (const [key, marker] of markersRef.current.entries()) {
      if (!currentKeys.has(key)) {
        mapRef.current.removeLayer(marker);
        markersRef.current.delete(key);
      }
    }

    // Add or update markers
    for (const pin of pins) {
      const isActive = pin.chainName === activeStoreId;
      const isInPlan = assignedStores.has(pin.chainName);
      const assigned = storeBreakdown.find((s) => s.store === pin.chainName);

      const color = isActive ? "#4f46e5" : isInPlan ? "#2563eb" : "#9ca3af";
      const size = isActive ? 36 : 28;
      const badge = isInPlan && assigned ? assigned.items.length : undefined;

      let marker = markersRef.current.get(pin.key);
      if (!marker) {
        marker = L.marker([pin.lat, pin.lng], {
          icon: makeIcon(L, color, size, badge),
          title: pin.name,
        }).addTo(mapRef.current);
        marker.on("click", () => onStoreClickRef.current(pin.chainName));
        markersRef.current.set(pin.key, marker);
      } else {
        marker.setLatLng([pin.lat, pin.lng]);
      }

      marker.setIcon(makeIcon(L, color, size, badge));

      const label =
        isInPlan && assigned
          ? `<b>${pin.name}</b><br/>${pin.address ? pin.address + "<br/>" : ""}${assigned.items.length} item${assigned.items.length > 1 ? "s" : ""} · ${formatUsd(assigned.subtotalUsd)}`
          : `<b>${pin.name}</b>${pin.address ? "<br/>" + pin.address : ""}`;
      marker.bindTooltip(label, { direction: "top", offset: [0, -24] });

      marker.setZIndexOffset(isActive ? 1000 : 0);
    }

    // Pan to active store
    if (activeStoreId && mapRef.current) {
      const activePin = pins.find((p) => p.chainName === activeStoreId);
      if (activePin) {
        mapRef.current.panTo([activePin.lat, activePin.lng], {
          animate: true,
          duration: 0.4,
        });
      }
    }
  }, [pins, storeBreakdown, activeStoreId, ready]);

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

// ─── Add Item Bar ───

const SUGGESTED_PRODUCTS = [
  "rice", "butter", "orange juice", "avocado", "bananas", "cheese",
  "pasta", "tomatoes", "apples", "salmon", "bacon", "coffee",
  "peanut butter", "oatmeal", "spinach", "potatoes", "onions", "garlic",
];

function AddItemBar({
  isOpen,
  searchQuery,
  existingItems,
  onToggle,
  onSearchChange,
  onAddItem,
}: {
  isOpen: boolean;
  searchQuery: string;
  existingItems: string[];
  onToggle: () => void;
  onSearchChange: (q: string) => void;
  onAddItem: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "10px 0",
          background: "#fff",
          border: "2px dashed #CBD5E1",
          borderRadius: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 0.2s ease",
          color: "#64748B",
          fontSize: 14,
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = "#4F46E5";
          el.style.color = "#4F46E5";
          el.style.background = "#FAFAFE";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.borderColor = "#CBD5E1";
          el.style.color = "#64748B";
          el.style.background = "#fff";
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#EEF2FF",
            color: "#4F46E5",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +
        </span>
        Add item to basket
      </button>
    );
  }

  const q = searchQuery.toLowerCase().trim();
  const suggestions = q
    ? SUGGESTED_PRODUCTS.filter(
        (p) => p.includes(q) && !existingItems.includes(p)
      ).slice(0, 5)
    : [];
  // Allow typed entry if >= 2 chars and not already in basket
  if (q.length >= 2 && !existingItems.includes(q) && !suggestions.includes(q)) {
    suggestions.unshift(q);
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        border: "1px solid #E2E8F0",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#94A3B8", fontSize: 16, flexShrink: 0 }}>
          &#128269;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onToggle();
            if (e.key === "Enter" && q) onAddItem(q);
          }}
          placeholder="Search for a product (e.g. rice, butter, orange juice...)"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            color: "#0F172A",
            background: "transparent",
            padding: "4px 0",
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#94A3B8",
            fontSize: 18,
            padding: "0 4px",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          &times;
        </button>
      </div>

      {suggestions.length > 0 && (
        <div
          style={{
            marginTop: 8,
            borderTop: "1px solid #F1F5F9",
            paddingTop: 6,
          }}
        >
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onAddItem(name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#334155",
                borderRadius: 8,
                transition: "background 0.1s ease",
                textAlign: "left",
                textTransform: "capitalize",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#F8FAFC";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "none";
              }}
            >
              <span style={{ color: "#4F46E5", fontSize: 14 }}>+</span>
              {name}
            </button>
          ))}
        </div>
      )}
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
      addingItem: false,
      searchQuery: "",
      storeLocations: null,
      mapCenter: null,
      locationsLoading: false,
    };
  });

  // ─── MCP Tool Hooks for real store locations ───
  const geocodeTool = useCallTool<
    { address: string },
    { structuredContent: { lat: number; lng: number; formattedAddress: string } }
  >("geocode-location");

  const findStoresTool = useCallTool<
    { lat: number; lng: number; storeNames?: string[]; radiusMeters?: number; maxPerStore?: number },
    { structuredContent: { stores: StoreLocationsMap; totalLocations: number } }
  >("find-stores-nearby");

  // Fetch real store locations for a given zip/address
  const fetchStoreLocations = useCallback(
    async (address: string) => {
      setState((s) => ({ ...s, locationsLoading: true }));
      try {
        // Step 1: Geocode the address
        const geoResult = await geocodeTool.callToolAsync({ address });
        const center = {
          lat: geoResult.structuredContent.lat,
          lng: geoResult.structuredContent.lng,
        };

        // Step 2: Find stores near that location
        // Extract unique store names from current results, or use defaults
        const storeNames = state.results
          ? [...new Set(
              state.results.items.flatMap((item) =>
                item.alternatives.map((alt) => alt.product.store)
              )
            )]
          : undefined;

        const storesResult = await findStoresTool.callToolAsync({
          lat: center.lat,
          lng: center.lng,
          storeNames,
          radiusMeters: 8000,
          maxPerStore: 3,
        });

        setState((s) => ({
          ...s,
          mapCenter: center,
          storeLocations: storesResult.structuredContent.stores,
          locationsLoading: false,
        }));
      } catch (err) {
        // Silently fall back to hardcoded STORES — map still works
        console.warn("Failed to fetch real store locations, using fallback:", err);
        setState((s) => ({ ...s, locationsLoading: false }));
      }
    },
    [geocodeTool, findStoresTool, state.results]
  );

  // Auto-fetch store locations when results first load
  const locationsFetchedRef = useRef(false);
  useEffect(() => {
    if (state.results && !state.storeLocations && !state.locationsLoading && !locationsFetchedRef.current) {
      locationsFetchedRef.current = true;
      // Default to SF zip — in production this would come from user input
      fetchStoreLocations("94110");
    }
  }, [state.results, state.storeLocations, state.locationsLoading, fetchStoreLocations]);

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

                {/* Add Item Button / Search Bar */}
                <AddItemBar
                  isOpen={state.addingItem}
                  searchQuery={state.searchQuery}
                  existingItems={state.results?.items.map((i) => i.query) ?? []}
                  onToggle={() =>
                    setState((s) => ({
                      ...s,
                      addingItem: !s.addingItem,
                      searchQuery: "",
                    }))
                  }
                  onSearchChange={(q) =>
                    setState((s) => ({ ...s, searchQuery: q }))
                  }
                  onAddItem={(name) => {
                    // In real usage this would call a tool; for demo we close the bar
                    setState((s) => ({
                      ...s,
                      addingItem: false,
                      searchQuery: "",
                    }));
                  }}
                />

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
                storeLocations={state.storeLocations}
                mapCenter={state.mapCenter}
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
