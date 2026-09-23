import { createTournamentHttp } from './http';
import { requireExistingStaffAccount, serverRepository, verifiedActor } from './server';

export const tournamentApi = createTournamentHttp({
  repository: serverRepository,
  actor: verifiedActor,
  staffAccount: requireExistingStaffAccount,
  now: () => new Date().toISOString(),
});
