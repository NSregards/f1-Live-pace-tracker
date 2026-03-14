import type { Lap, Stint, RaceControl } from "./openf1";

export const TYRE_COLORS: Record<string, string> = {
  SOFT: "#FF3333",
  MEDIUM: "#FFD700",
  HARD: "#FFFFFF",
  INTERMEDIATE: "#39FF14",
  INTER: "#39FF14",
  WET: "#00BFFF",
  C1: "#FFFFFF", C2: "#FFFFFF", C3: "#FFD700",
  C4: "#FFD700", C5: "#FF3333", C6: "#FF3333",
  HARD_C1: "#FFFFFF", HARD_C2: "#FFFFFF", HARD_C3: "#FFFFFF",
  MEDIUM_C2: "#FFD700", MEDIUM_C3: "#FFD700", MEDIUM_C4: "#FFD700",
  SOFT_C4: "#FF3333", SOFT_C5: "#FF3333", SOFT_C6: "#FF3333",
  UNKNOWN: "#888888",
};

export const TYRE_SHORT: Record<string, string> = {
  SOFT: "S", MEDIUM: "M", HARD: "H",
  INTERMEDIATE: "I", INTER: "I", WET: "W",
  C1: "H", C2: "H", C3: "M",
  C4: "M", C5: "S", C6: "S",
  HARD_C1: "H", HARD_C2: "H", HARD_C3: "H",
  MEDIUM_C2: "M", MEDIUM_C3: "M", MEDIUM_C4: "M",
  SOFT_C4: "S", SOFT_C5: "S", SOFT_C6: "S",
  UNKNOWN: "?",
};

export const DRIVER_COLORS: Record<string, string> = {
  VER: "#0600EF", HAD: "#0600EF",
  LEC: "#DC0000", HAM: "#DC0000",
  RUS: "#00D2BE", ANT: "#00D2BE",
  NOR: "#FF8700", PIA: "#FF8700",
  ALO: "#006F62", STR: "#006F62",
  GAS: "#0090FF", COL: "#0090FF",
  ALB: "#005AFF", SAI: "#005AFF",
  OCO: "#B40000", BEA: "#B40000",
  HUL: "#BB0A30", BOR: "#BB0A30",
  BOT: "#003A8F", PER: "#003A8F",
  LAW: "#6692FF", LIN: "#6692FF",
};

export const FALLBACK_COLORS = [
  "#00D2FF", "#FF6B35", "#A8FF3E", "#FF3CAC",
  "#FFD700", "#C77DFF", "#00FF9C", "#FF4757",
];

export function secsToMs(s: number | null): string {
  if (s == null || isNaN(s)) return "N/A";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

// Handles null, undefined, "HARD", "HARD_C2", "C2", "hard_c2" etc.
function normaliseCompound(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const upper = raw.toUpperCase().trim();
  if (!upper) return "UNKNOWN";
  // Direct match
  if (TYRE_COLORS[upper] !== undefined) return upper;
  // Whitespace normalised
  const clean = upper.replace(/\s+/g, "_");
  if (TYRE_COLORS[clean] !== undefined) return clean;
  // Base type before underscore e.g. "HARD_C2" -> "HARD"
  const base = upper.split("_")[0];
  if (base && TYRE_COLORS[base] !== undefined) return base;
  // C-number part e.g. "HARD_C2" -> "C2"
  const cNum = upper.match(/C\d/)?.[0];
  if (cNum && TYRE_COLORS[cNum] !== undefined) return cNum;
  return "UNKNOWN";
}

export interface ProcessedLap {
  driver: string;
  driverNumber: number;
  lapNumber: number;
  lapTimeSeconds: number;
  lapTimeDisplay: string;
  compound: string;
  tyreLife: number;
  stint: number;
  isNeutralised: boolean;
  isSC: boolean;
  isVSC: boolean;
  rollingAvg: number;
  isAccurate: boolean;
}

export interface DriverSummary {
  driver: string;
  driverNumber: number;
  bestLap: number;
  avgPace: number;
  compounds: string[];
  color: string;
}

export function getRanges(lapSet: Set<number>): [number, number][] {
  if (lapSet.size === 0) return [];
  const sorted = Array.from(lapSet).sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== prev + 1) {
      ranges.push([start, prev]);
      start = sorted[i];
    }
    prev = sorted[i];
  }
  ranges.push([start, prev]);
  return ranges;
}

