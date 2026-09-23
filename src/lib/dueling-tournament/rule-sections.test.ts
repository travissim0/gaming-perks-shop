import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULE_SECTIONS, parseRuleSections, ruleSectionTemplate } from './rule-sections';

test('an unsectioned rulebook stays one block and every standard section is still missing', () => {
  const parsed = parseRuleSections('BO5 throughout.\nWait for the referee call.');
  assert.equal(parsed.intro, 'BO5 throughout.\nWait for the referee call.');
  assert.deepEqual(parsed.sections, []);
  assert.deepEqual(parsed.missing, [...RULE_SECTIONS]);
});

test('sections split on ## headings, keep empty ones, and list uncovered standard sections', () => {
  const parsed = parseRuleSections(
    'Read this first.\r\n## check-in and no-shows  \r\nBe on time.\r\n\r\n## Arena and classes\r\n',
  );
  assert.equal(parsed.intro, 'Read this first.');
  assert.deepEqual(parsed.sections, [
    { title: 'check-in and no-shows', body: 'Be on time.' },
    { title: 'Arena and classes', body: '' },
  ]);
  assert.deepEqual(parsed.missing, ['Disconnects', 'Disputes', 'Prizes']);
});

test('the admin template includes agreed procedures and leaves undecided sections empty', () => {
  const parsed = parseRuleSections(ruleSectionTemplate());
  assert.deepEqual(
    parsed.sections.map((section) => section.title),
    [...RULE_SECTIONS],
  );
  assert.match(parsed.sections[0].body, /within 2 minutes/);
  assert.match(parsed.sections[0].body, /series forfeit/);
  assert.match(parsed.sections[1].body, /DUELER/);
  assert.match(parsed.sections[1].body, /"GO\."/);
  assert.match(parsed.sections[1].body, /top-left corner/);
  assert.match(parsed.sections[1].body, /bottom-right corner/);
  assert.ok(parsed.sections.slice(2).every((section) => section.body === ''));
  assert.deepEqual(parsed.missing, []);
});
