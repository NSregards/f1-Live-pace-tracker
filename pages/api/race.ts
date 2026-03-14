import type { NextApiRequest, NextApiResponse } from "next";
import { getLaps, getStints, getDrivers, getRaceControl, getPitStops } from "../../lib/openf1";
import { processRaceData } from "../../lib/utils";

const BASE = "https://api.openf1.org/v1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const { session_key } = req.query;
  if (!session_key) return res.status(400).json({ error: "session_key is required" });

  const sk = Number(session_key);
  if (isNaN(sk)) return res.status(400).json({ error: "session_key must be a number" });

  try {
    // Fetch session info + all race data in parallel
    const sessionRes = await fetch(`${BASE}/sessions?session_key=${sk}`, { headers: { Accept: "application/json" } }).then((r) => r.json());
const rawLaps = await getLaps(sk);
const stints = await getStints(sk);
const drivers = await getDrivers(sk);
const raceControl = await getRaceControl(sk);
const pitStops = await getPitStops(sk);

    const session = Array.isArray(sessionRes) ? sessionRes[0] : sessionRes;
    if (!session) return res.status(404).json({ error: "Session not found" });

    const { laps, scLaps, vscLaps, driverMap } = processRaceData(rawLaps, stints, raceControl, drivers);
    const allDrivers = Array.from(new Set(laps.map((l) => l.driver))).sort();

    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({
      laps,
      scLaps: Array.from(scLaps),
      vscLaps: Array.from(vscLaps),
      allDrivers,
      driverMap,
      pitStops,
      session: {
        year: session.year,
        meetingName: session.meeting_name ?? session.circuit_short_name,
        circuitName: session.circuit_short_name,
        country: session.country_name,
        totalLaps: Math.max(...laps.map((l) => l.lapNumber), 0),
        sessionKey: sk,
      },
    });
  } catch (err: any) {
    console.error("Race API error:", err);
    return res.status(500).json({ error: err.message ?? "Failed to load race data" });
  }
}

export const config = { api: { responseLimit: "8mb" } };