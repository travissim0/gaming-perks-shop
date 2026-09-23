import { tournamentApi } from '@/lib/dueling-tournament/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ locator: string }> }) {
  return tournamentApi.export(request, (await context.params).locator);
}
