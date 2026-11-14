import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";
import { useTheme } from "../context/ThemeContext";

/**
 * Reusable responsive Plotly wrapper synchronized with Light / Dark mode tokens.
 */
export default function PlotlyChart({ data, layout, config, className = "w-full h-72" }) {
  const containerRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === "dark";
    const textColor = isDark ? "#CBD5E1" : "#334155";
    const gridColor = isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(148, 163, 184, 0.22)";

    const mergedLayout = {
      autosize: true,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, system-ui, sans-serif", size: 12, color: textColor },
      ...layout,
      xaxis: {
        gridcolor: gridColor,
        ...(layout?.xaxis || {}),
      },
      yaxis: {
        gridcolor: gridColor,
        ...(layout?.yaxis || {}),
      },
    };

    Plotly.react(el, data, mergedLayout, {
      responsive: true,
      displayModeBar: false,
      ...config,
    });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        Plotly.Plots.resize(containerRef.current);
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      Plotly.purge(el);
    };
  }, [data, layout, config, theme]);

  return <div ref={containerRef} className={className} />;
}
