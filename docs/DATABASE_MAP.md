# Database & API Map

Reference for which tables and API routes belong to which system. Use this when building new features to avoid cross-wiring data between game modes.

---

## Naming Conventions (for new features)

### Tables
| System | Prefix | Examples |
|--------|--------|----------|
| CTF (leagues, squads, dueling, free agents) | `ctf_` / `dueling_` / `ctfpl_` | `ctf_squads`, `dueling_matches`, `ctfpl_seasons` |
| USL (BO9 series) | `usl_` (new) / `dueling_bo9_` (legacy) | `dueling_bo9_series`, `dueling_bo9_rounds` |
| Triple Threat (3v3) | `tt_` | `tt_teams`, `tt_matches` |
| Shared / Platform | no prefix | `profiles`, `private_messages` |
| Community | `forum_` / `news_` | `forum_threads`, `news_posts` |
| Zones | `zone_` | `zone_status`, `zone_population_history` |

> **Note:** Regular 1v1 dueling (`dueling_` tables) is part of the CTF ecosystem. BO9 dueling (`dueling_bo9_` tables) belongs to USL, a completely separate system. Don't mix them up.

### API Routes
| System | Route Prefix | Examples |
|--------|-------------|----------|
| CTF (new endpoints) | `/api/ctf/` | `/api/ctf/free-agents`, `/api/ctf/roster-lock` |
| CTF Dueling (legacy) | `/api/dueling/` | `/api/dueling/matches`, `/api/dueling/stats` |
| USL | `/api/usl/` | `/api/usl/bo9-stats` |
| Triple Threat | `/api/triple-threat/` | `/api/triple-threat/stats`, `/api/triple-threat/series-analysis` |
| Shared / Platform | `/api/` | `/api/avatars`, `/api/player-stats` |

### Page Routes
| System | Route Prefix | Examples |
|--------|-------------|----------|
| CTF | `/league/` | `/league/standings`, `/league/match-reports` |
| CTF Dueling | `/dueling/` | `/dueling` |
| USL | `/usl/` or `/dueling/bo9-stats` (legacy) | `/dueling/bo9-stats` |
| Triple Threat | `/triple-threat/` | `/triple-threat/teams`, `/triple-threat/matches` |
| Shared | `/` | `/profile`, `/dashboard`, `/donate` |

---

## Legacy CTF Endpoints (not yet migrated)

These existing CTF routes use generic paths. They still work and should NOT be moved unless you're already rebuilding that feature. New CTF endpoints should use `/api/ctf/`.

| Current Route | Would Be | Notes |
|--------------|----------|-------|
| `/api/free-agents/update` | `/api/ctf/free-agents/update` | Free agent update API |
| `/api/match-reports/` | `/api/ctf/match-reports/` | Match report CRUD |
| `/api/match-reports/[id]/comments/` | `/api/ctf/match-reports/[id]/comments/` | Match report comments |
| `/api/match-reports/[id]/player-ratings/` | `/api/ctf/match-reports/[id]/player-ratings/` | Player rating submissions |
| `/api/squad-ratings/` | `/api/ctf/squad-ratings/` | Squad rating system |
| `/api/roster-lock-status/` | `/api/ctf/roster-lock-status/` | Roster lock checks |
| `/api/dueling/` | `/api/ctf/dueling/` | Dueling API (part of CTF) |
| `/free-agents` | `/league/free-agents` | Free agents page |
| `/squads/` | `/league/squads/` | Squad management pages |
| `/champions` | `/league/champions` | Hall of Champions |
| `/dueling/bo9-stats` | `/usl/bo9-stats` | BO9 stats page (USL, not CTF) |

---

## CTF League Tables

Tables used by the CTF league system (CTFPL, CTFDL, OVDL, etc.). Includes squad management, match reports, free agents, and season management.

### Already prefixed (`ctfpl_`)
| Table | Purpose |
|-------|---------|
| `ctfpl_seasons` | Season definitions and configuration |
| `ctfpl_matches` | League match records |
| `ctfpl_standings` | Team standings per season |
| `ctfpl_standings_with_rankings` | Cached standings with rank calculations |

