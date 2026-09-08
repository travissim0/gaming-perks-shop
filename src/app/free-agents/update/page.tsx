import { redirect } from 'next/navigation';

/**
 * Editing your free-agent info is now the same form as league registration
 * (it pre-fills when you're already registered). Old links land here.
 */
export default function UpdateFreeAgentPage() {
  redirect('/league/register');
}
