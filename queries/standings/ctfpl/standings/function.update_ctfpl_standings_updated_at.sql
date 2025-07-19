 CREATE OR REPLACE FUNCTION update_ctfpl_standings_updated_at()      
  RETURNS TRIGGER AS $$
  BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trigger_ctfpl_standings_updated_at
      BEFORE UPDATE ON ctfpl_standings
      FOR EACH ROW
      EXECUTE FUNCTION update_ctfpl_standings_updated_at();