### Already prefixed (`league_`)
| Table | Purpose |
|-------|---------|
| `leagues` | League definitions (CTFPL, CTFDL, OVDL, etc.) |
| `league_seasons` | Multi-league season management |
| `league_season_roster_locks` | Per-league roster lock windows |
| `league_standings_with_rankings` | Multi-league standings view |

### CTF-only but NO prefix (legacy names)
These are CTF-specific but use generic names. Do NOT reuse these names for other game modes. New CTF tables should use the `ctf_` prefix.

**Migration approach:** Use `ALTER TABLE x RENAME TO ctf_x` + create a backward-compat view on the old name. Update code at your own pace, then drop the view.

#### Island tables (safe to rename independently)
| Table | New Name | Depends On | Code Refs |
|-------|----------|------------|-----------|
| `free_agents` | `ctf_free_agents` | `profiles` only | ~16 files |
| `season_roster_locks` | `ctf_roster_locks` | `ctfpl_seasons` only | ~3 files |
| `referee_applications` | `ctf_referee_applications` | `profiles` only | ~4 files |

#### Squad cluster (must migrate together)
| Table | New Name | Why Coupled |
|-------|----------|-------------|
| `squads` | `ctf_squads` | Referenced by squad_members, squad_invites, squad_ratings, match_reports (~68 refs) |
| `squad_members` | `ctf_squad_members` | FK to squads (~54 refs) |
| `squad_invites` | `ctf_squad_invites` | FK to squads (~31 refs) |
| `squad_ratings` | `ctf_squad_ratings` | FK to squads, cascades to player_ratings (~6 refs) |
| `player_ratings` | `ctf_player_ratings` | FK to squad_ratings (~3 refs) |

#### Match report cluster (own tree, weak link to squads)
| Table | New Name | Why Coupled |
|-------|----------|-------------|
| `match_reports` | `ctf_match_reports` | squad refs are ON DELETE SET NULL (~5 refs) |
| `match_participants` | `ctf_match_participants` | FK to match_reports (~11 refs) |
| `match_player_ratings` | `ctf_match_player_ratings` | FK to match_reports, CASCADE (~3 refs) |
| `match_report_comments` | `ctf_match_report_comments` | FK to match_reports, CASCADE (~3 refs) |

#### Already has "ctf" in name
| Table | Purpose |
|-------|---------|
| `user_ctf_roles` | CTF role assignments (admin, ref) |
| `ctf_roles` | Available CTF role types |

---

## CTF Dueling Tables (1v1)

These are part of the CTF ecosystem — the 1v1 arena dueling that lives under the CTF section of the site. All prefixed with `dueling_`.

| Table | Purpose |
|-------|---------|
| `dueling_matches` | Duel match records |
| `dueling_rounds` | Individual round results |
| `dueling_player_stats` | Aggregated player duel statistics |
| `dueling_leaderboard` | Ranked duel leaderboard |
| `dueling_kills` | Kill records from duels |
| `recent_dueling_matches` | View/cache of recent matches |

> **Important:** These `dueling_` tables are CTF. Do NOT confuse with `dueling_bo9_` tables which belong to USL (see below).

---

## USL Tables (BO9 Series)

USL is a **separate system from CTF**. The BO9 (Best-of-9) dueling format belongs here. Legacy tables use `dueling_bo9_` prefix; new USL tables should use `usl_`.

| Table | Purpose | Notes |
|-------|---------|-------|
| `dueling_bo9_series` | Best-of-9 series tracking | Legacy name — would be `usl_bo9_series` today |
| `dueling_bo9_rounds` | Individual BO9 round results | Legacy name — would be `usl_bo9_rounds` today |

---

## Triple Threat Tables (3v3)

All properly prefixed with `tt_`. These are for the 3v3 Triple Threat game mode.

| Table | Purpose |
|-------|---------|
| `tt_teams` | Triple Threat team records |
| `tt_team_members` | TT team membership |
| `tt_matches` | TT match records |
| `tt_player_stats` | Per-player TT statistics |
| `tt_player_records` | Overall player records |
| `tt_challenges` | Challenge tracking between teams |
| `tt_tournaments` | TT tournament data |
| `tt_match_schedule_proposals` | Match scheduling proposals |

