# Gaming Perks Shop - Database Schema Reference

## Overview
This document provides the exact database schema for all tables, enums, and types used in the Gaming Perks Shop application. **Always refer to this document before making database-related changes.**

---

## Tables

### 1. `profiles` (Users)
**Primary user/player information table**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | User ID (Supabase auth.users.id) |
| email | TEXT | UNIQUE, NOT NULL | User's email address |
| in_game_alias | TEXT | | Player's in-game name/alias |
| is_admin | BOOLEAN | DEFAULT false | Site administrator flag |
| is_media_manager | BOOLEAN | DEFAULT false | Media manager permissions |
| ctf_role | ctf_role_type | | CTF tournament role (enum) |
| registration_status | TEXT | DEFAULT 'pending' | User registration completion status |
| is_league_banned | BOOLEAN | DEFAULT false | League ban status |
| league_ban_reason | TEXT | | Reason for league ban |
| league_ban_date | TIMESTAMPTZ | | Date when ban was applied |
| avatar_url | TEXT | | User's profile picture URL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Account creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last profile update |
| is_zone_admin | BOOLEAN | DEFAULT false | Zone administrator flag |

### 2. `squads` (Teams)
**Squad/team information**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Squad ID |
| name | TEXT | NOT NULL | Squad name |
| tag | TEXT | NOT NULL | Squad tag/abbreviation |
| description | TEXT | | Squad description |
| discord_link | TEXT | | Squad Discord invite link |
| website_link | TEXT | | Squad website URL |
| captain_id | UUID | REFERENCES profiles(id) | Squad captain user ID |
| is_active | BOOLEAN | DEFAULT true | Squad active status |
| tournament_eligible | BOOLEAN | DEFAULT false | Tournament participation eligibility |
| banner_url | TEXT | | Squad banner/logo image URL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Squad creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last squad update |

### 3. `squad_members`
**Squad membership relationships**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Membership record ID |
| squad_id | UUID | REFERENCES squads(id) ON DELETE CASCADE | Squad reference |
| player_id | UUID | REFERENCES profiles(id) ON DELETE CASCADE | Player reference |
| role | TEXT | CHECK (role IN ('captain', 'co_captain', 'player')) | Member role |
| status | TEXT | DEFAULT 'active' | Membership status |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() | Join timestamp |

### 4. `free_agents`
**Available players for recruitment**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Free agent record ID |
| player_id | UUID | REFERENCES profiles(id) ON DELETE CASCADE | Player reference |
| preferred_roles | TEXT[] | DEFAULT '{}' | Array of preferred class roles |
| availability | TEXT | | Player's availability schedule |
| skill_level | TEXT | CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'expert')) | Player skill level |
| notes | TEXT | | Additional player notes |
| contact_info | TEXT | | Contact information |
| is_active | BOOLEAN | DEFAULT true | Active in free agent pool |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Entry creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

### 5. `products`
**Store products/items**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Product ID |
| name | TEXT | NOT NULL | Product name |
| description | TEXT | | Product description |
| price | INTEGER | NOT NULL | Price in cents |
| price_id | TEXT | NOT NULL | Stripe price ID |
| image | TEXT | | Product image URL |
| active | BOOLEAN | DEFAULT true | Product availability |
| phrase | VARCHAR(12) | CHECK phrase ~ '^[a-zA-Z0-9]*$' | Product code/phrase |
| customizable | BOOLEAN | DEFAULT false | Customization options available |
| kofi_direct_link_code | VARCHAR(50) | | Ko-fi integration code |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Product creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last product update |

### 6. `news`
**News/announcements system**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | News post ID |
| title | TEXT | NOT NULL | News headline |
| content | TEXT | NOT NULL | News content (HTML/markdown) |
| author_id | UUID | REFERENCES profiles(id) | Author user ID |
| published | BOOLEAN | DEFAULT false | Publication status |
| featured | BOOLEAN | DEFAULT false | Featured post flag |
| reactions | JSONB | DEFAULT '{}' | Post reactions data |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Post creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last post update |

### scheduled_zone_management
Stores scheduled zone management operations (start, stop, restart).

