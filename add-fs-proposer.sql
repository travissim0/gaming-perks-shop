-- FS home alternation (John, 2026-10-28): home (squad_a, picks the side) is the proposer for the
-- first FS meeting between two squads in a colour, and flips to whoever was away last time on a
-- rematch. So squad_a is no longer always the proposer; this column records who proposed, which is
-- what accept/decline/cancel rights key on.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS fs_proposer_squad_id uuid REFERENCES squads(id);

-- Every FS fixture so far was proposed by its home squad.
UPDATE matches SET fs_proposer_squad_id = squad_a_id
WHERE stage = 'fs' AND fs_proposer_squad_id IS NULL AND squad_a_id IS NOT NULL;
