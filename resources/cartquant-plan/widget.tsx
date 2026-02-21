import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import React from "react";
import { propSchema, type CartPlanWidgetProps } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Visual CartQuant comparison for cheapest, quality-first, and tradeoff carts",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: true,
    invoking: "Rendering cart plans...",
    invoked: "Cart plans rendered",
  },
};

const strategyTitle: Record<string, string> = {
  lowest_price: "Cheapest",
  best_tradeoff: "Best Tradeoff",
  highest_quality: "Highest Quality",
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

const CartQuantPlanWidget: React.FC = () => {
  const { props, isPending } = useWidget<CartPlanWidgetProps>();

  if (isPending) {
    return (
      <McpUseProvider>
        <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
          Calculating cart strategies...
        </div>
      </McpUseProvider>
    );
  }

  return (
    <McpUseProvider>
      <div
        style={{
          padding: 16,
          fontFamily: "ui-sans-serif, system-ui",
          display: "grid",
          gap: 12,
          background: "linear-gradient(135deg, #f7fbff 0%, #f9fff2 100%)",
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>CartQuant Plan</h2>
          <p style={{ margin: 0, color: "#334155", fontSize: 13 }}>
            Zip {props.zipCode} • budget {formatUsd(props.preferences.budgetUsd)} •{" "}
            {props.preferences.qualityBias.replace("_", " ")}
          </p>
        </div>

        {props.options.map((option) => (
          <section
            key={option.strategy}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong style={{ color: "#0f172a" }}>{strategyTitle[option.strategy]}</strong>
              <strong style={{ color: "#14532d" }}>{formatUsd(option.totalUsd)}</strong>
            </header>
            <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>
              Quality {option.qualityScore}/100 • Avg distance {option.avgDistanceMiles} mi •
              Confidence {option.confidence}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#1d4ed8" }}>
              Estimated savings vs baseline: {formatUsd(option.estimatedSavingsUsd)}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#334155" }}>
              Stores: {option.stores.join(", ")}
            </p>
            {option.substitutions.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, color: "#7c2d12", fontSize: 12 }}>
                {option.substitutions.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </McpUseProvider>
  );
};

export default CartQuantPlanWidget;
