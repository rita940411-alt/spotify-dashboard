import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, Cell
} from 'recharts';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const REGIONS = ['Global Top 50', 'Taiwan Top 50', 'USA Top 50', 'Japan Top 50', 'UK Top 50'];
const COLORS  = ['#1DB954', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF'];

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : '—');
const msToMin = ms => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4 flex flex-col gap-1 border border-zinc-800">
      <span className="text-zinc-400 text-xs uppercase tracking-widest">{label}</span>
      <span className="text-2xl font-bold text-green-400">{value}</span>
      {sub && <span className="text-zinc-500 text-xs">{sub}</span>}
    </div>
  );
}

function TrackTable({ tracks }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-400 uppercase text-xs">
          <tr>
            {['#', 'Track', 'Artist', 'Popularity', 'Duration', 'Energy', 'Valence', 'Dance'].map(h => (
              <th key={h} className="px-4 py-3 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => (
            <tr key={t.track_id}
              className={`border-t border-zinc-800 hover:bg-zinc-800 transition-colors ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900'}`}>
              <td className="px-4 py-3 text-zinc-500 font-mono">{t.chart_rank ?? i + 1}</td>
              <td className="px-4 py-3">
                <a href={t.external_url} target="_blank" rel="noreferrer"
                  className="text-white hover:text-green-400 transition-colors font-medium">
                  {t.track_name}
                </a>
              </td>
              <td className="px-4 py-3 text-zinc-300">{t.artist_name}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-zinc-700 rounded-full h-1.5">
                    <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${t.popularity}%` }} />
                  </div>
                  <span className="text-zinc-300">{t.popularity}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-zinc-400 font-mono">{msToMin(t.duration_ms)}</td>
              <td className="px-4 py-3 text-zinc-300">{fmt(t.energy)}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  t.valence > 0.6 ? 'bg-yellow-900 text-yellow-300' :
                  t.valence > 0.4 ? 'bg-zinc-700 text-zinc-300' :
                                    'bg-blue-900 text-blue-300'}`}>
                  {t.valence > 0.6 ? '😊' : t.valence > 0.4 ? '😐' : '😔'} {fmt(t.valence)}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-300">{fmt(t.danceability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AudioRadar({ data, region }) {
  if (!data || !data.danceability) return null;
  const radarData = [
    { feature: 'Danceability', value: data.danceability },
    { feature: 'Energy',       value: data.energy },
    { feature: 'Valence',      value: data.valence },
    { feature: 'Acousticness', value: data.acousticness },
    { feature: 'Speechiness',  value: data.speechiness },
    { feature: 'Instrumental', value: data.instrumentalness },
  ];
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Audio DNA — {region}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#3f3f46" />
          <PolarAngleAxis dataKey="feature" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 1]} tick={{ fill: '#71717a', fontSize: 10 }} />
          <Radar dataKey="value" stroke="#1DB954" fill="#1DB954" fillOpacity={0.35} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div><span className="text-zinc-500">Avg Tempo</span><br /><span className="text-green-400 font-bold">{fmt(data.avg_tempo, 0)} BPM</span></div>
        <div><span className="text-zinc-500">Tracks</span><br /><span className="text-green-400 font-bold">{data.track_count}</span></div>
        <div><span className="text-zinc-500">Mood</span><br />
          <span className="text-green-400 font-bold">
            {data.valence > 0.6 ? 'Happy 😊' : data.valence > 0.4 ? 'Neutral 😐' : 'Melancholic 😔'}
          </span>
        </div>
      </div>
    </div>
  );
}

function RegionCompare({ data }) {
  if (!data?.length) return null;
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Region Comparison — Energy & Danceability</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="region" tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickFormatter={r => r.replace(' Top 50', '')} />
          <YAxis domain={[0, 1]} tick={{ fill: '#71717a', fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#e4e4e7' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
          <Bar dataKey="energy"       fill="#1DB954" radius={[4, 4, 0, 0]} name="Energy" />
          <Bar dataKey="danceability" fill="#FF6B6B" radius={[4, 4, 0, 0]} name="Danceability" />
          <Bar dataKey="valence"      fill="#FFE66D" radius={[4, 4, 0, 0]} name="Valence" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [region, setRegion]       = useState('Global Top 50');
  const [tracks, setTracks]       = useState([]);
  const [features, setFeatures]   = useState({});
  const [compare, setCompare]     = useState([]);
  const [etlStatus, setEtlStatus] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t, f, c, s] = await Promise.all([
        axios.get(`${API}/api/tracks?region=${encodeURIComponent(region)}`),
        axios.get(`${API}/api/features/summary?region=${encodeURIComponent(region)}`),
        axios.get(`${API}/api/features/compare`),
        axios.get(`${API}/api/etl/status`),
      ]);
      setTracks(t.data);
      setFeatures(f.data);
      setCompare(c.data);
      setEtlStatus(s.data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [region]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const triggerEtl = async () => {
    setTriggering(true);
    await axios.post(`${API}/api/etl/trigger`);
    await fetchAll();
    setTriggering(false);
  };

  const top1 = tracks[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎵</span>
          <div>
            <h1 className="text-xl font-bold text-white">Spotify Global Dashboard</h1>
            <p className="text-xs text-zinc-500">Real-time music trend analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {etlStatus && (
            <span className="text-xs text-zinc-500">
              Last sync: {new Date(etlStatus.run_at).toLocaleTimeString()}
              <span className={`ml-2 inline-block w-2 h-2 rounded-full ${etlStatus.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
            </span>
          )}
          <button onClick={triggerEtl} disabled={triggering}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black text-xs font-bold px-4 py-2 rounded-full transition-colors">
            {triggering ? '⏳ Syncing…' : '🔄 Sync Now'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Region selector */}
        <div className="flex gap-2 flex-wrap">
          {REGIONS.map((r, i) => (
            <button key={r} onClick={() => setRegion(r)}
              style={region === r ? { backgroundColor: COLORS[i], color: '#000' } : {}}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border
                ${region === r ? 'border-transparent' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>
              {r}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-zinc-500 animate-pulse text-lg">Loading data…</div>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Top Track" value={top1?.track_name?.split(' ').slice(0,3).join(' ') ?? '—'} sub={top1?.artist_name} />
              <StatCard label="Avg Energy" value={fmt(features.energy)} sub="0 = calm · 1 = intense" />
              <StatCard label="Avg Valence" value={fmt(features.valence)} sub="0 = sad · 1 = happy" />
              <StatCard label="Avg Tempo" value={`${fmt(features.avg_tempo, 0)} BPM`} sub={`${features.track_count} tracks`} />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AudioRadar data={features} region={region} />
              <RegionCompare data={compare} />
            </div>

            {/* Track table */}
            <div>
              <h2 className="text-lg font-semibold mb-3 text-zinc-200">📊 {region} — Top Tracks</h2>
              <TrackTable tracks={tracks} />
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-zinc-600 text-xs py-6 border-t border-zinc-900 mt-8">
        Data from Spotify Web API · Auto-refreshes every hour · Built with FastAPI + React
      </footer>
    </div>
  );
}
