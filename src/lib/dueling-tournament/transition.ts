import {
  Actor,
  Command,
  Mutation,
  Result,
  Settings,
  Tournament,
  requireCondition,
  tournamentSchema,
} from './contracts';
import {
  champion,
  correctionImpact,
  createBracket,
  bracketSizeFor,
  queue,
  requireFixture,
  resolveBracket,
  validateResult,
  validateSeeds,
} from './bracket';
import { createDraw, sha256 } from './draw';

const participationCommands = new Set<Command['type']>([
  'register',
  'withdraw',
  'check_in',
  'notice_read',
]);
const refereeCommands = new Set<Command['type']>([
  'start_match',
  'hold_match',
  'schedule_match',
  'result',
  'entry_status',
]);

export function canOperate(tournament: Tournament, actor: Actor) {
  return actor.director || tournament.refereeIds.includes(actor.userId);
}

export function newTournament(
  id: string,
  settings: Settings,
  actor: Actor,
  now: string,
): Tournament {
  requireCondition(actor.director, 'Tournament director access is required.', 'forbidden', 403);
  return tournamentSchema.parse({
    id,
    settings,
    revision: 0,
    phase: 'draft',
    published: false,
    featured: false,
    paused: false,
    pauseReason: '',
    rules: { text: '', version: 1, publishedAt: null },
    entries: [],
    fixtures: [],
    seedOrder: [],
    draws: [],
    refereeIds: [],
    announcements: [],
    notices: [],
    audit: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
  });
}

function addNotice(tournament: Tournament, userId: string, message: string, now: string) {
  tournament.notices.push({
    id: crypto.randomUUID(),
    userId,
    message,
    createdAt: now,
    readAt: null,
  });
}

function requireUnstarted(tournament: Tournament) {
  requireCondition(
    tournament.fixtures.every((fixture) => !fixture.startedAt && !fixture.result),
    'Seeding cannot change after play starts.',
  );
}

function activeDraw(tournament: Tournament) {
  return tournament.draws.findLast((draw) => draw.voidReason === null);
}

export async function commandFingerprint(command: Command): Promise<string> {
  return sha256(JSON.stringify(command));
}

