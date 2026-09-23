import { tournamentEnabled } from '@/lib/dueling-tournament/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { enabled: tournamentEnabled() },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