---

## Shared / Platform Tables

Used across all game modes. These should NEVER be prefixed with a game mode.

| Table | Purpose | Used By |
|-------|---------|---------|
| `profiles` | User accounts, aliases, avatars | Everything |
| `profile_aliases` | Alternative player names | Stats, profiles |
| `private_messages` | Direct messaging | Messaging system |
| `user_blocks` | User blocking | Messaging system |
| `donation_transactions` | Ko-fi / donation records | Donations, perks |
| `products` | Shop products/perks | Perks shop |
| `user_products` | User purchases | Perks shop |
| `expenses` | Financial expense tracking | Admin financials |
| `admin_logs` | Admin action audit trail | Admin panels |
| `avatars` | Avatar image storage | Profile system |
| `builds` | Game client builds | Downloads page |
| `featured_videos` | Featured video management | Home page |

---

## Stats Tables

Player statistics that may span multiple game modes.

| Table | Purpose | Notes |
|-------|---------|-------|
| `player_stats` | Raw game stats from server | Shared across modes |
| `player_stats_normalized_by_mode` | Stats split by game mode | Shared |
| `player_stats_normalized_by_mode_all_aliases` | Stats with alias consolidation | Shared |
| `elo_leaderboard_agg_with_aliases` | ELO rankings | Shared |
| `player_events` | Player activity log | Shared |

---

## Tournament Tables

Generic tournament system (could be used by any game mode).

| Table | Purpose | Notes |
|-------|---------|-------|
| `tournaments` | Tournament definitions | Currently CTF-only in practice |
| `tournament_participants` | Tournament registrations | Currently CTF-only in practice |
| `tournament_matches` | Tournament match records | Currently CTF-only in practice |

---

## Community Tables

### Forum (prefixed `forum_`)
| Table | Purpose |
|-------|---------|
| `forum_categories` | Forum section organization |
| `forum_threads` | Discussion threads |
| `forum_posts` | Individual posts |
| `forum_subscriptions` | Thread subscription tracking |
| `forum_user_preferences` | User forum settings |
| `forum_rules` | Moderation rules |

### News (prefixed `news_`)
| Table | Purpose |
|-------|---------|
| `news_posts` | News/announcement posts |
| `news_post_reactions` | Reactions to news |
| `news_post_reads` | Read tracking |

---

## Zone System Tables

Zone explorer and activity tracking. All prefixed with `zone_` or `scheduled_zone_`.

| Table | Purpose |
|-------|---------|
| `zone_categories` | Zone category grouping |
| `zone_commands` | Zone command definitions |
| `zone_interests` | User interest tracking |
| `zone_media` | Zone media/streaming content |
| `zone_name_mappings` | Zone name aliases |
| `zone_notification_subscriptions` | Notification preferences |
| `zone_population_history` | Historical player counts |
| `zone_status` | Current zone occupancy |
| `scheduled_zone_events` | Scheduled zone activities |
| `scheduled_zone_management` | Zone scheduling admin |

---

## Quick Reference: "Which prefix do I use?"

Building something for...
- **CTF leagues (squads, matches, seasons, free agents)** -> table: `ctf_`, API: `/api/ctf/`, page: `/league/`
- **CTF 1v1 dueling (leaderboard, matches, stats)** -> table: `dueling_`, API: `/api/dueling/`, page: `/dueling/`
- **USL / BO9 series** -> table: `usl_` (new) / `dueling_bo9_` (legacy), API: `/api/usl/`, page: `/usl/`
- **3v3 Triple Threat** -> table: `tt_`, API: `/api/triple-threat/`, page: `/triple-threat/`
- **User accounts, messaging, donations** -> no prefix, API: `/api/`, page: `/`
- **Forum / news** -> table: `forum_` / `news_`, page: `/forum/` / `/news/`
- **Zone system** -> table: `zone_`, API: `/api/zone-*/`, page: `/zones/`
- **A new game mode** -> pick a short prefix and be consistent (e.g., `koth_` for King of the Hill)

> **⚠ Common mistake:** Regular dueling (`dueling_`) is CTF. BO9 dueling (`dueling_bo9_`) is USL. They are separate systems.
