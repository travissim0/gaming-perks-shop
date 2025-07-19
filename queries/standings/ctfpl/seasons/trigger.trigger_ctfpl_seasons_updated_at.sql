  -- Create updated_at trigger
  CREATE TRIGGER trigger_ctfpl_seasons_updated_at
      BEFORE UPDATE ON ctfpl_seasons
      FOR EACH ROW
      EXECUTE FUNCTION update_ctfpl_standings_updated_at(); --Reuse existing function