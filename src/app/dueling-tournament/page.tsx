import type { Metadata } from 'next';
import { Landing } from '@/components/dueling-tournament/Landing';
export const metadata: Metadata = {
  title: 'Dueling Tournaments | Free Infantry',
  description: 'Free Infantry dueling tournaments, registration, seeding and official brackets.',
};
export default function DuelingTournamentsPage() {
  return <Landing />;
}
