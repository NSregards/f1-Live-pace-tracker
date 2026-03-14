const BASE = "https://api.openf1.org/v1";

export interface Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  date_start: string;
  meeting_key: number;
  session_key: number;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean;
  segments_sector_1?: number[];
  segments_sector_2?: number[];
  segments_sector_3?: number[];
}

export interface Stint {
  meeting_key: number;
  session_key: number;
  stint_number: number;
  driver_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
}

export interface PitStop {
  meeting_key: number;
  session_key: number;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  date: string;
}

export interface Driver {
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  headshot_url: string;
  session_key: number;
  meeting_key: number;
}

export interface Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  session_type: string;
  meeting_name: string;
  year: number;
  circuit_short_name: string;
  country_name: string;
  location: string;
}

export interface RaceControl {
  meeting_key: number;
  session_key: number;
  date: string;
  lap_number: number | null;
  category: string;
  flag: string | null;
  scope: string | null;
  message: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenF1 ${path} → ${res.status}`);
  return res.json();
}

export async function getSessions(year: number): Promise<Session[]> {
  return get<Session[]>(`/sessions?year=${year}&session_name=Race`);
}

export async function getSession(year: number, meetingName: string): Promise<Session | null> {
  const sessions = await get<Session[]>(
    `/sessions?year=${year}&session_name=Race&meeting_name=${encodeURIComponent(meetingName)}`
  );
  return sessions[0] ?? null;
}

export async function getLaps(sessionKey: number): Promise<Lap[]> {
  return get<Lap[]>(`/laps?session_key=${sessionKey}`);
}

export async function getStints(sessionKey: number): Promise<Stint[]> {
  return get<Stint[]>(`/stints?session_key=${sessionKey}`);
}

export async function getPitStops(sessionKey: number): Promise<PitStop[]> {
  return get<PitStop[]>(`/pit?session_key=${sessionKey}`);
}

export async function getDrivers(sessionKey: number): Promise<Driver[]> {
  return get<Driver[]>(`/drivers?session_key=${sessionKey}`);
}

export async function getRaceControl(sessionKey: number): Promise<RaceControl[]> {
  return get<RaceControl[]>(`/race_control?session_key=${sessionKey}`);
}
