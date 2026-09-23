import { MatchPage } from '@/components/dueling-tournament/MatchPage';

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  return <MatchPage slug={slug} matchId={matchId} />;
}
