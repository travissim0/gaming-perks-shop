import { createTournamentHttp } from './http';
import {
  publicReadLimit,
  requireExistingStaffAccount,
  serverRepository,
  tournamentEnabled,
  verifiedActor,
} from './server';

export const tournamentApi = createTournamentHttp({
  enabled: tournamentEnabled,
  repository: serverRepository,
  actor: verifiedActor,
  staffAccount: requireExistingStaffAccount,
  readLimit: publicReadLimit,
  now: () => new Date().toISOString(),
});