export function processRaceData(
  rawLaps: Lap[],
  stints: Stint[],
  raceControl: RaceControl[],
  drivers: { driver_number: number; name_acronym: string }[]
): {
  laps: ProcessedLap[];
  scLaps: Set<number>;
  vscLaps: Set<number>;
  driverMap: Record<number, string>;
} {
  const driverMap: Record<number, string> = {};
  for (const d of drivers) {
    driverMap[d.driver_number] = d.name_acronym;
  }

  const stintMap: Record<number, Stint[]> = {};
  for (const s of stints) {
    if (!stintMap[s.driver_number]) stintMap[s.driver_number] = [];
    stintMap[s.driver_number].push(s);
  }
  for (const k of Object.keys(stintMap)) {
    stintMap[Number(k)].sort((a, b) => a.lap_start - b.lap_start);
  }

  // ── SC / VSC detection ────────────────────────────────────────────────────
  const scLaps = new Set<number>();
  const vscLaps = new Set<number>();

  const rcSorted = Array.from(raceControl).sort(
    (a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0)
  );

  let scStart: number | null = null;
  let vscStart: number | null = null;

  for (const msg of rcSorted) {
    const lap = msg.lap_number ?? 0;
    if (!lap) continue;
    const flag = (msg.flag ?? "").toUpperCase().trim();
    const message = (msg.message ?? "").toUpperCase().trim();

    if (flag === "SAFETY_CAR" || message.includes("SAFETY CAR DEPLOYED")) {
      if (vscStart !== null) {
        for (let l = vscStart; l < lap; l++) vscLaps.add(l);
        vscStart = null;
      }
      if (scStart === null) scStart = lap;
    } else if (flag === "VIRTUAL_SAFETY_CAR" || message.includes("VIRTUAL SAFETY CAR DEPLOYED")) {
      if (vscStart === null && scStart === null) vscStart = lap;
    } else if (message.includes("SAFETY CAR IN THIS LAP") || message.includes("SAFETY CAR IN THE PIT LANE")) {
      if (scStart !== null) {
        for (let l = scStart; l <= lap; l++) scLaps.add(l);
        scStart = null;
      }
    } else if (message.includes("VIRTUAL SAFETY CAR ENDING") || message.includes("VIRTUAL SAFETY CAR ENDED")) {
      if (vscStart !== null) {
        for (let l = vscStart; l <= lap; l++) vscLaps.add(l);
        vscStart = null;
      }
    } else if (flag === "GREEN" || flag === "CLEAR" || message.includes("GREEN FLAG") || message.includes("TRACK CLEAR")) {
      if (scStart !== null) {
        for (let l = scStart; l <= lap; l++) scLaps.add(l);
        scStart = null;
      }
      if (vscStart !== null) {
        for (let l = vscStart; l <= lap; l++) vscLaps.add(l);
        vscStart = null;
      }
    }
  }

  const maxRcLap = rcSorted.length ? Math.max(...rcSorted.map((r) => r.lap_number ?? 0)) : 0;
  if (scStart !== null && maxRcLap > 0) {
    for (let l = scStart; l <= maxRcLap; l++) scLaps.add(l);
  }
  if (vscStart !== null && maxRcLap > 0) {
    for (let l = vscStart; l <= maxRcLap; l++) vscLaps.add(l);
  }
  for (const lap of Array.from(scLaps)) vscLaps.delete(lap);

  // ── Process laps ──────────────────────────────────────────────────────────
  const processed: ProcessedLap[] = [];

  for (const lap of rawLaps) {
    if (!lap.lap_duration || lap.lap_duration < 60) continue;
    const driver = driverMap[lap.driver_number] ?? `#${lap.driver_number}`;

    const driverStints = stintMap[lap.driver_number] ?? [];
    let currentStint = driverStints.find(
      (s) => lap.lap_number >= s.lap_start && lap.lap_number <= s.lap_end
    );
    if (!currentStint && driverStints.length > 0) {
      currentStint = driverStints[driverStints.length - 1];
    }

    // Use lap-level compound if stint compound is null
    const rawCompound = currentStint?.compound ?? null;
    const compound = normaliseCompound(rawCompound);

    const tyreLife = currentStint
      ? lap.lap_number - currentStint.lap_start + (currentStint.tyre_age_at_start ?? 0)
      : 0;
    const stintNum = currentStint?.stint_number ?? 1;
    const isSC = scLaps.has(lap.lap_number);
    const isVSC = vscLaps.has(lap.lap_number);

    processed.push({
      driver,
      driverNumber: lap.driver_number,
      lapNumber: lap.lap_number,
      lapTimeSeconds: lap.lap_duration,
      lapTimeDisplay: secsToMs(lap.lap_duration),
      compound,
      tyreLife,
      stint: stintNum,
      isNeutralised: isSC || isVSC,
      isSC,
      isVSC,
      rollingAvg: 0,
      isAccurate: !lap.is_pit_out_lap,
    });
  }

  processed.sort((a, b) => a.driver.localeCompare(b.driver) || a.lapNumber - b.lapNumber);

  const byDriver: Record<string, ProcessedLap[]> = {};
  for (const lap of processed) {
    if (!byDriver[lap.driver]) byDriver[lap.driver] = [];
    byDriver[lap.driver].push(lap);
  }

  for (const laps of Object.values(byDriver)) {
    laps.sort((a, b) => a.lapNumber - b.lapNumber);
    for (let i = 0; i < laps.length; i++) {
      const window = laps.slice(Math.max(0, i - 2), i + 1);
      laps[i].rollingAvg =
        window.reduce((s, l) => s + l.lapTimeSeconds, 0) / window.length;
    }
  }

  return { laps: processed, scLaps, vscLaps, driverMap };
}

export function getDriverSummaries(
  laps: ProcessedLap[],
  selectedDrivers: string[],
  colorMap: Record<string, string>
): DriverSummary[] {
  return selectedDrivers.map((driver) => {
    const driverLaps = laps.filter(
      (l) => l.driver === driver && !l.isNeutralised && l.isAccurate
    );
    const allLaps = laps.filter((l) => l.driver === driver);
    const times = driverLaps.map((l) => l.lapTimeSeconds);
    const compounds = Array.from(new Set(allLaps.map((l) => l.compound)));

    return {
      driver,
      driverNumber: allLaps[0]?.driverNumber ?? 0,
      bestLap: times.length ? Math.min(...times) : 0,
      avgPace: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      compounds,
      color: colorMap[driver] ?? "#888",
    };
  });
}