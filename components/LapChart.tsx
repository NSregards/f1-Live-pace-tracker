import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ProcessedLap } from "../lib/utils";
import { TYRE_COLORS, TYRE_SHORT, secsToMs, getRanges } from "../lib/utils";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  laps: ProcessedLap[];
  selectedDrivers: string[];
  colorMap: Record<string, string>;
  scLaps: number[];
  vscLaps: number[];
  pitStops: any[];
  session: { meetingName: string; year: number };
}

function buildTicksY(yMin: number, yMax: number) {
  const spread = yMax - yMin;
  const raw = spread / 10;
  let step = raw <= 2 ? 2 : raw <= 5 ? 5 : raw <= 10 ? 10 : 15;
  const vals: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= Math.ceil(yMax) + 1; v += step) vals.push(v);
  return { vals, labels: vals.map(secsToMs) };
}

export default function LapChart({ laps, selectedDrivers, colorMap, scLaps, vscLaps, pitStops, session }: Props) {
  const { traces, shapes, annotations, yMin, yMax, maxLap, ticks } = useMemo(() => {
    const filtered = laps.filter((l) => selectedDrivers.includes(l.driver));
    if (!filtered.length) return { traces: [], shapes: [], annotations: [], yMin: 80, yMax: 120, maxLap: 60, ticks: { vals: [], labels: [] } };

    const times = filtered.map((l) => l.lapTimeSeconds);
    const yMin = Math.floor(Math.min(...times)) - 1;
    const yMax = Math.ceil(Math.max(...times)) + 1;
    const maxLap = Math.max(...filtered.map((l) => l.lapNumber));
    const ticks = buildTicksY(yMin, yMax);

    const scRanges = getRanges(new Set(scLaps));
    const vscRanges = getRanges(new Set(vscLaps));

    const shapes: any[] = [];
    const annotations: any[] = [];

    for (const [s, e] of scRanges) {
      shapes.push({
        type: "rect", x0: s - 0.5, x1: e + 0.5, y0: yMin, y1: yMax,
        fillcolor: "rgba(255,215,0,0.07)", line: { color: "rgba(255,215,0,0.5)", width: 1 }, layer: "below",
      });
      annotations.push({
        x: s + 0.3, y: yMin + 0.3, text: "SC", showarrow: false,
        font: { color: "rgba(255,215,0,0.8)", size: 10, family: "JetBrains Mono" }, xanchor: "left", yanchor: "bottom",
      });
    }
    for (const [s, e] of vscRanges) {
      shapes.push({
        type: "rect", x0: s - 0.5, x1: e + 0.5, y0: yMin, y1: yMax,
        fillcolor: "rgba(255,140,0,0.07)", line: { color: "rgba(255,140,0,0.5)", width: 1 }, layer: "below",
      });
      annotations.push({
        x: s + 0.3, y: yMin + 0.3, text: "VSC", showarrow: false,
        font: { color: "rgba(255,140,0,0.8)", size: 10, family: "JetBrains Mono" }, xanchor: "left", yanchor: "bottom",
      });
    }

    // Pit stop lines
    const pitsByLap: Record<number, { driver: string; prev: string; next: string }[]> = {};
    for (const p of pitStops) {
      const driver = selectedDrivers.find((d) => {
        const driverLap = filtered.find((l) => l.driver === d && l.lapNumber === p.lap_number);
        return driverLap?.driverNumber === p.driver_number;
      });
      if (!driver) continue;
      const driverLaps = filtered.filter((l) => l.driver === driver).sort((a, b) => a.lapNumber - b.lapNumber);
      const lapBefore = driverLaps.filter((l) => l.lapNumber < p.lap_number).pop();
      const lapAfter = driverLaps.find((l) => l.lapNumber >= p.lap_number);
      const prev = TYRE_SHORT[lapBefore?.compound ?? "UNKNOWN"] ?? "?";
      const next = TYRE_SHORT[lapAfter?.compound ?? "UNKNOWN"] ?? "?";
      const x = p.lap_number - 0.5;
      if (!pitsByLap[x]) pitsByLap[x] = [];
      pitsByLap[x].push({ driver, prev, next });
    }

    const yLevels = [0.97, 0.87, 0.77, 0.67];
    let levelIdx = 0;
    let lastX = -999;
    for (const [xStr, pits] of Object.entries(pitsByLap)) {
      const x = Number(xStr);
      if (Math.abs(x - lastX) < 4) levelIdx = (levelIdx + 1) % yLevels.length;
      else levelIdx = 0;
      lastX = x;
      for (const pit of pits) {
        const dc = colorMap[pit.driver] ?? "#888";
        shapes.push({ type: "line", x0: x, x1: x, y0: yMin, y1: yMax, line: { color: dc, width: 1, dash: "dot" } });
        annotations.push({
          x, y: yLevels[levelIdx], yref: "paper",
          text: `${pit.driver} ${pit.prev}>${pit.next}`, showarrow: false,
          font: { color: dc, size: 9, family: "JetBrains Mono" },
          bgcolor: "rgba(8,8,8,0.92)", bordercolor: dc, borderwidth: 1, borderpad: 3,
          yanchor: "bottom", xanchor: "left",
        });
      }
    }

    // Traces per driver per stint
    const traces: any[] = [];
    for (const driver of selectedDrivers) {
      const dc = colorMap[driver] ?? "#888";
      const driverLaps = filtered.filter((l) => l.driver === driver).sort((a, b) => a.lapNumber - b.lapNumber);
      const stints = Array.from(new Set(driverLaps.map((l) => `${l.stint}-${l.compound}`))); 

      stints.forEach((stintKey, idx) => {
        const [stintNum, compound] = stintKey.split("-");
        const stintLaps = driverLaps.filter((l) => `${l.stint}-${l.compound}` === stintKey);
        const tyreCol = TYRE_COLORS[compound] ?? "#888";
        const normalLaps = stintLaps.filter((l) => !l.isNeutralised);
        const scLapsInStint = stintLaps.filter((l) => l.isNeutralised);

        if (normalLaps.length) {
          traces.push({
            x: normalLaps.map((l) => l.lapNumber),
            y: normalLaps.map((l) => l.lapTimeSeconds),
            mode: "markers",
            marker: { color: tyreCol, size: 5, opacity: 0.45, line: { color: "#000", width: 0.3 } },
            showlegend: false, hoverinfo: "skip", type: "scatter",
          });
        }
        if (scLapsInStint.length) {
          traces.push({
            x: scLapsInStint.map((l) => l.lapNumber),
            y: scLapsInStint.map((l) => l.lapTimeSeconds),
            mode: "markers",
            marker: { color: "rgba(0,0,0,0)", size: 7, symbol: "circle-open", line: { color: tyreCol, width: 1 } },
            showlegend: false, hoverinfo: "skip", type: "scatter",
          });
        }
        traces.push({
          x: stintLaps.map((l) => l.lapNumber),
          y: stintLaps.map((l) => l.rollingAvg),
          mode: "lines",
          name: driver,
          legendgroup: driver,
          showlegend: idx === 0,
          line: { color: tyreCol, width: 2.5 },
          customdata: stintLaps.map((l) => [l.lapTimeDisplay, l.compound, l.tyreLife]),
          hovertemplate: `<b>${driver}</b><br>Lap %{x}  |  %{customdata[0]}<br>%{customdata[1]}  /  Tyre age %{customdata[2]} laps<extra></extra>`,
          type: "scatter",
        });
      });
    }

    return { traces, shapes, annotations, yMin, yMax, maxLap, ticks };
  }, [laps, selectedDrivers, colorMap, scLaps, vscLaps, pitStops]);

  const layout: any = {
    plot_bgcolor: "#080808",
    paper_bgcolor: "#080808",
    font: { color: "#666666", family: "JetBrains Mono" },
    title: {
      text: `${session.meetingName.toUpperCase()}  ${session.year}`,
      font: { size: 13, color: "#333333", family: "JetBrains Mono" },
      x: 0, pad: { l: 0, b: 10 },
    },
    xaxis: {
      title: { text: "LAP", font: { size: 9, color: "#333", family: "JetBrains Mono" } },
      gridcolor: "#111111", color: "#333333", zeroline: false,
      tickfont: { color: "#555555", size: 11, family: "JetBrains Mono" },
      range: [1, maxLap + 1], dtick: 5,
      linecolor: "#1e1e1e", linewidth: 1, ticklen: 4,
    },
    yaxis: {
      title: { text: "LAP TIME", font: { size: 9, color: "#333", family: "JetBrains Mono" } },
      gridcolor: "#111111", color: "#333333",
      range: [yMax, yMin],
      tickvals: ticks.vals, ticktext: ticks.labels,
      tickfont: { color: "#aaaaaa", size: 11, family: "JetBrains Mono" },
      ticklen: 4, linecolor: "#1e1e1e", linewidth: 1,
    },
    legend: {
      bgcolor: "rgba(8,8,8,0.95)", bordercolor: "#1e1e1e", borderwidth: 1,
      font: { size: 11, color: "#cccccc", family: "JetBrains Mono" },
      x: 1.01, y: 1, xanchor: "left",
      orientation: "v",
    },
    hovermode: "x unified",
    height: 500,
    margin: { l: 80, r: 40, t: 40, b: 50 },
    shapes,
    annotations,
    dragmode: "pan",
  };

  const config: any = {
    // Show minimal toolbar — only essential buttons
    modeBarButtonsToRemove: [
      "select2d", "lasso2d", "autoScale2d",
      "hoverClosestCartesian", "hoverCompareCartesian",
      "toggleSpikelines",
    ],
    modeBarButtonsToAdd: [],
    displaylogo: false,
    responsive: true,
    // Enable touch scroll/zoom on mobile
    scrollZoom: true,
    doubleClick: "reset",
    displayModeBar: "hover",
  };

  return (
    <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" } as any}>
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: "100%", minWidth: 480 }}
        useResizeHandler
      />
    </div>
  );
}