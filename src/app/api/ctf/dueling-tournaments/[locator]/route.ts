import { tournamentApi } from '@/lib/dueling-tournament/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ locator: string }> };

export async function GET(request: Request, context: Context) {
  return tournamentApi.detail(request, (await context.params).locator);
}
export async function POST(request: Request, context: Context) {
  return tournamentApi.mutate(request, (await context.params).locator);
}
export const OPTIONS = tournamentApi.options;
