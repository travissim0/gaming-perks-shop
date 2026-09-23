import { MATCH_ATTENDANCE_RULE, MATCH_CORNER_RULE, MATCH_START_RULE } from './match-procedure';

/** Sections every published rulebook should cover. Directors write them as "## Title" lines. */
export const RULE_SECTIONS = [
  'Check-in and no-shows',
  'Arena and classes',
  'Disconnects',
  'Disputes',
  'Prizes',
] as const;

export function ruleSectionTemplate(): string {
  const agreed: Partial<Record<(typeof RULE_SECTIONS)[number], string>> = {
    'Check-in and no-shows': MATCH_ATTENDANCE_RULE,
    'Arena and classes': `${MATCH_START_RULE}\n\n${MATCH_CORNER_RULE}`,
  };
  return RULE_SECTIONS.map((title) => `## ${title}\n${agreed[title] ?? ''}\n`).join('\n');
}

export type RuleSection = { title: string; body: string };

/**
 * Splits plain-text rules on "## Title" lines. Text before the first heading is the intro.
 * A heading with no text under it is still a section, so the page can mark it unpublished.
 * `missing` lists the standard sections without their own heading, so the public page shows
 * them as not published until the director breaks them out.
 */
export function parseRuleSections(text: string): {
  intro: string;
  sections: RuleSection[];
  missing: string[];
} {
  const intro: string[] = [];
  const sections: RuleSection[] = [];
  let current: RuleSection | null = null;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], body: '' };
      sections.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    } else {
      intro.push(line);
    }
  }
  for (const section of sections) section.body = section.body.trim();
  const covered = new Set(sections.map((section) => section.title.toLowerCase()));
  return {
    intro: intro.join('\n').trim(),
    sections,
    missing: RULE_SECTIONS.filter((title) => !covered.has(title.toLowerCase())),
  };
}
