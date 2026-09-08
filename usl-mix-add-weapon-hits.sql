-- USL Mix: per-weapon shots fired / landed per player-game (zone script v1.7.0, 2026-09-08).
-- {"1004": {"name": "LAW", "fired": 12, "landed": 5}, ...}. The totals (shots_fired / shots_landed)
-- were already stored; this keeps the per-weapon split so hits can be ranked per weapon and a
-- damage estimate can be derived later from the item file's inner damage values.
-- Ingest works without this column (it drops the map and logs a warning) until it exists.

ALTER TABLE usl_mix_game_players
    ADD COLUMN IF NOT EXISTS weapon_hits JSONB NOT NULL DEFAULT '{}';
