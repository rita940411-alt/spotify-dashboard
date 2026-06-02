import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter
} from 'recharts';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const REGIONS = ['Global Top 50', 'Taiwan Top 50', 'USA Top 50', 'Japan Top 50', 'UK Top 50'];

const fmt = (n, d = 2) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(d);
};

const msToMin = (ms) => {
  if (!ms) return '—';
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
};

const formatTaipeiTime = (value) => {
  if (!value) return '—';

  const raw = String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');

  // 後端 PostgreSQL / Render 通常回傳 UTC，但字串可能沒有 Z。
  // 若沒有時區標記，補上 Z，讓瀏覽器先當成 UTC，再轉成台灣時間。
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

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
            {['Rank', 'Track', 'Artist', 'Popularity', 'Duration', 'Explicit'].map((h) => (
              <th key={h} className="px-4 py-3 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => (
            <tr
              key={`${t.region}-${t.track_id}-${i}`}
              className={`border-t border-zinc-800 hover:bg-zinc-800 transition-colors ${
                i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900'
              }`}
            >
              <td className="px-4 py-3 text-zinc-500 font-mono">{t.chart_rank ?? i + 1}</td>
              <td className="px-4 py-3">
                <a
                  href={t.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white hover:text-green-400 transition-colors font-medium"
                >
                  {t.track_name}
                </a>
              </td>
              <td className="px-4 py-3 text-zinc-300">{t.artist_name}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-zinc-700 rounded-full h-1.5">
                    <div
                      className="bg-green-400 h-1.5 rounded-full"
                      style={{ width: `${t.popularity || 0}%` }}
                    />
                  </div>
                  <span className="text-zinc-300">{t.popularity ?? '—'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-zinc-400 font-mono">{msToMin(t.duration_ms)}</td>
              <td className="px-4 py-3 text-zinc-300">{t.explicit ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PopularityDistribution({ data }) {
  if (!data.length) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Popularity Distribution</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="bucket" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <YAxis tick={{ fill: '#71717a', fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8
            }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Bar dataKey="count" fill="#1DB954" radius={[4, 4, 0, 0]} name="Track Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RegionComparison({ data }) {
  if (!data.length) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Regional Popularity Comparison</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="region"
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            tickFormatter={(r) => r.replace(' Top 50', '')}
          />
          <YAxis tick={{ fill: '#71717a', fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8
            }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="avg_popularity" fill="#1DB954" radius={[4, 4, 0, 0]} name="Avg Popularity" />
          <Bar dataKey="explicit_rate" fill="#FF6B6B" radius={[4, 4, 0, 0]} name="Explicit Rate (%)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopArtists({ data }) {
  if (!data.length) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Top Artists by Track Count</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis type="number" tick={{ fill: '#71717a', fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="artist"
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8
            }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Bar dataKey="count" fill="#4ECDC4" radius={[0, 4, 4, 0]} name="Track Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PopularityDurationScatter({ tracks }) {
  const data = tracks
    .filter((t) => t.popularity !== null && t.duration_ms !== null)
    .map((t) => ({
      name: t.track_name,
      popularity: t.popularity,
      duration_min: Number((t.duration_ms / 60000).toFixed(2))
    }));

  if (!data.length) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
      <h3 className="text-zinc-300 font-semibold mb-4">Popularity vs. Duration</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            type="number"
            dataKey="duration_min"
            name="Duration"
            unit=" min"
            tick={{ fill: '#71717a', fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="popularity"
            name="Popularity"
            domain={[0, 100]}
            tick={{ fill: '#71717a', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: 8
            }}
          />
          <Scatter name="Tracks" data={data} fill="#1DB954" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function buildPopularityDistribution(tracks) {
  const buckets = [
    { bucket: '90-100', count: 0 },
    { bucket: '80-89', count: 0 },
    { bucket: '70-79', count: 0 },
    { bucket: '60-69', count: 0 },
    { bucket: 'Below 60', count: 0 }
  ];

  tracks.forEach((t) => {
    const p = t.popularity ?? 0;
    if (p >= 90) buckets[0].count += 1;
    else if (p >= 80) buckets[1].count += 1;
    else if (p >= 70) buckets[2].count += 1;
    else if (p >= 60) buckets[3].count += 1;
    else buckets[4].count += 1;
  });

  return buckets;
}

function buildTopArtists(tracks) {
  const counts = {};

  tracks.forEach((t) => {
    const firstArtist = (t.artist_name || 'Unknown').split(',')[0].trim();
    counts[firstArtist] = (counts[firstArtist] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export default function App() {
  const [region, setRegion] = useState('Global Top 50');
  const [tracks, setTracks] = useState([]);
  const [allRegionSummary, setAllRegionSummary] = useState([]);
  const [etlStatus, setEtlStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');

  const fetchRegionSummary = async () => {
    const responses = await Promise.all(
      REGIONS.map((r) =>
        axios.get(`${API}/api/tracks?region=${encodeURIComponent(r)}`)
      )
    );

    return responses.map((res, idx) => {
      const rows = res.data || [];
      const avgPopularity = rows.length
        ? rows.reduce((sum, t) => sum + (t.popularity || 0), 0) / rows.length
        : 0;

      const explicitRate = rows.length
        ? (rows.filter((t) => t.explicit).length / rows.length) * 100
        : 0;

      return {
        region: REGIONS[idx],
        avg_popularity: Number(avgPopularity.toFixed(1)),
        explicit_rate: Number(explicitRate.toFixed(1))
      };
    });
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [trackRes, statusRes, regionSummary] = await Promise.all([
        axios.get(`${API}/api/tracks?region=${encodeURIComponent(region)}`),
        axios.get(`${API}/api/etl/status`),
        fetchRegionSummary()
      ]);

      setTracks(trackRes.data || []);
      setEtlStatus(statusRes.data || null);
      setAllRegionSummary(regionSummary);
    } catch (e) {
      console.error(e);
      setError('Failed to load data. Please check whether the backend API is running.');
    }

    setLoading(false);
  }, [region]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const triggerEtl = async () => {
    setTriggering(true);
    setError('');

    try {
      await axios.post(`${API}/api/etl/trigger`);
      await fetchAll();
    } catch (e) {
      console.error(e);
      setError('ETL trigger failed. Please check backend logs.');
    }

    setTriggering(false);
  };

  const avgPopularity = tracks.length
    ? tracks.reduce((sum, t) => sum + (t.popularity || 0), 0) / tracks.length
    : 0;

  const avgDuration = tracks.length
    ? tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / tracks.length
    : 0;

  const explicitRate = tracks.length
    ? (tracks.filter((t) => t.explicit).length / tracks.length) * 100
    : 0;

  const topTrack = tracks[0];
  const distribution = buildPopularityDistribution(tracks);
  const topArtists = buildTopArtists(tracks);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Spotify Popularity Dashboard</h1>
          <p className="text-xs text-zinc-500">
            Popularity-based music trend analytics powered by Spotify Web API
          </p>
        </div>

        <div className="flex items-center gap-4">
          {etlStatus && (
            <span className="text-xs text-zinc-500">
              Last sync: {formatTaipeiTime(etlStatus.run_at)}
              <span
                className={`ml-2 inline-block w-2 h-2 rounded-full ${
                  etlStatus.status === 'success' ? 'bg-green-400' : 'bg-red-400'
                }`}
              />
            </span>
          )}

          <button
            onClick={triggerEtl}
            disabled={triggering}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black text-xs font-bold px-4 py-2 rounded-full transition-colors"
          >
            {triggering ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="flex gap-2 flex-wrap">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                region === r
                  ? 'bg-green-500 text-black border-transparent'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-200 rounded-2xl p-4 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-zinc-500 animate-pulse text-lg">Loading data...</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Top Track"
                value={topTrack?.track_name?.split(' ').slice(0, 3).join(' ') || '—'}
                sub={topTrack?.artist_name}
              />
              <StatCard
                label="Avg Popularity"
                value={fmt(avgPopularity, 1)}
                sub="Spotify popularity score, 0-100"
              />
              <StatCard
                label="Avg Duration"
                value={msToMin(avgDuration)}
                sub="Average track length"
              />
              <StatCard
                label="Explicit Rate"
                value={`${fmt(explicitRate, 1)}%`}
                sub={`${tracks.length} tracks`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PopularityDistribution data={distribution} />
              <RegionComparison data={allRegionSummary} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TopArtists data={topArtists} />
              <PopularityDurationScatter tracks={tracks} />
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3 text-zinc-200">
                {region} — Popular Tracks
              </h2>
              <TrackTable tracks={tracks} />
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-zinc-600 text-xs py-6 border-t border-zinc-900 mt-8">
        Data from Spotify Web API. Backend ETL runs on startup and every hour.
      </footer>
    </div>
  );
}
