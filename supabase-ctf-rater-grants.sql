-- ============================================================================
-- CTF Community Ratings - rater access
--
-- Deliberately a standalone grant table rather than a new profiles.ctf_role
-- enum value. ctf_role is a Postgres enum: adding a value is effectively
-- permanent (removing one means recreating the type and rewriting every
-- dependent column), and it would put "Rater" in the same dropdown as Head
-- Referee, which reads as a staff title. A grant is neither of those things -
-- it is a permission to vote, and the whole table can be dropped when the
-- page opens to everyone.
--
-- Site admins and CTF admins qualify automatically; they need no row here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctf_rater_grants (
    user_id     uuid PRIMARY KEY,
    granted_by  uuid,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_rater_grants_created
    ON ctf_rater_grants (created_at DESC);

-- Flat public read so the page can tell a visitor whether they hold a grant.
-- All writes go through the admin API on the service role, which bypasses RLS.
ALTER TABLE ctf_rater_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctf_rater_grants_public_read" ON ctf_rater_grants;
CREATE POLICY "ctf_rater_grants_public_read" ON ctf_rater_grants
    FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- When you later open the page to everyone, you do NOT need to drop anything:
-- flip CTF_RATINGS_PUBLIC_VIEW in src/lib/ctfRatings/access.ts to true. That
-- opens viewing while voting stays with raters. Dropping this table entirely
-- would open voting to every signed-in account, which is a separate decision.
-- ----------------------------------------------------------------------------
