import Link from 'next/link';

export function TournamentFeatureLink({ className }: { className: string }) {
  return (
    <Link href="/dueling-tournament" className={className}>
      Tournaments
    </Link>
  );
}
