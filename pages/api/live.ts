import type { NextApiRequest, NextApiResponse } from "next";
import {
  getLaps,
  getStints,
  getDrivers,
  getRaceControl,
  getPitStops,
} from "../../lib/openf1";
import { processRaceData } from "../../lib/utils";

const BASE = "https://api.openf1.org/v1";

async function getCurrentSession() {
  // Get the latest session
  const res = await fetch(`${BASE}/sessions?session_key=latest`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const latest = data[0];
  if (!latest) return null;

  // If latest is already a Race, use it
  if (latest.session_name === "Race") return latest;

  // Otherwise look for a Race in the same meeting
  // (covers the case where Qualifying is latest but Race is upcoming today)
  const raceRes = await fetch(
    `${BASE}/sessions?meeting_key=${latest.meeting_key}&session_name=Race`,
    { headers: { Accept: "application/json" } }
  );
  if (!raceRes.ok) return null;
  const races = await raceRes.json();
  return races[0] ?? null;
}

async function getLatestLapNumber(sessionKey: number): Promise<number> {
  // Fetch just the most recent lap to get total lap count efficiently
  const res = await fetch(`${BASE}/laps?session_key=${sessionKey}&lap_number=latest`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  if (!data.length) return 0;
  return Math.max(...data.map((l: any) => l.lap_number ?? 0));
}

async function getLapsSince(sessionKey: number, afterLap: number) {
  if (afterLap === 0) {
    const res = await fetch(`${BASE}/laps?session_key=${sessionKey}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    return res.json();
  }
  // Fetch only laps newer than what we already have
  const res = await fetch(`${BASE}/laps?session_key=${sessionKey}&lap_number>=${afterLap}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  // after_lap = the last lap number the client already has (for incremental updates)
  const afterLap = Number(req.query.after_lap ?? 0);

  try {
    const session = await getCurrentSession();

    if (!session) {
      return res.status(404).json({ error: "No live session found. Check back during a race weekend." });
    }

    const sk = session.session_key;
    const now = new Date();
    const sessionStart = new Date(session.date_start);
    const sessionEnd = session.date_end ? new Date(session.date_end) : null;

    // Determine if this session is actually live right now
    const isLive = now >= sessionStart && (!sessionEnd || now <= sessionEnd);
    // Consider it "recently ended" if within 2 hours after end
    const isRecentlyEnded = sessionEnd
      ? now > sessionEnd && now.getTime() - sessionEnd.getTime() < 2 * 60 * 60 * 1000
      : false;

    if (!isLive && !isRecentlyEnded) {
      return res.status(404).json({
        error: "No active race session right now.",
        nextSession: {
          name: session.meeting_name,
          start: session.date_start,
        },
      });
    }

    // Fetch data — incremental if client has some laps already
    const [rawLaps, stints, drivers, raceControl, pitStops] = await Promise.all([
      getLapsSince(sk, afterLap > 0 ? afterLap : 0),
      getStints(sk),
      getDrivers(sk),
      getRaceControl(sk),
      getPitStops(sk),
    ]);

    const { laps, scLaps, vscLaps, driverMap } = processRaceData(
      rawLaps,
      stints,
      raceControl,
      drivers
    );

    const allDrivers = Array.from(new Set(laps.map((l) => l.driver))).sort();
    const latestLap = laps.length ? Math.max(...laps.map((l) => l.lapNumber)) : 0;

    // Never cache live data
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      laps,
      scLaps: Array.from(scLaps),
      vscLaps: Array.from(vscLaps),
      allDrivers,
      driverMap,
      pitStops,
      isLive,
      isRecentlyEnded,
      latestLap,
      session: {
        year: session.year,
        meetingName: session.meeting_name,
        circuitName: session.circuit_short_name,
        country: session.country_name,
        totalLaps: latestLap,
        sessionKey: sk,
      },
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message ?? "Failed to fetch live data" });
  }
}
