   -- Check squad status distribution
  SELECT
      is_active,
      is_legacy,
      COUNT(*) as count,
      STRING_AGG(name, ', ') as squad_names
  FROM squads
  GROUP BY is_active, is_legacy
  ORDER BY is_active DESC, is_legacy DESC;