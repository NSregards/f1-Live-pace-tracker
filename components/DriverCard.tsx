import { secsToMs } from "../lib/utils";
import type { DriverSummary } from "../lib/utils";

interface Props {
  summary: DriverSummary;
}

export default function DriverCard({ summary }: Props) {
  const { driver, bestLap, avgPace, compounds, color } = summary;

  return (
    <div
      className="driver-card"
      style={{ borderTopColor: color }}
    >
      <div className="driver-name" style={{ color }}>
        {driver}
      </div>
      <div className="stat-label">BEST LAP</div>
      <div className="stat-value">{secsToMs(bestLap)}</div>
      <div className="stat-label">AVG PACE</div>
      <div className="stat-value">{secsToMs(avgPace)}</div>
      <div className="compounds-row">
        {compounds.join("  >  ")}
      </div>
    </div>
  );
}
