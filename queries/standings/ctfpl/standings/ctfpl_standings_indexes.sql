CREATE INDEX idx_ctfpl_standings_season ON
  ctfpl_standings(season_number);
  CREATE INDEX idx_ctfpl_standings_squad ON
  ctfpl_standings(squad_id);
  CREATE INDEX idx_ctfpl_standings_points ON
  ctfpl_standings(season_number, points DESC);
  CREATE INDEX idx_ctfpl_standings_ranking ON
  ctfpl_standings(season_number, points DESC, win_percentage
  DESC, regulation_wins DESC);