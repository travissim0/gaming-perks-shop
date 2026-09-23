import { tournamentApi } from '@/lib/dueling-tournament/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = tournamentApi.list;
export const POST = tournamentApi.create;
export const OPTIONS = tournamentApi.options;
