-- BZ Agent — baseline schema
-- Run automatically by Docker on first container start.
-- Add new tables here; they are applied once to a fresh volume.

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Token usage ───────────────────────────────────────────────────────────────
-- Persists what is currently kept only in-memory (_token_stats).
CREATE TABLE IF NOT EXISTS token_usage (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL DEFAULT '',
    cwd         TEXT        NOT NULL DEFAULT '',
    input_tokens  INTEGER   NOT NULL DEFAULT 0,
    output_tokens INTEGER   NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_recorded_at ON token_usage (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_cwd         ON token_usage (cwd);

-- ── Key-value store ───────────────────────────────────────────────────────────
-- General-purpose store for future use (settings, flags, etc.)
CREATE TABLE IF NOT EXISTS kv_store (
    key         TEXT        PRIMARY KEY,
    value       JSONB       NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
