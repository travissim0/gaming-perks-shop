(
  SELECT
    squads.id,
    squads.name,
    squads.tag,
    squads.description,
    squads.is_legacy,
    squad_members.status
  FROM squad_members
  JOIN squads ON squads.id = squad_members.squad_id
  WHERE squad_members.player_id = '6bdb9ba1-f723-45e9-b61e-0501b2680f95'
    AND squad_members.status = 'active'
    AND (squads.is_legacy = false OR squads.is_legacy IS NULL)
  LIMIT 1
)
UNION
(
  SELECT
    squads.id,
    squads.name,
    squads.tag,
    squads.description,
    squads.is_legacy,
    squad_members.status
  FROM squad_members
  JOIN squads ON squads.id = squad_members.squad_id
  WHERE squad_members.player_id = '6bdb9ba1-f723-45e9-b61e-0501b2680f95'
    AND squads.is_legacy = true
  LIMIT 1
);