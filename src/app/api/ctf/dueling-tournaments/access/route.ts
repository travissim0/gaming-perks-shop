import { tournamentApi } from '@/lib/dueling-tournament/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = tournamentApi.access;
export const OPTIONS = tournamentApi.options;
