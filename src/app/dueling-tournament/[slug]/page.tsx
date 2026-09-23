import { EventPage } from '@/components/dueling-tournament/EventPage';
import { Suspense } from 'react';
export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense>
      <EventPage slug={(await params).slug} />
    </Suspense>
  );
}
