'use client';

import { useState } from 'react';
import type { Command } from '@/lib/dueling-tournament/contracts';
import type { PublicFixture, TournamentView } from '@/lib/dueling-tournament/view';
import { easternInput, easternToIso } from '@/lib/dueling-tournament/time';
import {
  MATCH_ATTENDANCE_RULE,
  MATCH_START_RULE,
  startingCorners,
} from '@/lib/dueling-tournament/match-procedure';
import { playerName } from './Bracket';
import { ConfirmDialog } from './ConfirmDialog';
import { Message } from './Shell';
import { eventTime } from './client';

type Mutate = (command: Command) => Promise<boolean>;
type ResultInput = Extract<Command, { type: 'result' }>;

function MatchEditor({
  event,
  fixture,
  busy,
  mutate,
}: {
  event: TournamentView;
  fixture: PublicFixture;
  busy: boolean;
  mutate: Mutate;
}) {
  const [scoreA, setScoreA] = useState(fixture.result?.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(fixture.result?.scoreB ?? 0);
  const [kind, setKind] = useState<ResultInput['kind']>('played');
  const [winner, setWinner] = useState('');
  const [reason, setReason] = useState('');
  const [schedule, setSchedule] = useState(
    fixture.scheduledAt ? easternInput(fixture.scheduledAt) : '',
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ResultInput | null>(null);
  const [absence, setAbsence] = useState<'resume' | 'eliminate_both' | null>(null);
  const [reopen, setReopen] = useState(false);
  const [hold, setHold] = useState(false);
  const director = Boolean(event.me?.director);
  const held = Object.hasOwn(event.staff?.holds ?? {}, fixture.id);
  const players = fixture.slots.map((slot) =>
    slot.state === 'player' ? event.entries.find((entry) => entry.id === slot.entryId)! : null,
  );
  const impact = event.staff?.correctionImpacts[fixture.id];
  const corners = startingCorners(event, fixture);
  const eligible = event.queue.find((item) => item.matchId === fixture.id);
  const active = event.fixtures.find((item) => item.startedAt && !item.result);
  const correctable = Boolean(fixture.result && director && !impact?.blocked.length);
  const canResult =
    players.every(Boolean) &&
    (fixture.result ? correctable : ['ready', 'in_progress', 'held'].includes(fixture.state));
  const winnerId =
    kind === 'played'
      ? scoreA === 3 && scoreB < 3
        ? (players[0]?.id ?? null)
        : scoreB === 3 && scoreA < 3
          ? (players[1]?.id ?? null)
          : null
      : kind === 'forfeit'
        ? winner || null
        : null;

  return (
    <section className="dt-panel">
      <div className="dt-panel-header">
        <h2>
          {fixture.id} · {fixture.bracket} bracket
        </h2>
        <span className="dt-badge dt-badge-cyan">{fixture.state.replace('_', ' ')}</span>
      </div>
      <div className="dt-versus">
        {fixture.slots.map((slot, index) => (
          <div key={index}>
            <span className="dt-small">
              {players[index]?.seed ? `SEED ${players[index]?.seed}` : 'OPPONENT PENDING'}
            </span>
            <h2>{playerName(event, slot)}</h2>
            {corners[index] && <div className="dt-badge dt-badge-cyan">{corners[index]}</div>}
            <div className="dt-score">
              {fixture.result
                ? ((index ? fixture.result.scoreB : fixture.result.scoreA) ?? '–')
                : index
                  ? scoreB
                  : scoreA}
            </div>
          </div>
        ))}
      </div>
      <div className="dt-panel-body dt-form">
        {error && <Message error>{error}</Message>}
        <p className="dt-muted">{MATCH_START_RULE}</p>
        <p className="dt-muted">{MATCH_ATTENDANCE_RULE}</p>
        {fixture.state === 'conditional' && (
          <Message>The reset final opens only if the lower-bracket winner wins GF1.</Message>
        )}
        {held && (
          <Message>Match held: {event.staff?.holds[fixture.id] || 'Contact the referee.'}</Message>
        )}
        {event.staff?.rulings[fixture.id] && (
          <p className="dt-muted">Recorded ruling: {event.staff.rulings[fixture.id]}</p>
        )}
        {!fixture.result && (
          <div className="dt-actions">
            <button
              className="dt-button"
              disabled={
                busy ||
                event.paused ||
                !eligible?.eligible ||
                Boolean(active) ||
                Date.parse(event.serverNow) < Date.parse(event.settings.startsAt)
              }
              onClick={() => void mutate({ type: 'start_match', matchId: fixture.id })}
            >
              Start match
            </button>
            <button
              className="dt-button dt-button-quiet"
              disabled={busy || ['bye', 'skipped', 'conditional'].includes(fixture.state)}
              onClick={() => setHold(true)}
            >
              {held ? 'Release hold' : 'Hold match'}
            </button>
            {active && active.id !== fixture.id && (
              <span className="dt-small">{active.id} currently occupies the arena.</span>
            )}
            {eligible && !eligible.eligible && (
              <span className="dt-small">Earliest start: {eventTime(eligible.eligibleAt)}</span>
            )}
          </div>
        )}
        {!fixture.startedAt && !fixture.result && (
          <form
            className="dt-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                await mutate({
                  type: 'schedule_match',
                  matchId: fixture.id,
                  scheduledAt: schedule ? easternToIso(schedule) : null,
                });
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'Review the scheduled time.');
              }
            }}
          >
            <label className="dt-label">
              Earliest scheduled start (Eastern, optional)
              <input
                type="datetime-local"
                className="dt-input"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
            </label>
            <div>
              <button disabled={busy} className="dt-button dt-button-quiet">
                Save match time
              </button>
            </div>
          </form>
        )}
        {fixture.result && (
          <Message>
            {impact?.blocked.length
              ? `Correction is blocked because later matches have started: ${impact.blocked.join(', ')}. Pause the event and record a director ruling.`
              : director
                ? `A correction will recalculate these unstarted matches: ${impact?.affected.join(', ') || 'none'}.`
                : 'Only a tournament director can correct an official result.'}
          </Message>
        )}
        {director && fixture.result && correctable && (
          <button
            className="dt-button dt-button-quiet"
            disabled={busy}
            onClick={() => setReopen(true)}
          >
            Reopen match for replay
          </button>
        )}
        {director && held && !fixture.result && players.every(Boolean) && (
          <div className="dt-form">
            <h3 className="dt-section-title">Admin absence ruling</h3>
            <p className="dt-muted">
              If both players are absent, decide how this held match proceeds. Removing both ends
              their tournament participation even if this is their first loss.
            </p>
            <div className="dt-actions">
              <button
                className="dt-button dt-button-quiet"
                disabled={busy}
                onClick={() => setAbsence('resume')}
              >
                Return match to play
              </button>
              <button
                className="dt-button dt-button-danger"
                disabled={busy}
                onClick={() => setAbsence('eliminate_both')}
              >
                Remove both players
              </button>
            </div>
          </div>
        )}
        {event.settings.doubleForfeitPolicy === 'hold' && (
          <p className="dt-small">
            If both players are unavailable, hold the match and use the admin absence controls. Only
            a director can decide to remove both players.
          </p>
        )}
        {canResult && (
          <form
            className="dt-form"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              if (kind !== 'double_forfeit' && !winnerId) {
                setError('Choose a valid winner. A played BO5 score must be 3–0, 3–1, or 3–2.');
                return;
              }
              if ((kind !== 'played' || fixture.result) && !reason.trim()) {
                setError('Enter the ruling or correction reason.');
                return;
              }
              setPending({
                type: 'result',
                matchId: fixture.id,
                kind,
                winnerId,
                scoreA: kind === 'played' ? scoreA : null,
                scoreB: kind === 'played' ? scoreB : null,
                reason: reason.trim(),
              });
            }}
          >
            <h3 className="dt-section-title">
              {fixture.result ? 'Correct official result' : 'Record official result'}
            </h3>
            <label className="dt-label">
              Result type
              <select
                className="dt-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as ResultInput['kind'])}
              >
                <option value="played">Played series</option>
                <option value="forfeit">Forfeit / walkover</option>
                <option
                  value="double_forfeit"
                  disabled={event.settings.doubleForfeitPolicy !== 'eliminate_both'}
                >
                  Both players forfeit
                </option>
              </select>
            </label>
            {kind === 'played' ? (
              <>
                <div className="dt-form-grid">
                  {players.map((player, index) => (
                    <label key={player!.id} className="dt-label">
                      {player!.alias} game wins
                      <select
                        className="dt-select"
                        value={index ? scoreB : scoreA}
                        onChange={(e) => (index ? setScoreB : setScoreA)(Number(e.target.value))}
                      >
                        {[0, 1, 2, 3].map((score) => (
                          <option value={score} key={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="dt-actions">
                  {[
                    [3, 0],
                    [3, 1],
                    [3, 2],
                    [0, 3],
                    [1, 3],
                    [2, 3],
                  ].map(([a, b]) => (
                    <button
                      key={`${a}${b}`}
                      type="button"
                      className="dt-button dt-button-quiet"
                      onClick={() => {
                        setScoreA(a);
                        setScoreB(b);
                      }}
                    >
                      {a}–{b}
                    </button>
                  ))}
                </div>
              </>
            ) : kind === 'forfeit' ? (
              <label className="dt-label">
                Player advancing
                <select
                  required
                  className="dt-select"
                  value={winner}
                  onChange={(e) => setWinner(e.target.value)}
                >
                  <option value="">Choose the winner</option>
                  {players.map((player) => (
                    <option key={player!.id} value={player!.id}>
                      {player!.alias}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Message>
                Neither player advances from this match. Both are marked no-show. Later matches may
                advance by bye. No played game score is recorded.
              </Message>
            )}
            <label className="dt-label">
              {fixture.result
                ? 'Correction reason (required)'
                : kind === 'played'
                  ? 'Referee note (optional)'
                  : 'Ruling reason (required)'}
              <textarea
                className="dt-textarea"
                maxLength={2000}
                required={kind !== 'played' || Boolean(fixture.result)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div>
              <button
                className="dt-button"
                disabled={
                  busy ||
                  (!fixture.result && event.paused) ||
                  (kind === 'played' && !fixture.startedAt)
                }
              >
                Review {fixture.result ? 'correction' : 'result'}
              </button>
            </div>
            {!fixture.startedAt && kind === 'played' && (
              <p className="dt-small">Start the match before recording a played score.</p>
            )}
          </form>
        )}
      </div>
      {absence && (
        <ConfirmDialog
          busy={busy}
          title={
            absence === 'resume' ? 'Return this match to play?' : 'Remove both absent players?'
          }
          requireReason
          onCancel={() => setAbsence(null)}
          onConfirm={(reason) =>
            mutate({ type: 'resolve_absence', matchId: fixture.id, outcome: absence, reason })
          }
        >
          {absence === 'resume'
            ? 'Release this match hold. Any separate event pause stays in effect.'
            : 'Confirm that you have checked both players are unavailable under the event rules. The website does not detect attendance in the game. Record a double forfeit with no winner or game score. Neither player continues, including after a first loss. Later matches advance using the remaining opponents. This ruling is retained in event history.'}
        </ConfirmDialog>
      )}
      {reopen && (
        <ConfirmDialog
          busy={busy}
          title="Reopen this match?"
          requireReason
          onCancel={() => setReopen(false)}
          onConfirm={(reason) => mutate({ type: 'reopen_match', matchId: fixture.id, reason })}
        >
          The previous result stays in history. This match returns on hold. Release its hold and
          resume the event when play can continue. Independent disqualifications remain in effect.
        </ConfirmDialog>
      )}
      {hold && (
        <ConfirmDialog
          busy={busy}
          title={held ? 'Release this match?' : 'Hold this match?'}
          requireReason
          onCancel={() => setHold(false)}
          onConfirm={(value) =>
            mutate({ type: 'hold_match', matchId: fixture.id, held: !held, reason: value })
          }
        >
          A started match continues to occupy the single arena while it is held.
        </ConfirmDialog>
      )}
      {pending && (
        <ConfirmDialog
          busy={busy}
          title={fixture.result ? 'Confirm result correction' : 'Confirm official result'}
          confirmLabel="Save official result"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            if (fixture.result) {
              const replacement = {
                kind: pending.kind,
                winnerId: pending.winnerId,
                scoreA: pending.scoreA,
                scoreB: pending.scoreB,
                reason: pending.reason,
              };
              return mutate({
                type: 'correct_result',
                matchId: fixture.id,
                reason: pending.reason,
                replacement,
              });
            }
            return mutate(pending);
          }}
        >
          <p>
            {fixture.id}: {players[0]?.alias} vs {players[1]?.alias}
          </p>
          <p>
            {pending.kind === 'played'
              ? `${pending.scoreA}–${pending.scoreB}`
              : pending.kind.replace('_', ' ')}{' '}
            ·{' '}
            {pending.winnerId
              ? `${event.entries.find((entry) => entry.id === pending.winnerId)?.alias} advances`
              : 'Neither player advances'}
          </p>
          {pending.reason && <p>Reason: {pending.reason}</p>}
          {fixture.result && (
            <p>Recalculates: {impact?.affected.join(', ') || 'no later matches'}.</p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}

export function MatchDesk({
  event,
  busy,
  mutate,
  selected = '',
}: {
  event: TournamentView;
  busy: boolean;
  mutate: Mutate;
  selected?: string;
}) {
  const [choice, setChoice] = useState(selected);
  const [saved, setSaved] = useState('');
  const record: Mutate = async (command) => {
    const success = await mutate(command);
    if (
      success &&
      (command.type === 'result' ||
        (command.type === 'resolve_absence' && command.outcome === 'eliminate_both'))
    ) {
      setSaved(`${command.matchId} result saved. The next available match is selected.`);
      setChoice('');
    }
    return success;
  };
  const fixture =
    event.fixtures.find((item) => item.id === choice) ??
    event.fixtures.find((item) => item.startedAt && !item.result) ??
    event.fixtures.find((item) => item.id === event.queue[0]?.matchId) ??
    event.fixtures[0];
  if (!fixture) return <div className="dt-empty">Publish the bracket to open the match desk.</div>;
  return (
    <div className="dt-form">
      {saved && <Message>{saved}</Message>}
      <button
        className="dt-button dt-button-quiet"
        onClick={() => {
          setChoice('');
          setSaved('');
        }}
      >
        Go to next match
      </button>
      <label className="dt-label">
        Choose match
        <select
          className="dt-select"
          value={fixture.id}
          onChange={(e) => setChoice(e.target.value)}
        >
          {event.fixtures.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.slots.map((slot) => playerName(event, slot)).join(' vs ')} ·{' '}
              {item.state.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <MatchEditor
        key={`${fixture.id}-${fixture.result?.revision ?? 0}`}
        event={event}
        fixture={fixture}
        busy={busy}
        mutate={record}
      />
    </div>
  );
}
