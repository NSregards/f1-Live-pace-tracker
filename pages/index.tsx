import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";
import DriverCard from "../components/DriverCard";
import { DRIVER_COLORS, FALLBACK_COLORS, getDriverSummaries } from "../lib/utils";
import type { ProcessedLap } from "../lib/utils";

const LapChart = dynamic(() => import("../components/LapChart"), { ssr: false });

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2022 }, (_, i) => currentYear - i);
const LIVE_POLL_INTERVAL = 15000;

interface RaceData {
  laps: ProcessedLap[];
  scLaps: number[];
  vscLaps: number[];
  allDrivers: string[];
  pitStops: any[];
  isLive?: boolean;
  isRecentlyEnded?: boolean;
  latestLap?: number;
  session: {
    year: number;
    meetingName: string;
    circuitName: string;
    country: string;
    totalLaps: number;
    sessionKey?: number;
  };
}

interface RaceMeta {
  meetingKey: number;
  meetingName: string;
  circuitShortName: string;
  country: string;
  sessionKey: number;
}

export default function Home() {
  const [year, setYear] = useState(2025);
  const [races, setRaces] = useState<RaceMeta[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [error, setError] = useState("");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const [newLapFlash, setNewLapFlash] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const latestLapRef = useRef(0);

  // Fetch races when year changes
  useEffect(() => {
    if (isLiveMode) return;
    setLoadingRaces(true);
    setRaces([]);
    setSelectedSessionKey(null);
    setRaceData(null);
    setError("");
    fetch(`/api/sessions?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        const list: RaceMeta[] = d.races ?? [];
        setRaces(list);
        if (list.length) setSelectedSessionKey(list[0].sessionKey);
      })
      .catch(() => setError("Failed to load race list from OpenF1"))
      .finally(() => setLoadingRaces(false));
  }, [year, isLiveMode]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function loadRace() {
    if (!selectedSessionKey) return;
    setLoading(true);
    setError("");
    setRaceData(null);
    setSelectedDrivers([]);
    setIsLiveMode(false);
    stopPolling();
    try {
      const res = await fetch(`/api/race?session_key=${selectedSessionKey}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load race");
      setRaceData(data);
      setSelectedDrivers(data.allDrivers.slice(0, 4));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const pollLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/live?after_lap=${latestLapRef.current}`);
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404) { stopPolling(); setIsLiveMode(false); setError(data.error ?? "Live session ended."); }
        return;
      }
      setLastPollTime(new Date());
      if (data.laps?.length) {
        const newLatest = data.latestLap ?? 0;
        if (newLatest > latestLapRef.current) {
          setNewLapFlash(true);
          setTimeout(() => setNewLapFlash(false), 800);
          latestLapRef.current = newLatest;
        }
        setRaceData((prev) => {
          if (!prev) return data;
          const existingKeys = new Set(prev.laps.map((l) => `${l.driver}-${l.lapNumber}`));
          const newLaps = data.laps.filter((l: ProcessedLap) => !existingKeys.has(`${l.driver}-${l.lapNumber}`));
          if (!newLaps.length) return prev;
          return { ...data, laps: [...prev.laps, ...newLaps], scLaps: data.scLaps, vscLaps: data.vscLaps, pitStops: data.pitStops };
        });
      }
      if (data.isRecentlyEnded && !data.isLive) {
        stopPolling();
        setRaceData((prev) => prev ? { ...prev, isLive: false, isRecentlyEnded: true } : prev);
      }
    } catch (e) {
      console.warn("Live poll error:", e);
    }
  }, []);

  async function goLive() {
    setLiveConnecting(true);
    setError("");
    setRaceData(null);
    setSelectedDrivers([]);
    stopPolling();
    latestLapRef.current = 0;
    try {
      const res = await fetch("/api/live?after_lap=0");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "No live session right now."); setLiveConnecting(false); return; }
      setIsLiveMode(true);
      setRaceData(data);
      setSelectedDrivers(data.allDrivers.slice(0, 4));
      latestLapRef.current = data.latestLap ?? 0;
      setLastPollTime(new Date());
      pollRef.current = setInterval(pollLive, LIVE_POLL_INTERVAL);
    } catch (e: any) {
      setError(e.message ?? "Failed to connect to live feed.");
    } finally {
      setLiveConnecting(false);
    }
  }

  function exitLive() {
    stopPolling();
    setIsLiveMode(false);
    setRaceData(null);
    setSelectedDrivers([]);
    setError("");
    latestLapRef.current = 0;
  }

  const colorMap = useMemo(() => {
    if (!raceData) return {};
    const map: Record<string, string> = {};
    raceData.allDrivers.forEach((d, i) => { map[d] = DRIVER_COLORS[d] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]; });
    return map;
  }, [raceData]);

  const driverSummaries = useMemo(() => {
    if (!raceData) return [];
    return getDriverSummaries(raceData.laps, selectedDrivers, colorMap);
  }, [raceData, selectedDrivers, colorMap]);

  function toggleDriver(driver: string) {
    setSelectedDrivers((prev) =>
      prev.includes(driver) ? prev.filter((d) => d !== driver) : prev.length < 6 ? [...prev, driver] : prev
    );
  }

  const selectedRace = races.find((r) => r.sessionKey === selectedSessionKey);
  const isActuallyLive = raceData?.isLive && isLiveMode;
  const justEnded = raceData?.isRecentlyEnded && !raceData?.isLive;

  return (
    <>
      <Head>
        <title>F1 Pace Tracker</title>
        <meta name="description" content="Lap-by-lap F1 tyre performance analysis" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Barlow+Condensed:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* Top bar */}
        <div className="top-bar">
          <div>
            <div className="top-bar-title">F1 <span className="red">PACE</span> TRACKER</div>
            <div className="top-bar-sub">Lap-by-lap tyre performance analysis</div>
          </div>
          <div className="top-bar-right">
            {isActuallyLive && (
              <div className="live-badge">
                <span className="live-dot" />
                LIVE
                {lastPollTime && (
                  <span className="live-sub">updated {lastPollTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                )}
              </div>
            )}
            {justEnded && <div className="ended-badge">SESSION ENDED</div>}
            {isLiveMode ? (
              <button className="exit-live-btn" onClick={exitLive}>EXIT LIVE</button>
            ) : (
              <button className="go-live-btn" onClick={goLive} disabled={liveConnecting}>
                {liveConnecting ? (
                  <span className="loading-dots"><span /><span /><span /></span>
                ) : (
                  <><span className="go-live-dot" />GO LIVE</>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="red-line" />

        {/* Historical controls */}
        {!isLiveMode && (
          <div className="controls-row">
            <div className="control-group">
              <label className="control-label">SEASON</label>
              <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">GRAND PRIX</label>
              <select
                className="select"
                value={selectedSessionKey ?? ""}
                onChange={(e) => setSelectedSessionKey(Number(e.target.value))}
                disabled={loadingRaces}
              >
                {loadingRaces && <option value="">Loading...</option>}
                {!loadingRaces && races.length === 0 && <option value="">No races found</option>}
                {races.map((r) => (
                  <option key={r.sessionKey} value={r.sessionKey}>
                    {r.circuitShortName} — {r.country}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group drivers-group">
              <label className="control-label">
                DRIVERS {raceData ? `(${selectedDrivers.length}/6 selected)` : ""}
              </label>
              {raceData ? (
                <div className="driver-pills">
                  {raceData.allDrivers.map((d) => (
                    <button
                      key={d}
                      className={`driver-pill ${selectedDrivers.includes(d) ? "active" : ""}`}
                      style={selectedDrivers.includes(d) ? { borderColor: colorMap[d], color: colorMap[d], background: `${colorMap[d]}18` } : {}}
                      onClick={() => toggleDriver(d)}
                    >{d}</button>
                  ))}
                </div>
              ) : (
                <div className="control-placeholder">Load race data first</div>
              )}
            </div>

            <div className="control-group">
              <button className="load-btn" onClick={loadRace} disabled={loading || !selectedSessionKey}>
                {loading ? <span className="loading-dots"><span /><span /><span /></span> : "LOAD RACE"}
              </button>
            </div>
          </div>
        )}

        {/* Live mode controls */}
        {isLiveMode && raceData && (
          <div className="controls-row live-controls">
            <div className="live-session-info">
              <span className="live-session-name">{raceData.session.meetingName.toUpperCase()}</span>
              <span className="live-session-year">{raceData.session.year}</span>
              {raceData.session.totalLaps > 0 && (
                <span className="live-lap-count">LAP {raceData.session.totalLaps}</span>
              )}
            </div>
            <div className="control-group drivers-group">
              <label className="control-label">DRIVERS ({selectedDrivers.length}/6)</label>
              <div className="driver-pills">
                {raceData.allDrivers.map((d) => (
                  <button
                    key={d}
                    className={`driver-pill ${selectedDrivers.includes(d) ? "active" : ""}`}
                    style={selectedDrivers.includes(d) ? { borderColor: colorMap[d], color: colorMap[d], background: `${colorMap[d]}18` } : {}}
                    onClick={() => toggleDriver(d)}
                  >{d}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <div className="info-box error-box">{error}</div>}

        {!raceData && !loading && !liveConnecting && !error && (
          <div className="info-box">
            Select a season and grand prix, then click <strong>LOAD RACE</strong> — or click <strong>GO LIVE</strong> to follow the current race in real time.
          </div>
        )}

        {(loading || liveConnecting) && (
          <div className="info-box loading-box">
            <div className="loading-spinner" />
            {liveConnecting ? "Connecting to live timing feed..." : "Fetching race data from OpenF1..."}
          </div>
        )}

        {newLapFlash && <div className="new-lap-flash">NEW LAP DATA</div>}

        {raceData && selectedDrivers.length > 0 && !loading && !liveConnecting && (
          <>
            <LapChart
              laps={raceData.laps}
              selectedDrivers={selectedDrivers}
              colorMap={colorMap}
              scLaps={raceData.scLaps}
              vscLaps={raceData.vscLaps}
              pitStops={raceData.pitStops}
              session={raceData.session}
            />
            <div className="legend-bar">
              <div className="legend-item"><div className="ldot" style={{ background: "rgba(255,215,0,0.6)" }} />SAFETY CAR</div>
              <div className="legend-item"><div className="ldot" style={{ background: "rgba(255,140,0,0.6)" }} />VIRTUAL SC</div>
              <div className="legend-sep">|</div>
              <div className="legend-item"><div className="ldot" style={{ background: "#FF3333" }} />SOFT</div>
              <div className="legend-item"><div className="ldot" style={{ background: "#FFD700" }} />MEDIUM</div>
              <div className="legend-item"><div className="ldot" style={{ background: "#FFFFFF" }} />HARD</div>
              <div className="legend-item"><div className="ldot" style={{ background: "#39FF14" }} />INTER</div>
              <div className="legend-item"><div className="ldot" style={{ background: "#00BFFF" }} />WET</div>
              {isActuallyLive && (
                <><div className="legend-sep">|</div>
                <div className="legend-item live-legend"><span className="live-dot-sm" />UPDATING EVERY 15S</div></>
              )}
            </div>
            <div className="section-label">Driver Summary</div>
            <div className="driver-cards-grid">
              {driverSummaries.map((s) => <DriverCard key={s.driver} summary={s} />)}
            </div>
          </>
        )}

        {raceData && selectedDrivers.length === 0 && !loading && (
          <div className="info-box">Select drivers above to view pace data.</div>
        )}
      </div>

      <style jsx global>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #080808; color: #e8e8e8; font-family: 'JetBrains Mono', monospace; min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0f0f0f; } ::-webkit-scrollbar-thumb { background: #1e1e1e; }
      `}</style>

      <style jsx>{`
        .app { padding: 2rem 2.5rem; max-width: 100%; }
        .top-bar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e1e1e; padding-bottom: 16px; }
        .top-bar-title { font-family: 'Barlow Condensed', sans-serif; font-size: 32px; font-weight: 900; letter-spacing: 0.12em; color: #fff; text-transform: uppercase; }
        .red { color: #e10600; }
        .top-bar-sub { font-size: 10px; letter-spacing: 0.25em; color: #777; text-transform: uppercase; margin-top: 3px; }
        .top-bar-right { display: flex; align-items: center; gap: 12px; }
        .go-live-btn { background: #e10600; color: #fff; border: none; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 14px; cursor: pointer; transition: background 0.1s; display: flex; align-items: center; gap: 7px; height: 32px; }
        .go-live-btn:hover { background: #c00500; }
        .go-live-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .go-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: livepulse 1.2s ease-in-out infinite; flex-shrink: 0; }
        .exit-live-btn { background: transparent; color: #555; border: 1px solid #333; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; padding: 6px 14px; cursor: pointer; transition: all 0.1s; height: 32px; }
        .exit-live-btn:hover { border-color: #555; color: #888; }
        .live-badge { display: flex; align-items: center; gap: 8px; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; color: #e10600; }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #e10600; animation: livepulse 1.2s ease-in-out infinite; }
        .live-sub { font-size: 9px; color: #444; letter-spacing: 0.1em; font-family: 'JetBrains Mono', monospace; font-weight: 400; }
        .ended-badge { font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; color: #555; border: 1px solid #333; padding: 4px 10px; }
        @keyframes livepulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .red-line { height: 4px; background: linear-gradient(90deg, #e10600, transparent); margin-bottom: 20px; }
        .controls-row { display: grid; grid-template-columns: 120px 1fr 2fr 140px; gap: 12px; align-items: start; margin-bottom: 20px; background: #0f0f0f; border: 1px solid #1e1e1e; padding: 16px 20px; }
        .live-controls { grid-template-columns: auto 1fr; align-items: center; }
        .live-session-info { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .live-session-name { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 800; letter-spacing: 0.1em; color: #fff; }
        .live-session-year { font-size: 11px; color: #555; letter-spacing: 0.1em; }
        .live-lap-count { font-size: 10px; letter-spacing: 0.2em; color: #e10600; padding: 2px 8px; border: 1px solid #3a0000; background: #1a0000; }
        .control-group { display: flex; flex-direction: column; gap: 6px; }
        .control-label { font-size: 9px; letter-spacing: 0.25em; color: #555; text-transform: uppercase; }
        .select { background: #111; border: 1px solid #252525; color: #e8e8e8; font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 8px 10px; outline: none; appearance: none; cursor: pointer; width: 100%; }
        .select:focus { border-color: #e10600; }
        .select:disabled { opacity: 0.4; }
        .drivers-group { min-width: 0; }
        .driver-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .driver-pill { background: #111; border: 1px solid #252525; color: #555; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; padding: 4px 10px; cursor: pointer; transition: all 0.1s; }
        .driver-pill:hover { border-color: #444; color: #aaa; }
        .driver-pill.active { font-weight: 700; }
        .control-placeholder { font-size: 11px; color: #333; padding: 8px 0; border-bottom: 1px solid #1e1e1e; }
        .load-btn { background: #e10600; color: #fff; border: none; font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; padding: 0 28px; width: 100%; height: 40px; cursor: pointer; transition: background 0.1s; margin-top: 15px; display: flex; align-items: center; justify-content: center; }
        .load-btn:hover { background: #c00500; }
        .load-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .loading-dots { display: flex; gap: 4px; align-items: center; }
        .loading-dots span { width: 5px; height: 5px; background: #fff; border-radius: 50%; animation: pulse 1s infinite; }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        .info-box { background: #0f0f0f; border: 1px solid #1e1e1e; border-left: 2px solid #e10600; padding: 16px 20px; font-size: 12px; color: #555; letter-spacing: 0.05em; margin-bottom: 20px; }
        .error-box { border-left-color: #ff4444; color: #ff6666; }
        .loading-box { display: flex; align-items: center; gap: 12px; color: #444; }
        .loading-spinner { width: 14px; height: 14px; border: 1px solid #333; border-top-color: #e10600; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .new-lap-flash { position: fixed; top: 20px; right: 20px; background: #e10600; color: #fff; font-family: 'Barlow Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.2em; padding: 6px 12px; animation: fadeflash 0.8s ease-out forwards; z-index: 100; }
        @keyframes fadeflash { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-8px); } }
        .legend-bar { display: flex; gap: 20px; flex-wrap: wrap; font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-top: 10px; padding: 10px 0; border-top: 1px solid #161616; align-items: center; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .ldot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .legend-sep { color: #222; }
        .live-legend { color: #e10600; }
        .live-dot-sm { width: 6px; height: 6px; border-radius: 50%; background: #e10600; animation: livepulse 1.2s ease-in-out infinite; flex-shrink: 0; }
        .section-label { font-family: 'Barlow Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: #777; margin: 20px 0 10px; padding-bottom: 8px; border-bottom: 1px solid #161616; display: flex; align-items: center; gap: 10px; }
        .section-label::before { content: ''; display: inline-block; width: 3px; height: 14px; background: #e10600; }
        .driver-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        :global(.driver-card) { background: #0d0d0d; border: 1px solid #1a1a1a; border-top: 2px solid; padding: 16px; font-family: 'JetBrains Mono', monospace; }
        :global(.driver-name) { font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 12px; }
        :global(.stat-label) { font-size: 8px; letter-spacing: 0.3em; text-transform: uppercase; color: #666; margin-bottom: 1px; }
        :global(.stat-value) { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 10px; letter-spacing: 0.04em; }
        :global(.compounds-row) { font-size: 9px; letter-spacing: 0.15em; color: #666; margin-top: 8px; padding-top: 10px; border-top: 1px solid #161616; text-transform: uppercase; }
        @media (max-width: 768px) {
          .app { padding: 1rem; }
          .controls-row { grid-template-columns: 1fr 1fr; }
          .drivers-group { grid-column: 1 / -1; }
          .load-btn { grid-column: 1 / -1; }
          .live-controls { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}