export async function applyMutation(
  previous: Tournament,
  input: Mutation,
  actor: Actor,
  now: string,
): Promise<{ tournament: Tournament; replayed: boolean }> {
  const command = input.command;
  const staff = canOperate(previous, actor);
  if (!participationCommands.has(command.type)) {
    requireCondition(
      refereeCommands.has(command.type) ? staff : actor.director,
      'This action requires tournament staff access.',
      'forbidden',
      403,
    );
  }
  requireCondition(
    !previous.completionReason || !['result', 'correct_result'].includes(command.type),
    'Reopen the final before changing a completed event without a champion.',
  );
  if (command.type === 'notice_read') {
    const tournament = structuredClone(previous);
    const notice = tournament.notices.find(
      (item) => item.id === command.noticeId && item.userId === actor.userId,
    );
    requireCondition(notice, 'Notice not found.', 'not_found', 404);
    notice.readAt ??= now;
    return { tournament, replayed: false };
  }
  const fingerprint = await commandFingerprint(command);
  const receipt = previous.receipts.find((item) => item.id === input.operationId);
  if (receipt) {
    requireCondition(
      receipt.actorId === actor.userId && receipt.fingerprint === fingerprint,
      'This operation identifier was already used for a different action.',
      'operation_conflict',
    );
    return { tournament: previous, replayed: true };
  }
  requireCondition(
    input.expectedRevision === previous.revision,
    'The tournament changed. Refresh and review the current state before trying again.',
    'revision_conflict',
  );
  requireCondition(previous.phase !== 'cancelled', 'This tournament is cancelled.');
  if (previous.paused) {
    requireCondition(
      [
        'pause',
        'notice_read',
        'announcement',
        'correct_result',
        'reopen_match',
        'resolve_absence',
        'restore_entry',
        'finish_without_champion',
        'cancel',
        'hold_match',
        'staff',
      ].includes(command.type),
      'The tournament is paused.',
    );
  }
  const tournament = structuredClone(previous);
  const revision = previous.revision + 1;
  const at = Date.parse(now);
  const settings = tournament.settings;
  const ownEntry = tournament.entries.find((entry) => entry.userId === actor.userId);
  const resolvedBefore = resolveBracket(tournament.fixtures, tournament.seedOrder);
  const previousResult =
    'matchId' in command
      ? (tournament.fixtures.find((fixture) => fixture.id === command.matchId)?.result ?? null)
      : null;
  const details: Record<string, string | string[] | boolean | number | null> = {};
  const reason = 'reason' in command ? command.reason : '';
  const requireUnlockedRoster = () => {
    requireCondition(
      tournament.fixtures.length === 0 && !activeDraw(tournament),
      'The draw has locked the roster. Contact the director for a tournament ruling.',
    );
  };
  const restoreAvailability = (matchId: string) => {
    const prior = requireFixture(tournament.fixtures, matchId).result;
    for (const entry of tournament.entries) {
      if (entry.unavailableFromMatchId !== matchId) continue;
      const status = prior?.previousStatuses?.find((item) => item.entryId === entry.id)?.status;
      if (status) entry.status = status;
      entry.unavailableFromMatchId = null;
    }
  };
  const applyResult = (
    matchId: string,
    value: Pick<Result, 'kind' | 'winnerId' | 'scoreA' | 'scoreB' | 'reason'>,
    correction = false,
  ) => {
    const fixture = requireFixture(tournament.fixtures, matchId);
    const resolved = resolveBracket(tournament.fixtures, tournament.seedOrder).find(
      (item) => item.id === matchId,
    )!;
    requireCondition(
      correction || ['ready', 'in_progress', 'held'].includes(resolved.state),
      'This match cannot receive a result.',
    );
    requireCondition(correction || !fixture.result, 'This match already has an official result.');
    requireCondition(
      correction || value.kind !== 'played' || fixture.startedAt,
      'Start the match before recording a played score.',
    );
    validateResult(resolved.slots, value);
    requireCondition(
      value.kind !== 'double_forfeit' ||
        settings.doubleForfeitPolicy === 'eliminate_both' ||
        (command.type === 'resolve_absence' && actor.director),
      'Hold this match until the director supplies the double-forfeit rule.',
    );
    if (correction) restoreAvailability(matchId);
    const previousStatuses = resolved.slots.flatMap((slot) => {
      const entry =
        slot.state === 'player'
          ? tournament.entries.find((item) => item.id === slot.entryId)
          : null;
      return entry ? [{ entryId: entry.id, status: entry.status }] : [];
    });
    if (value.winnerId)
      requireCondition(
        !tournament.entries.some(
          (entry) =>
            entry.id === value.winnerId && ['disqualified', 'no_show'].includes(entry.status),
        ),
        'An unavailable player cannot be declared the winner.',
      );
    fixture.result = {
      ...value,
      previousStatuses,
      actorId: actor.userId,
      recordedAt: now,
      revision,
    };
    fixture.held = false;
    fixture.holdReason = '';
    for (const slot of resolved.slots) {
      if (slot.state !== 'player') continue;
      const entry = tournament.entries.find((item) => item.id === slot.entryId)!;
      if (value.kind === 'double_forfeit' && !['no_show', 'disqualified'].includes(entry.status)) {
        entry.status = 'no_show';
        entry.unavailableFromMatchId = matchId;
      }
      addNotice(
        tournament,
        entry.userId,
        `${matchId}: ${correction ? 'official result corrected' : 'official result recorded'}. Review your bracket and next match.`,
        now,
      );
    }
  };

  switch (command.type) {
    case 'settings':
      requireCondition(
        tournament.phase === 'draft' && tournament.entries.length === 0 && !tournament.published,
        'Event settings are locked after publication.',
      );
      tournament.settings = command.settings;
      break;
    case 'rules':
      requireCondition(
        tournament.phase === 'draft' && tournament.entries.length === 0,
        'Competitive rules are frozen when registration opens.',
      );
      tournament.rules = {
        text: command.text,
        version: tournament.rules.text ? tournament.rules.version + 1 : 1,
        publishedAt: command.publish ? now : null,
      };
      break;
    case 'publish':
      tournament.published = true;
      tournament.featured = command.featured;
      break;
    case 'registration_state': {
      const order = ['draft', 'registration', 'check_in', 'seeding'];
      const current = order.indexOf(tournament.phase);
      const target = order.indexOf(command.state);
      requireCondition(
        current >= 0 && target === current + 1,
        'Advance one participation stage at a time.',
      );
      requireCondition(
        tournament.published && tournament.rules.publishedAt && tournament.rules.text.trim(),
        'Publish the event and rules first.',
      );
      if (command.state === 'registration')
        requireCondition(
          at >= Date.parse(settings.registrationOpensAt) &&
            at < Date.parse(settings.registrationClosesAt),
          'Registration is outside its published window.',
        );
      // Staff can catch up a delayed phase change. Player eligibility still uses
      // the strict check-in window below and cannot be extended by this action.
      if (command.state === 'check_in')
        requireCondition(
          at >= Date.parse(settings.checkInOpensAt),
          'Wait until the published check-in opening.',
        );
      if (command.state === 'seeding') {
        requireCondition(
          at >= Date.parse(settings.checkInClosesAt),
          'Wait until the published check-in deadline.',
        );
        for (const entry of tournament.entries)
          if (entry.status === 'registered') entry.status = 'no_show';
      }
      tournament.phase = command.state;
      break;
    }
    case 'register': {
      requireCondition(
        tournament.published && ['registration', 'check_in'].includes(tournament.phase),
        'Registration is not open.',
      );
      requireCondition(
        at >= Date.parse(settings.registrationOpensAt) &&
          at < Date.parse(settings.registrationClosesAt),
        'Registration is outside its published window.',
      );
      requireCondition(
        tournament.rules.publishedAt && command.rulesVersion === tournament.rules.version,
        'Accept the published rules before registering.',
      );
      requireCondition(
        actor.alias?.trim(),
        'Complete your Freeinf profile and in-game alias before registering.',
        'profile_required',
        422,
      );
      requireUnlockedRoster();
      if (ownEntry && ['registered', 'waitlisted', 'checked_in'].includes(ownEntry.status)) break;
      requireCondition(
        !ownEntry?.reregisterAfter || at >= Date.parse(ownEntry.reregisterAfter),
        'Please wait five minutes after withdrawing before registering again.',
        'registration_cooldown',
        429,
      );
      requireCondition(
        !ownEntry || ownEntry.status === 'withdrawn',
        'Contact the director about your eligibility.',
      );
      requireCondition(
        !tournament.entries.some(
          (entry) =>
            entry.userId !== actor.userId &&
            !['withdrawn', 'no_show', 'disqualified'].includes(entry.status) &&
            entry.alias.toLocaleLowerCase('en-US') ===
              actor.alias!.trim().toLocaleLowerCase('en-US'),
        ),
        'This alias is already registered. Contact the director.',
        'alias_conflict',
      );
      requireCondition(
        ownEntry || tournament.entries.length < 1000,
        'Registration capacity has been reached.',
      );
      const occupied = tournament.entries.filter((entry) =>
        ['registered', 'checked_in'].includes(entry.status),
      ).length;
      const status =
        occupied < settings.capacity &&
        !tournament.entries.some((entry) => entry.status === 'waitlisted')
          ? 'registered'
          : 'waitlisted';
      const fields = {
        userId: actor.userId,
        alias: actor.alias!.trim(),
        status,
        registeredAt: now,
        reregisterAfter: null,
        registrationSequence: revision,
        checkedInAt: null,
        acceptedRulesVersion: command.rulesVersion,
        seed: null,
      } as const;
      if (ownEntry) Object.assign(ownEntry, fields);
      else tournament.entries.push({ id: crypto.randomUUID(), ...fields });
      addNotice(
        tournament,
        actor.userId,
        status === 'registered'
          ? 'Your tournament place is confirmed. Check in during the published window.'
          : 'You are on the waiting list. A tournament director will confirm any promotion.',
        now,
      );
      break;
    }
    case 'withdraw':
      requireCondition(
        ['registration', 'check_in'].includes(tournament.phase) &&
          at < Date.parse(settings.checkInClosesAt),
        'Player withdrawals are closed. Contact the director for a ruling.',
      );
      requireUnlockedRoster();
      requireCondition(
        ownEntry && ['registered', 'waitlisted', 'checked_in'].includes(ownEntry.status),
        'There is no active registration to withdraw.',
      );
      ownEntry.status = 'withdrawn';
      ownEntry.reregisterAfter = new Date(at + 5 * 60 * 1000).toISOString();
      ownEntry.seed = null;
      addNotice(tournament, actor.userId, 'Your tournament registration has been withdrawn.', now);
      break;
    case 'check_in':
      requireCondition(
        ['registration', 'check_in'].includes(tournament.phase) && tournament.published,
        'Check-in is not open.',
      );
      requireCondition(
        at >= Date.parse(settings.checkInOpensAt) && at <= Date.parse(settings.checkInClosesAt),
        'Check-in is outside its published window.',
      );
      requireCondition(
        ownEntry && ['registered', 'checked_in'].includes(ownEntry.status),
        'A confirmed tournament place is required to check in.',
      );
      requireUnlockedRoster();
      ownEntry.status = 'checked_in';
      ownEntry.checkedInAt ??= now;
      break;
    case 'promote': {
      requireUnlockedRoster();
      requireCondition(
        ['registration', 'check_in'].includes(tournament.phase) &&
          at < Date.parse(settings.checkInClosesAt),
        'Promotion closes with check-in.',
      );
      const occupied = tournament.entries.filter((entry) =>
        ['registered', 'checked_in'].includes(entry.status),
      ).length;
      requireCondition(occupied < settings.capacity, 'There is no vacant place.');
      const waiting = tournament.entries
        .filter((entry) => entry.status === 'waitlisted')
        .sort(
          (a, b) =>
            a.registeredAt.localeCompare(b.registeredAt) ||
            a.registrationSequence - b.registrationSequence,
        );
      requireCondition(
        waiting[0]?.id === command.entryId,
        'Promote the first player on the waiting list.',
      );
      waiting[0].status = 'registered';
      addNotice(
        tournament,
        waiting[0].userId,
        'You have been promoted from the waiting list. Your place is confirmed; check in before the deadline.',
        now,
      );
      break;
    }
    case 'seeds':
      requireCondition(
        ['seeding', 'bracket'].includes(tournament.phase),
        'Open the seeding phase first.',
      );
      requireCondition(
        settings.seedingMethod === 'manual',
        'This event uses a public random draw. Manual seeding is disabled.',
      );
      requireUnstarted(tournament);
      validateSeeds(command.entryIds, tournament.entries);
      details.previousSeedOrder = [...tournament.seedOrder];
      tournament.seedOrder = command.entryIds;
      tournament.entries.forEach((entry) => {
        entry.seed = command.entryIds.includes(entry.id)
          ? command.entryIds.indexOf(entry.id) + 1
          : null;
      });
      if (tournament.fixtures.length) {
        requireCondition(
          command.entryIds.length <= (tournament.bracketSize ?? 16),
          'The field must fit the published bracket.',
        );
        tournament.fixtures = tournament.fixtures.map((fixture) => ({
          ...fixture,
          startedAt: null,
          scheduledAt: null,
          held: false,
          holdReason: '',
          result: null,
        }));
      }
      details.seedOrder = [...command.entryIds];
      break;
    case 'draw': {
      requireCondition(
        tournament.phase === 'seeding' && settings.seedingMethod === 'draw',
        'The public draw is available during the random-seeding phase.',
      );
      requireUnlockedRoster();
      const entrants = tournament.entries
        .filter((entry) => entry.status === 'checked_in')
        .map(({ id, alias }) => ({ id, alias }));
      validateSeeds(
        entrants.map((entry) => entry.id),
        tournament.entries,
      );
      tournament.draws.push(await createDraw(entrants, now));
      break;
    }
    case 'reveal_draw': {
      const draw = activeDraw(tournament);
      requireCondition(
        tournament.phase === 'seeding' && draw && !draw.revealedAt,
        'Commit a draw before revealing it.',
      );
      requireCondition(
        at >= Date.parse(draw.committedAt) + 5000,
        'Allow five seconds for the published commitment before revealing the draw.',
      );
      validateSeeds(draw.order, tournament.entries);
      draw.revealedAt = now;
      tournament.seedOrder = [...draw.order];
      tournament.entries.forEach((entry) => {
        entry.seed = draw.order.includes(entry.id) ? draw.order.indexOf(entry.id) + 1 : null;
      });
      for (const entry of tournament.entries.filter((entry) => entry.seed !== null))
        addNotice(
          tournament,
          entry.userId,
          `The public draw assigned you seed ${entry.seed}. Watch the seeding reveal and verify the draw on the event page.`,
          now,
        );
      break;
    }
    case 'void_draw': {
      requireCondition(
        tournament.phase === 'seeding' && tournament.fixtures.length === 0,
        'A published bracket cannot have its draw voided.',
      );
      const draw = activeDraw(tournament);
      requireCondition(draw, 'There is no current draw to void.');
      requireCondition(!draw.revealedAt, 'A revealed draw cannot be voided or redrawn.');
      draw.voidReason = command.reason;
      tournament.seedOrder = [];
      tournament.entries.forEach((entry) => {
        entry.seed = null;
      });
      tournament.announcements.push({
        id: crypto.randomUUID(),
        body: `Seeding draw voided: ${command.reason}`,
        createdAt: now,
      });
      break;
    }
    case 'publish_bracket':
      requireCondition(
        tournament.phase === 'seeding' && !tournament.fixtures.length,
        'Publish the bracket from the seeding phase.',
      );
      validateSeeds(tournament.seedOrder, tournament.entries);
      if (settings.seedingMethod === 'draw')
        requireCondition(
          activeDraw(tournament)?.revealedAt,
          'Reveal the committed draw before publishing the bracket.',
        );
      requireCondition(
        settings.seedingCriteria.trim(),
        'Publish the seeding method explanation first.',
      );
      tournament.bracketSize = bracketSizeFor(tournament.seedOrder.length);
      tournament.fixtures = createBracket(tournament.bracketSize);
      tournament.phase = 'bracket';
      break;
    case 'pause':
      requireCondition(
        !['completed', 'cancelled'].includes(tournament.phase),
        'This event has ended.',
      );
      tournament.paused = command.paused;
      tournament.pauseReason = command.paused ? command.reason : '';
      tournament.pauseSource = command.paused ? 'manual' : null;
      break;
    case 'staff':
      tournament.refereeIds = command.grant
        ? [...new Set([...tournament.refereeIds, command.userId])]
        : tournament.refereeIds.filter((id) => id !== command.userId);
      details.subjectUserId = command.userId;
      details.granted = command.grant;
      break;
    case 'announcement':
      tournament.announcements.push({
        id: crypto.randomUUID(),
        body: command.body,
        createdAt: now,
      });
      break;
    case 'schedule_match': {
      const fixture = requireFixture(tournament.fixtures, command.matchId);
      requireCondition(!fixture.startedAt && !fixture.result, 'This match has already started.');
      fixture.scheduledAt = command.scheduledAt;
      break;
    }
    case 'start_match': {
      requireCondition(
        ['bracket', 'final'].includes(tournament.phase),
        'The bracket is not in progress.',
      );
      requireCondition(
        at >= Date.parse(settings.startsAt),
        'Wait until the published event start.',
      );
      requireCondition(
        !tournament.fixtures.some((fixture) => fixture.startedAt && !fixture.result),
        'The arena already has an active or held match.',
      );
      const item = queue(resolvedBefore, settings.restMinutes, now).find(
        (item) => item.fixture.id === command.matchId,
      );
      requireCondition(
        item?.eligible,
        'This match is waiting for opponents, its scheduled time, or the required rest period.',
      );
      requireCondition(
        item.fixture.slots.every(
          (slot) =>
            slot.state === 'player' &&
            !tournament.entries.some(
              (entry) =>
                entry.id === slot.entryId && ['no_show', 'disqualified'].includes(entry.status),
            ),
        ),
        'An opponent is unavailable. Record a forfeit ruling instead.',
      );
      requireFixture(tournament.fixtures, command.matchId).startedAt = now;
      break;
    }
    case 'hold_match': {
      const fixture = requireFixture(tournament.fixtures, command.matchId);
      requireCondition(!fixture.result, 'A completed match cannot be held.');
      fixture.held = command.held;
      fixture.holdReason = command.held ? command.reason : '';
      break;
    }
    case 'result':
      requireCondition(
        ['bracket', 'final'].includes(tournament.phase),
        'The bracket is not in progress.',
      );
      applyResult(command.matchId, command);
      break;
    case 'correct_result': {
      const fixture = requireFixture(tournament.fixtures, command.matchId);
      requireCondition(fixture.result, 'There is no official result to correct.');
      const impact = correctionImpact(tournament.fixtures, command.matchId);
      requireCondition(
        impact.blocked.length === 0,
        `Correction blocked: downstream play has started (${impact.blocked.join(', ')}). Pause the event and record a ruling.`,
        'downstream_started',
      );
      details.affectedFixtures = impact.affected;
      applyResult(command.matchId, { ...command.replacement, reason: command.reason }, true);
      for (const dependent of tournament.fixtures.filter((item) =>
        impact.affected.includes(item.id),
      )) {
        dependent.held = false;
        dependent.holdReason = '';
        dependent.scheduledAt = null;
      }
      break;
    }
    case 'entry_status': {
      const entry = tournament.entries.find((item) => item.id === command.entryId);
      requireCondition(entry, 'Player not found.', 'not_found', 404);
      if (!tournament.fixtures.length) requireUnlockedRoster();
      entry.availabilityBeforeRuling ??= {
        status: entry.status,
        unavailableFromMatchId: entry.unavailableFromMatchId ?? null,
      };
      details.previousStatus = entry.status;
      entry.status = command.status;
      entry.unavailableFromMatchId = null;
      addNotice(
        tournament,
        entry.userId,
        `Staff recorded your tournament status as ${command.status.replace('_', ' ')}. Contact the referee for the ruling.`,
        now,
      );
      details.entryId = entry.id;
      break;
    }
    case 'restore_entry': {
      const entry = tournament.entries.find((item) => item.id === command.entryId);
      requireCondition(
        entry?.availabilityBeforeRuling && ['no_show', 'disqualified'].includes(entry.status),
        'There is no reversible staff availability ruling for this player.',
      );
      if (!tournament.fixtures.length) requireUnlockedRoster();
      details.previousStatus = entry.status;
      details.entryId = entry.id;
      entry.status = entry.availabilityBeforeRuling.status;
      entry.unavailableFromMatchId = entry.availabilityBeforeRuling.unavailableFromMatchId;
      // A separately corrected result no longer owns an earlier absence marker.
      if (
        entry.unavailableFromMatchId &&
        !tournament.fixtures.some(
          (item) =>
            item.id === entry.unavailableFromMatchId && item.result?.kind === 'double_forfeit',
        )
      ) {
        entry.status = entry.checkedInAt ? 'checked_in' : 'registered';
        entry.unavailableFromMatchId = null;
      }
      entry.availabilityBeforeRuling = null;
      requireCondition(
        !['registered', 'checked_in', 'waitlisted'].includes(entry.status) ||
          !tournament.entries.some(
            (other) =>
              other.id !== entry.id &&
              ['registered', 'checked_in', 'waitlisted'].includes(other.status) &&
              other.alias.toLocaleLowerCase('en-US') === entry.alias.toLocaleLowerCase('en-US'),
          ),
        'Another active entrant is using this alias. Resolve the duplicate alias before restoring availability.',
        'alias_conflict',
      );
      requireCondition(
        tournament.entries.filter((item) => ['registered', 'checked_in'].includes(item.status))
          .length <= settings.capacity,
        'Restoring this registration would exceed capacity. Resolve the roster first.',
      );
      addNotice(
        tournament,
        entry.userId,
        'The director reversed your staff availability ruling. Existing match results are unchanged.',
        now,
      );
      break;
    }
    case 'resolve_absence': {
      requireCondition(
        ['bracket', 'final'].includes(tournament.phase),
        'The bracket is not in progress.',
      );
      const fixture = requireFixture(tournament.fixtures, command.matchId);
      requireCondition(
        fixture.held && !fixture.result,
        'Hold the unresolved match before recording an absence ruling.',
      );
      if (command.outcome === 'resume') {
        fixture.held = false;
        fixture.holdReason = '';
      } else {
        applyResult(command.matchId, {
          kind: 'double_forfeit',
          winnerId: null,
          scoreA: null,
          scoreB: null,
          reason: command.reason,
        });
      }
      details.outcome = command.outcome;
      break;
    }
    case 'reopen_match': {
      const fixture = requireFixture(tournament.fixtures, command.matchId);
      requireCondition(fixture.result, 'There is no official result to reopen.');
      const impact = correctionImpact(tournament.fixtures, command.matchId);
      requireCondition(
        !impact.blocked.length,
        'Reopening is blocked because downstream play has started.',
      );
      restoreAvailability(command.matchId);
      fixture.result = null;
      fixture.startedAt = null;
      fixture.held = true;
      fixture.holdReason = command.reason;
      tournament.completionReason = null;
      details.affectedFixtures = impact.affected;
      for (const dependent of tournament.fixtures.filter((item) =>
        impact.affected.includes(item.id),
      )) {
        dependent.held = false;
        dependent.holdReason = '';
        dependent.scheduledAt = null;
      }
      break;
    }
    case 'finish_without_champion':
      requireCondition(
        tournament.fixtures.length &&
          !champion(resolvedBefore) &&
          !resolvedBefore.some((item) =>
            ['ready', 'in_progress', 'held', 'waiting'].includes(item.state),
          ),
        'Resolve or hold outstanding matches before making this final ruling.',
      );
      tournament.phase = 'completed';
      tournament.completionReason = command.reason;
      tournament.pauseSource = null;
      tournament.paused = false;
      tournament.pauseReason = '';
      tournament.announcements.push({
        id: crypto.randomUUID(),
        body: `Event ended without a champion: ${command.reason}`,
        createdAt: now,
      });
      break;
    case 'cancel':
      tournament.phase = 'cancelled';
      tournament.paused = true;
      tournament.pauseReason = command.reason;
      tournament.announcements.push({
        id: crypto.randomUUID(),
        body: `Tournament cancelled: ${command.reason}`,
        createdAt: now,
      });
      break;
  }

  if (JSON.stringify(tournament) === JSON.stringify(previous))
    return { tournament: previous, replayed: false };

  const resolvedAfter = resolveBracket(tournament.fixtures, tournament.seedOrder);
  if (
    tournament.fixtures.length &&
    tournament.phase !== 'cancelled' &&
    !tournament.completionReason
  ) {
    if (champion(resolvedAfter)) {
      tournament.phase = 'completed';
      // Completion ends the pause; the original pause and ruling remain audited.
      tournament.paused = false;
      tournament.pauseSource = null;
      tournament.pauseReason = '';
    } else {
      const final = resolvedAfter.find((fixture) => fixture.id === 'GF1');
      tournament.phase = final && final.state !== 'waiting' ? 'final' : 'bracket';
      const reset = resolvedAfter.find((fixture) => fixture.id === 'GF2');
      const noFinalWinner =
        (final &&
          ['bye', 'skipped', 'completed'].includes(final.state) &&
          final.winner.state === 'empty') ||
        (reset?.state === 'completed' && reset.winner.state === 'empty');
      if (noFinalWinner && (!tournament.paused || tournament.pauseSource === 'no_final_winner')) {
        tournament.paused = true;
        tournament.pauseSource = 'no_final_winner';
        tournament.pauseReason = 'The final has no eligible winner. A director ruling is required.';
      } else if (!noFinalWinner && tournament.pauseSource === 'no_final_winner') {
        tournament.paused = false;
        tournament.pauseReason = '';
        tournament.pauseSource = null;
      }
    }
  }
  for (const fixture of resolvedAfter) {
    if (
      fixture.state !== 'ready' ||
      resolvedBefore.find((item) => item.id === fixture.id)?.state === 'ready'
    )
      continue;
    for (const slot of fixture.slots) {
      if (slot.state !== 'player') continue;
      const entry = tournament.entries.find((item) => item.id === slot.entryId);
      if (entry)
        addNotice(
          tournament,
          entry.userId,
          `${fixture.id}: your opponents are confirmed. Follow the arena queue and wait for the referee's call.`,
          now,
        );
    }
  }
  const onDeckBefore = queue(resolvedBefore, settings.restMinutes, now)[0]?.fixture.id;
  const onDeckAfter = queue(resolvedAfter, settings.restMinutes, now)[0]?.fixture;
  if (onDeckAfter && onDeckAfter.id !== onDeckBefore && !tournament.paused) {
    for (const slot of onDeckAfter.slots) {
      if (slot.state !== 'player') continue;
      const entry = tournament.entries.find((item) => item.id === slot.entryId);
      if (entry)
        addNotice(
          tournament,
          entry.userId,
          `${onDeckAfter.id}: you are on deck. Wait for the referee's call in ${settings.callChannel}.`,
          now,
        );
    }
  }
  tournament.revision = revision;
  tournament.updatedAt = now;
  tournament.audit.push({
    id: input.operationId,
    actorId: actor.userId,
    action: command.type,
    at: now,
    revision,
    reason,
    matchId: 'matchId' in command ? command.matchId : null,
    previousResult,
    details,
  });
  tournament.receipts.push({ id: input.operationId, actorId: actor.userId, fingerprint, revision });
  return { tournament: tournamentSchema.parse(tournament), replayed: false };
}
