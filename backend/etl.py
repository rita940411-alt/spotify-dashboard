import os
from datetime import datetime

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from sqlalchemy import text
from dotenv import load_dotenv

from database import engine

load_dotenv()


def get_spotify_client():
    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise RuntimeError("SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not set.")

    auth_manager = SpotifyClientCredentials(
        client_id=client_id,
        client_secret=client_secret
    )
    return spotipy.Spotify(auth_manager=auth_manager)


# This version avoids Spotify-owned editorial playlists and audio_features.
# It uses Spotify Search API and ranks tracks by Spotify's popularity score.
SEARCH_CONFIGS = {
    "Global Top 50": {
        "market": "US",
        "queries": ["year:2025", "year:2026", "pop"]
    },
    "Taiwan Top 50": {
        "market": "TW",
        "queries": ["華語", "mandopop", "台灣", "year:2025"]
    },
    "USA Top 50": {
        "market": "US",
        "queries": ["year:2025 pop", "year:2025 hip hop", "year:2025"]
    },
    "Japan Top 50": {
        "market": "JP",
        "queries": ["j-pop", "anime", "year:2025"]
    },
    "UK Top 50": {
        "market": "GB",
        "queries": ["uk pop", "british pop", "year:2025"]
    },
}


def normalize_track(track, region):
    artists = track.get("artists") or []
    album = track.get("album") or {}
    external_urls = track.get("external_urls") or {}

    spotify_track_id = track.get("id")

    return {
        # Add region prefix to avoid duplicate-key conflicts when the same song appears in multiple regions.
        "track_id": f"{region}:{spotify_track_id}",
        "track_name": (track.get("name") or "")[:300],
        "artist_name": ", ".join([a.get("name", "") for a in artists])[:300],
        "album_name": (album.get("name") or "")[:300],
        "popularity": track.get("popularity"),
        "duration_ms": track.get("duration_ms"),
        "explicit": track.get("explicit", False),
        "preview_url": track.get("preview_url"),
        "external_url": external_urls.get("spotify"),
        "region": region,
    }


def fetch_region_tracks(sp, region, config, target_n=50):
    market = config["market"]
    queries = config["queries"]

    collected = {}
    errors = []

    for query in queries:
        try:
            results = sp.search(
                q=query,
                type="track",
                market=market,
                limit=50
            )

            items = results.get("tracks", {}).get("items", [])

            for track in items:
                spotify_track_id = track.get("id")
                if not spotify_track_id:
                    continue

                if spotify_track_id not in collected:
                    collected[spotify_track_id] = normalize_track(track, region)

        except Exception as e:
            errors.append(f"{query}: {str(e)}")
            print(f"[WARN] Search failed for {region}, query={query}: {e}")

    tracks = list(collected.values())

    # Rank by Spotify popularity score.
    tracks = sorted(
        tracks,
        key=lambda x: x["popularity"] if x["popularity"] is not None else -1,
        reverse=True
    )

    tracks = tracks[:target_n]

    for i, track in enumerate(tracks, start=1):
        track["chart_rank"] = i

    return tracks, errors


def run_etl():
    sp = get_spotify_client()
    start_time = datetime.now()
    total_fetched = 0
    all_errors = []

    try:
        with engine.begin() as conn:
            conn.execute(text("""
                ALTER TABLE tracks
                ADD COLUMN IF NOT EXISTS region VARCHAR(100);
            """))

            conn.execute(text("""
                ALTER TABLE tracks
                ADD COLUMN IF NOT EXISTS chart_rank INTEGER;
            """))

            # Keep only the latest snapshot.
            # This makes the dashboard display current refreshed data.
            conn.execute(text("DELETE FROM tracks;"))

            for region, config in SEARCH_CONFIGS.items():
                tracks, errors = fetch_region_tracks(sp, region, config)

                all_errors.extend([f"{region} - {err}" for err in errors])

                for t in tracks:
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
                            track_name = EXCLUDED.track_name,
                            artist_name = EXCLUDED.artist_name,
                            album_name = EXCLUDED.album_name,
                            popularity = EXCLUDED.popularity,
                            duration_ms = EXCLUDED.duration_ms,
                            explicit = EXCLUDED.explicit,
                            preview_url = EXCLUDED.preview_url,
                            external_url = EXCLUDED.external_url,
                            region = EXCLUDED.region,
                            chart_rank = EXCLUDED.chart_rank,
                            fetched_at = NOW();
                    """), t)

                total_fetched += len(tracks)
                print(f"[OK] {region}: {len(tracks)} tracks")

            if total_fetched > 0:
                status = "success"
                message = f"ETL completed in {(datetime.now() - start_time).seconds}s"
            else:
                status = "warning"
                message = "ETL completed but fetched 0 tracks. Check Spotify API credentials or API restrictions."

            if all_errors:
                message += " | Warnings: " + " ; ".join(all_errors[:5])

            conn.execute(text("""
                INSERT INTO etl_logs (run_at, tracks_fetched, status, message)
                VALUES (NOW(), :fetched, :status, :msg)
            """), {
                "fetched": total_fetched,
                "status": status,
                "msg": message
            })

        print(f"[DONE] ETL finished. tracks_fetched={total_fetched}")
        return {
            "status": status,
            "tracks_fetched": total_fetched,
            "message": message
        }

    except Exception as e:
        error_message = str(e)

        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO etl_logs (run_at, tracks_fetched, status, message)
                VALUES (NOW(), 0, 'error', :msg)
            """), {"msg": error_message})

        print(f"[ERROR] ETL failed: {error_message}")
        return {
            "status": "error",
            "tracks_fetched": 0,
            "message": error_message
        }


if __name__ == "__main__":
    run_etl()
