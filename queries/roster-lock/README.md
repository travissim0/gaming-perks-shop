# Roster lock

- **season_roster_locks** (see `roster-lock.sql`): Used for **CTFPL** only. Already applied if roster lock works for CTFPL.
- **league_season_roster_locks**: Used for **other leagues** (CTFDL, OVDL, etc.).

To enable roster lock for non-CTFPL leagues, run **`league_season_roster_locks.sql`** in the Supabase SQL Editor (after `leagues` and `league_seasons` exist). Then the admin Roster Lock Management page can lock/unlock seasons for any league.
