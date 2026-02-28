# Database Table Map

Reference for which tables belong to which system. Use this when building new features to avoid cross-wiring data between game modes.

---

## Naming Convention for New Tables

| System | Prefix | Examples |
|--------|--------|----------|
| CTF (any league: CTFPL, CTFDL, OVDL, etc.) | `ctf_` | `ctf_squads`, `ctf_free_agents` |
| Dueling (1v1) | `dueling_` | `dueling_matches`, `dueling_leaderboard` |
| Triple Threat (3v3) | `tt_` | `tt_teams`, `tt_matches` |
| Shared / Platform | no prefix | `profiles`, `private_messages` |
| Community | `forum_` / `news_` | `forum_threads`, `news_posts` |
| Zones | `zone_` | `zone_status`, `zone_population_history` |

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

| Table | Purpose | Notes |
|-------|---------|-------|
| `squads` | CTF squad/team records | Would be `ctf_squads` if created today |
| `squad_members` | Squad roster membership | Would be `ctf_squad_members` |
| `squad_invites` | Squad invitation system | Would be `ctf_squad_invites` |
| `squad_ratings` | Squad performance ratings by analysts | Would be `ctf_squad_ratings` |
| `free_agents` | Players looking for squads | Would be `ctf_free_agents` |
| `match_reports` | Detailed post-match reports | Would be `ctf_match_reports` |
| `match_participants` | Players in a match report | Would be `ctf_match_participants` |
| `match_player_ratings` | Per-player performance ratings | Would be `ctf_match_player_ratings` |
| `match_report_comments` | Comments on match reports | Would be `ctf_match_report_comments` |
| `player_ratings` | Player skill ratings | Would be `ctf_player_ratings` |
| `season_roster_locks` | Roster lock periods | Would be `ctf_roster_locks` |
| `referee_applications` | Referee role applications | Would be `ctf_referee_applications` |
| `user_ctf_roles` | CTF role assignments (admin, ref) | Already has "ctf" in name |
| `ctf_roles` | Available CTF role types | Already has "ctf" in name |

---

## Dueling Tables (1v1)

All properly prefixed with `dueling_`. These are for the 1v1 arena dueling system.

| Table | Purpose |
|-------|---------|
| `dueling_matches` | Duel match records |
| `dueling_rounds` | Individual round results |
| `dueling_player_stats` | Aggregated player duel statistics |
| `dueling_leaderboard` | Ranked duel leaderboard |
| `dueling_kills` | Kill records from duels |
| `recent_dueling_matches` | View/cache of recent matches |

### BO9 Series (NOT CTF - standalone dueling format)
| Table | Purpose |
|-------|---------|
| `dueling_bo9_series` | Best-of-9 series tracking |
| `dueling_bo9_rounds` | Individual BO9 round results |

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
- **CTF leagues (squads, matches, seasons, free agents)** -> `ctf_`
- **1v1 dueling** -> `dueling_`
- **3v3 Triple Threat** -> `tt_`
- **User accounts, messaging, donations** -> no prefix
- **Forum / news** -> `forum_` / `news_`
- **Zone system** -> `zone_`
- **A new game mode** -> pick a short prefix and be consistent (e.g., `koth_` for King of the Hill)
