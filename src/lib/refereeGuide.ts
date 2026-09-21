import type { RuleSection } from '@/lib/rules';

/*
 * The CTF referee guide: what a CTF[Ref] alias is for and where the role stops. It's the same for
 * every league, so it lives in code rather than league_rules, and the rules page appends it to
 * whichever league is showing. Linkable as /rules#referees.
 */

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h = (text: string) => ({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] });
const ul = (items: string[]) => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [p(t)] })),
});

export const REFEREE_SECTION_ID = 'referees';

export const REFEREE_GUIDE: RuleSection = {
  id: REFEREE_SECTION_ID,
  league_slug: '*',
  category: 'Staff',
  title: 'Referees: what the role covers',
  sort_order: 9999,
  is_published: true,
  source: 'site',
  updated_at: null,
  body: {
    type: 'doc',
    content: [
      p('Referees are given a CTF[Ref] alias to help run CTF league matches and events. This is a quick guide to what that means, so everyone is working from the same page.'),
      h('What referees do'),
      ul([
        'Run and support official CTF league matches and events: match arenas, lineups, subs, disputes, results.',
        'Help players in match arenas get set up and settled.',
        'Pass anything bigger along to league staff rather than handling it alone.',
      ]),
      h('Where the role stops'),
      ul([
        'Referees aren’t game moderators. Public arenas like Arena 1 are outside the role, so if something there needs attention, report it to a mod the same way any player would.',
        'The powers that come with the alias are for league and event arenas. Please don’t use them in public arenas, even with good intentions.',
        'The access isn’t for looking people up. Please don’t use it to find out who someone is, and don’t share that kind of information with anyone. That covers alts, accounts, IPs, all of it.',
      ]),
      h('Using the CTF[Ref] alias'),
      ul([
        'Use it when you’re refereeing a match or working an event, and play on your normal alias the rest of the time.',
        'While the alias is on, you’re representing the league. Neutral, calm, and fair is all we ask.',
        'Keep the alias to yourself. No lending it out or leaving it logged in unattended.',
      ]),
      h('If something goes wrong'),
      p('Misusing the alias or its powers, or behaving in a way that doesn’t fit a staff role, will mean the alias and its powers are removed. We’d much rather never have to do that, so if you’re ever unsure whether something is within the role, just ask a league admin first.'),
      p('Thanks for helping keep CTF running. Questions go to the league admins any time.'),
    ],
  },
};