```sql
CREATE TABLE scheduled_zone_management (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_key VARCHAR(50) NOT NULL,
  zone_name VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('start', 'stop', 'restart')),
  scheduled_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_by_alias VARCHAR(100),
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'executed', 'failed', 'cancelled', 'expired')),
  execution_result TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Add indexes for performance
CREATE INDEX idx_scheduled_zone_management_zone_key ON scheduled_zone_management(zone_key);
CREATE INDEX idx_scheduled_zone_management_scheduled_datetime ON scheduled_zone_management(scheduled_datetime);
CREATE INDEX idx_scheduled_zone_management_status ON scheduled_zone_management(status);

-- Add RLS policies
ALTER TABLE scheduled_zone_management ENABLE ROW LEVEL SECURITY;

-- Policy: Zone admins can view all scheduled operations
CREATE POLICY "Zone admins can view scheduled operations" ON scheduled_zone_management
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.is_zone_admin = true)
    )
  );

-- Policy: Zone admins can create scheduled operations
CREATE POLICY "Zone admins can create scheduled operations" ON scheduled_zone_management
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.is_zone_admin = true)
    )
  );

-- Policy: Zone admins can update scheduled operations
CREATE POLICY "Zone admins can update scheduled operations" ON scheduled_zone_management
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.is_admin = true OR profiles.is_zone_admin = true)
    )
  );
```

### zone_interests
Stores player zone interest data (already exists, updated to use zone_key).

### scheduled_zone_events  
Stores scheduled zone events for community (already exists, updated to use zone_key).

---

## Enums

### `ctf_role_type`
**Valid CTF tournament roles**

```sql
CREATE TYPE ctf_role_type AS ENUM (
    'ctf_admin',
    'ctf_head_referee', 
    'ctf_referee',
    'ctf_recorder',
    'ctf_commentator'
);
```

**Role Hierarchy (by permission level):**
1. `ctf_admin` - Level 90 - Full CTF management
2. `ctf_head_referee` - Level 80 - Senior referee
3. `ctf_referee` - Level 70 - Standard referee  
4. `ctf_recorder` - Level 60 - Match recording
5. `ctf_commentator` - Level 50 - Commentary

---

## Important Schema Notes

### Permission System
- **Site Admins**: `profiles.is_admin = true` (highest permissions)
- **Media Managers**: `profiles.is_media_manager = true` (content management)
- **CTF Roles**: `profiles.ctf_role` (tournament-specific permissions)

### Common Mistakes to Avoid
1. ❌ **Don't use** `ctf_role = 'media_manager'` - media manager is a separate boolean field
2. ❌ **Don't use** `ctf_role = 'admin'` - site admin is `is_admin = true`
3. ❌ **Always check** enum values before using them in queries
4. ❌ **Remember** `player_id` vs `user_id` - newer tables use `player_id`

### Squad Photo Editing Permissions
**Who can edit squad photos:**
- Squad captains (`squad_members.role = 'captain'`)
- Squad co-captains (`squad_members.role = 'co_captain'`)
- Site admins (`profiles.is_admin = true`)
- CTF admins (`profiles.ctf_role = 'ctf_admin'`)
- Media managers (`profiles.is_media_manager = true`)

---

## Indexes

### Performance Indexes
```sql
-- Products
CREATE INDEX idx_products_phrase ON products(phrase) WHERE phrase IS NOT NULL;
CREATE INDEX idx_products_customizable ON products(customizable) WHERE customizable = true;

-- Free Agents
CREATE INDEX idx_free_agents_player_id ON free_agents(player_id);
CREATE INDEX idx_free_agents_is_active ON free_agents(is_active);
CREATE INDEX idx_free_agents_skill_level ON free_agents(skill_level);

-- Squads
CREATE INDEX idx_squads_tournament_eligible ON squads(tournament_eligible);
```

---

## Row Level Security (RLS) Policies

### Key Security Policies
- **Squad visibility**: Public can see active squads, members see their own squad
- **Profile access**: Users can view their own profile, admins see all
- **Free agents**: Public read access for active agents, self-management
- **Squad photo editing**: Enhanced permissions for admins/staff

---

## Data Relationships

### Squad Structure
```
profiles (captain) ---> squads
profiles (players) ---> squad_members ---> squads
profiles (free agents) ---> free_agents
```

