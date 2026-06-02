import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from sqlalchemy import text
from database import engine
from dotenv import load_dotenv
import os
from datetime import datetime

load_dotenv()

def get_spotify_client():
    auth_manager = SpotifyClientCredentials(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET")
    )
    return spotipy.Spotify(auth_manager=auth_manager)

# Global Top 50 playlist IDs by region
PLAYLISTS = {
    "Global Top 50":   "37i9dQZEVXbMDoHDwVN2tF",
    "Taiwan Top 50":   "37i9dQZEVXbMnZEatlMSiu",
    "USA Top 50":      "37i9dQZEVXbLRQDuF5jeBp",
    "Japan Top 50":    "37i9dQZEVXbKXQ4mDTEBXq",
    "UK Top 50":       "37i9dQZEVXbLnolsZ8PSNw",
}

def run_etl():
    sp = get_spotify_client()
    start_time = datetime.now()
    total_fetched = 0

    try:
        with engine.connect() as conn:
            for region, playlist_id in PLAYLISTS.items():
                try:
                    results = sp.playlist_tracks(playlist_id, limit=50)
                    tracks = results["items"]

                    track_ids = []
                    track_data = []

                    for i, item in enumerate(tracks):
                        track = item.get("track")
                        if not track or not track.get("id"):
                            continue

                        track_ids.append(track["id"])
                        track_data.append({
                            "track_id":    track["id"],
                            "track_name":  track["name"][:300],
                            "artist_name": ", ".join([a["name"] for a in track["artists"]])[:300],
                            "album_name":  track["album"]["name"][:300],
                            "popularity":  track["popularity"],
                            "duration_ms": track["duration_ms"],
                            "explicit":    track["explicit"],
                            "preview_url": track.get("preview_url"),
                            "external_url": track["external_urls"].get("spotify"),
                            "region":      region,
                            "chart_rank":  i + 1,
                        })

                    # Upsert tracks (add region + rank columns if first time)
                    conn.execute(text("""
                        ALTER TABLE tracks
                        ADD COLUMN IF NOT EXISTS region VARCHAR(100),
                        ADD COLUMN IF NOT EXISTS chart_rank INTEGER;
                    """))

                    for t in track_data:
                        conn.execute(text("""
                            INSERT INTO tracks
                                (track_id, track_name, artist_name, album_name,
                                 popularity, duration_ms, explicit,
                                 preview_url, external_url, region, chart_rank, fetched_at)
                            VALUES
                                (:track_id, :track_name, :artist_name, :album_name,
                                 :popularity, :duration_ms, :explicit,
                                 :preview_url, :external_url, :region, :chart_rank, NOW())
                            ON CONFLICT (track_id) DO UPDATE SET
                                popularity  = EXCLUDED.popularity,
                                chart_rank  = EXCLUDED.chart_rank,
                                region      = EXCLUDED.region,
                                fetched_at  = NOW();
                        """), t)

                    # Fetch audio features in batches of 50
                    if track_ids:
                        features = sp.audio_features(track_ids)
                        for f in features:
                            if not f:
                                continue
                            conn.execute(text("""
                                INSERT INTO audio_features
                                    (track_id, danceability, energy, valence, tempo,
                                     acousticness, instrumentalness, speechiness, loudness, fetched_at)
                                VALUES
                                    (:track_id, :danceability, :energy, :valence, :tempo,
                                     :acousticness, :instrumentalness, :speechiness, :loudness, NOW())
                                ON CONFLICT DO NOTHING;
                            """), {
                                "track_id":         f["id"],
                                "danceability":     f["danceability"],
                                "energy":           f["energy"],
                                "valence":          f["valence"],
                                "tempo":            f["tempo"],
                                "acousticness":     f["acousticness"],
                                "instrumentalness": f["instrumentalness"],
                                "speechiness":      f["speechiness"],
                                "loudness":         f["loudness"],
                            })

                    total_fetched += len(track_data)
                    print(f"✅ {region}: {len(track_data)} tracks")

                except Exception as e:
                    print(f"❌ {region} failed: {e}")

            # Log ETL run
            conn.execute(text("""
                INSERT INTO etl_logs (run_at, tracks_fetched, status, message)
                VALUES (NOW(), :fetched, 'success', :msg)
            """), {
                "fetched": total_fetched,
                "msg": f"ETL completed in {(datetime.now()-start_time).seconds}s"
            })
            conn.commit()

        print(f"🎵 ETL done — {total_fetched} tracks total")
        return {"status": "success", "tracks_fetched": total_fetched}

    except Exception as e:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO etl_logs (run_at, tracks_fetched, status, message)
                VALUES (NOW(), 0, 'error', :msg)
            """), {"msg": str(e)})
            conn.commit()
        print(f"❌ ETL error: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    run_etl()
