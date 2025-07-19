-- Create a view to easily see season winners with squad details
  CREATE OR REPLACE VIEW ctfpl_seasons_with_winners AS
  SELECT
      s.*,
      -- Champions (1st place)
      COALESCE(
          (SELECT json_agg(json_build_object(
              'squad_id', sq.id,
              'squad_name', sq.name,
              'squad_tag', sq.tag,
              'banner_url', sq.banner_url
          ))
          FROM unnest(s.champion_squad_ids) AS champion_id
          JOIN squads sq ON sq.id = champion_id),
          '[]'::json
      ) as champions,

      -- Runner-ups (2nd place)
      COALESCE(
          (SELECT json_agg(json_build_object(
              'squad_id', sq.id,
              'squad_name', sq.name,
              'squad_tag', sq.tag,
              'banner_url', sq.banner_url
          ))
          FROM unnest(s.runner_up_squad_ids) AS runner_up_id
          JOIN squads sq ON sq.id = runner_up_id),
          '[]'::json
      ) as runner_ups,

      -- Third place
      COALESCE(
          (SELECT json_agg(json_build_object(
              'squad_id', sq.id,
              'squad_name', sq.name,
              'squad_tag', sq.tag,
              'banner_url', sq.banner_url
          ))
          FROM unnest(s.third_place_squad_ids) AS third_place_id      
          JOIN squads sq ON sq.id = third_place_id),
          '[]'::json
      ) as third_place

  FROM ctfpl_seasons s
  ORDER BY s.season_number DESC;