### Permission Hierarchy
```
Site Admin (is_admin=true)
    └── Media Manager (is_media_manager=true)
    └── CTF Admin (ctf_role='ctf_admin')
        └── CTF Head Referee (ctf_role='ctf_head_referee')
            └── CTF Referee (ctf_role='ctf_referee')
                └── CTF Recorder (ctf_role='ctf_recorder')
                └── CTF Commentator (ctf_role='ctf_commentator')
```

---

## RPC Functions (Critical for Type Safety)

### Common Functions That Cause Type Mismatches

**IMPORTANT**: These RPC functions have been problematic due to return type mismatches. Consider using direct Supabase queries instead.

#### `get_squad_invitations_optimized`
- **Parameters**: `user_id UUID`
- **Return Type**: `TABLE` with squad invitation data
- **Issue**: Return structure doesn't match TypeScript interfaces
- **Solution**: Use direct query with proper joins

#### `get_free_agents_optimized`  
- **Parameters**: None or filtering parameters
- **Return Type**: `TABLE` with free agent data
- **Issue**: Return structure doesn't match TypeScript interfaces
- **Solution**: Use direct query with profile joins

#### `get_squad_members_optimized`
- **Parameters**: `squad_id UUID`
- **Return Type**: `TABLE` with squad member data  
- **Issue**: Return structure doesn't match TypeScript interfaces
- **Solution**: Use direct query with role filtering

### Type Safety Best Practices

1. **Avoid RPC functions** when possible - use direct Supabase queries
2. **Always validate return types** match your TypeScript interfaces
3. **Use the schema export tools** to generate accurate types
4. **Test function calls** in SQL Editor before using in code
5. **Document exact return structures** for any custom RPC functions

### Recommended Query Patterns

Instead of RPC functions, use these direct query patterns:

```typescript
// Instead of get_squad_invitations_optimized
const { data: invitations } = await supabase
  .from('squad_invites')
  .select(`
    *,
    squad:squads(id, name, tag, captain_id),
    invited_by_profile:profiles!invited_by(id, in_game_alias)
  `)
  .eq('player_id', userId)
  .eq('status', 'pending');

// Instead of get_free_agents_optimized  
const { data: freeAgents } = await supabase
  .from('free_agents')
  .select(`
    *,
    profile:profiles(id, in_game_alias, email)
  `)
  .eq('is_active', true);
```

---

## Schema Export Tools

### Getting Complete Schema Information

1. **Run `get-complete-schema.sql`** in Supabase SQL Editor
2. **Use `generate-typescript-interfaces.js`** to create TypeScript types
3. **Update `src/types/database.ts`** with generated interfaces
4. **Validate all RPC function return types** match interfaces

### Files Created for Schema Management
- `get-complete-schema.sql` - Comprehensive schema export
- `generate-typescript-interfaces.js` - Type generator script
- `DATABASE_SCHEMA_REFERENCE.md` - This reference document

---

## Migration Best Practices

1. **Always backup** before schema changes
2. **Test enum changes** in development first
3. **Update RLS policies** when adding new roles
4. **Check constraints** before adding new enum values
5. **Export schema after changes** using provided tools
6. **Update TypeScript types** after schema changes
7. **Update this document** after schema changes

---

## Common Queries

### Check User Permissions
```sql
SELECT 
  id, 
  in_game_alias, 
  is_admin, 
  is_media_manager, 
  ctf_role 
FROM profiles 
WHERE id = '[user_id]';
```

### Get Squad Members with Roles
```sql
SELECT 
  sm.role,
  p.in_game_alias,
  sm.joined_at
FROM squad_members sm
JOIN profiles p ON p.id = sm.player_id
WHERE sm.squad_id = '[squad_id]' 
AND sm.status = 'active';
```

### Active Free Agents by Skill Level
```sql
SELECT 
  p.in_game_alias,
  fa.skill_level,
  fa.preferred_roles
FROM free_agents fa
JOIN profiles p ON p.id = fa.player_id
WHERE fa.is_active = true
ORDER BY fa.created_at DESC;
```

---

## Version History
- **v1.0** - Initial schema documentation
- **Last Updated**: [Current Date]
- **Next Review**: Update after any schema changes

**⚠️ CRITICAL**: Always update this document when making database schema changes! 