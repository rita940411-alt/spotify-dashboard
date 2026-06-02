from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from database import engine, init_db
from etl import run_etl
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
import atexit

load_dotenv()

app = FastAPI(title="Spotify Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Scheduler: run ETL every hour ──────────────────────────────────────────
scheduler = BackgroundScheduler()
scheduler.add_job(run_etl, "interval", hours=1, id="etl_job")
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

@app.on_event("startup")
def startup():
    init_db()
    run_etl()   # run once on start

# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "message": "Spotify Dashboard API"}

# ── Top Tracks ───────────────────────────────────────────────────────────────
@app.get("/api/tracks")
def get_tracks(region: str = Query(default="Global Top 50"), limit: int = 50):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT t.track_id, t.track_name, t.artist_name, t.album_name,
                   t.popularity, t.chart_rank, t.explicit, t.external_url,
                   t.duration_ms, t.fetched_at,
                   af.danceability, af.energy, af.valence, af.tempo
            FROM tracks t
            LEFT JOIN audio_features af ON t.track_id = af.track_id
            WHERE t.region = :region
            ORDER BY t.chart_rank ASC
            LIMIT :limit
        """), {"region": region, "limit": limit}).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Regions list ─────────────────────────────────────────────────────────────
@app.get("/api/regions")
def get_regions():
    return ["Global Top 50", "Taiwan Top 50", "USA Top 50", "Japan Top 50", "UK Top 50"]

# ── Audio Feature Averages (for radar/bar chart) ─────────────────────────────
@app.get("/api/features/summary")
def features_summary(region: str = Query(default="Global Top 50")):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
                ROUND(AVG(af.danceability)::numeric, 3)     AS danceability,
                ROUND(AVG(af.energy)::numeric, 3)           AS energy,
                ROUND(AVG(af.valence)::numeric, 3)          AS valence,
                ROUND(AVG(af.acousticness)::numeric, 3)     AS acousticness,
                ROUND(AVG(af.instrumentalness)::numeric, 3) AS instrumentalness,
                ROUND(AVG(af.speechiness)::numeric, 3)      AS speechiness,
                ROUND(AVG(af.tempo)::numeric, 1)            AS avg_tempo,
                COUNT(*)                                    AS track_count
            FROM tracks t
            JOIN audio_features af ON t.track_id = af.track_id
            WHERE t.region = :region
        """), {"region": region}).fetchone()
    return dict(row._mapping) if row else {}

# ── Cross-region comparison ───────────────────────────────────────────────────
@app.get("/api/features/compare")
def features_compare():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT t.region,
                   ROUND(AVG(af.danceability)::numeric, 3) AS danceability,
                   ROUND(AVG(af.energy)::numeric, 3)       AS energy,
                   ROUND(AVG(af.valence)::numeric, 3)      AS valence,
                   ROUND(AVG(af.acousticness)::numeric, 3) AS acousticness,
                   ROUND(AVG(af.tempo)::numeric, 1)        AS avg_tempo
            FROM tracks t
            JOIN audio_features af ON t.track_id = af.track_id
            GROUP BY t.region
            ORDER BY t.region
        """)).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Popularity distribution ───────────────────────────────────────────────────
@app.get("/api/popularity/distribution")
def popularity_dist(region: str = Query(default="Global Top 50")):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                CASE
                    WHEN popularity >= 90 THEN '90-100'
                    WHEN popularity >= 80 THEN '80-89'
                    WHEN popularity >= 70 THEN '70-79'
                    WHEN popularity >= 60 THEN '60-69'
                    ELSE 'Below 60'
                END AS bucket,
                COUNT(*) AS count
            FROM tracks
            WHERE region = :region
            GROUP BY bucket ORDER BY bucket DESC
        """), {"region": region}).fetchall()
    return [dict(r._mapping) for r in rows]

# ── ETL status & logs ─────────────────────────────────────────────────────────
@app.get("/api/etl/status")
def etl_status():
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT run_at, tracks_fetched, status, message
            FROM etl_logs ORDER BY run_at DESC LIMIT 1
        """)).fetchone()
    return dict(row._mapping) if row else {"status": "no runs yet"}

@app.post("/api/etl/trigger")
def trigger_etl():
    result = run_etl()
    return result
