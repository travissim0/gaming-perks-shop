 -- Create seasons table to track seasonal winners
  CREATE TABLE ctfpl_seasons (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      season_number INTEGER NOT NULL UNIQUE,
      season_name VARCHAR(100), -- e.g., "2024 Spring Championship"
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN
  ('upcoming', 'active', 'completed')),

      -- Winner tracking (allows for ties)
      champion_squad_ids UUID[] DEFAULT '{}', -- Array of squad IDs for 1st place (golden flag)
      runner_up_squad_ids UUID[] DEFAULT '{}', -- Array of squad IDs for 2nd place (silver flag)
      third_place_squad_ids UUID[] DEFAULT '{}', -- Array of squad IDs for 3rd place (bronze flag)

      -- Additional season info
      total_matches INTEGER DEFAULT 0,
      total_squads INTEGER DEFAULT 0,

      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,     
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL      
  );