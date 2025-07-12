SELECT * FROM pg_trigger WHERE tgname = 'trigger_update_player_elo';

SELECT * FROM pg_proc WHERE proname = 'update_player_elo';

select pg_get_functiondef('update_player_elo'::regproc);