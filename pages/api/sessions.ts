import type { NextApiRequest, NextApiResponse } from "next";

const BASE = "https://api.openf1.org/v1";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: "year required" });

  try {
    const response = await fetch(
      `${BASE}/sessions?year=${year}&session_name=Race`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) throw new Error(`OpenF1 returned ${response.status}`);

    const sessions = await response.json();

    const races = sessions
      .map((s: any) => ({
        meetingKey: s.meeting_key,
        meetingName: s.meeting_name,
        circuitShortName: s.circuit_short_name,
        country: s.country_name,
        dateStart: s.date_start,
        sessionKey: s.session_key,
      }))
      .sort((a: any, b: any) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate");
    return res.status(200).json({ races });
  } catch (err: any) {
    console.error("Sessions API error:", err);
    return res.status(500).json({ error: err.message ?? "Failed to load sessions" });
  }
}