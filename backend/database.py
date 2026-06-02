from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS tracks (
                id SERIAL PRIMARY KEY,
                track_id VARCHAR(100) UNIQUE NOT NULL,
                track_name VARCHAR(300) NOT NULL,
                artist_name VARCHAR(300) NOT NULL,
                album_name VARCHAR(300),
                popularity INTEGER,
                duration_ms INTEGER,
                explicit BOOLEAN,
                preview_url TEXT,
                external_url TEXT,
                fetched_at TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audio_features (
                id SERIAL PRIMARY KEY,
                track_id VARCHAR(100) REFERENCES tracks(track_id) ON DELETE CASCADE,
                danceability FLOAT,
                energy FLOAT,
                valence FLOAT,
                tempo FLOAT,
                acousticness FLOAT,
                instrumentalness FLOAT,
                speechiness FLOAT,
                loudness FLOAT,
                fetched_at TIMESTAMP DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS etl_logs (
                id SERIAL PRIMARY KEY,
                run_at TIMESTAMP DEFAULT NOW(),
                tracks_fetched INTEGER,
                status VARCHAR(50),
                message TEXT
            );
        """))
        conn.commit()
    print("✅ Database initialized")
