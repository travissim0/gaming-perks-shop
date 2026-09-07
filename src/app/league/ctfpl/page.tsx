import { redirect } from 'next/navigation';

/** Legacy CTFPL-only standings route — the league-aware standings page replaces it. */
export default function CTFPLStandingsPage() {
  redirect('/league/standings?league=ctfpl');
}
