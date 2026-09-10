import { redirect } from 'next/navigation';

/** The league schedule lives at /league/schedule now; old links keep working. */
export default function TournamentMatchesPage() {
  redirect('/league/schedule');
}
