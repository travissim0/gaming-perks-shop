'use client';

import { useState } from 'react';
import { settingsSchema, type Settings } from '@/lib/dueling-tournament/contracts';
import { easternInput, easternToIso, workloadLabel } from '@/lib/dueling-tournament/time';
import { Message } from './Shell';

export const defaultSettings: Settings = {
  title: 'October Dueling Championship',
  slug: 'october-2026',
  description:
    'A one-night 1v1 dueling tournament for Free Infantry. Best of five, double elimination.',
  startsAt: '2026-10-04T00:00:00Z',
  timezone: 'America/New_York',
  registrationOpensAt: '2026-09-26T16:00:00Z',
  registrationClosesAt: '2026-10-03T23:30:00Z',
  checkInOpensAt: '2026-10-03T23:00:00Z',
  checkInClosesAt: '2026-10-03T23:45:00Z',
  capacity: 32,
  arena: 'CTF dueling arena',
  callChannel: 'in-game chat',
  staffContact: 'Tournament director',
  restMinutes: 2,
  estimatedGameSeconds: 30,
  estimatedChangeoverMinutes: 2,
  seedingMethod: 'draw',
  doubleForfeitPolicy: 'hold',
  seedingCriteria:
    'All checked-in players enter a public random seed draw. The top seeds receive any first-round byes. The locked roster and draw proof remain available for verification.',
};

const dateFields = [
  ['startsAt', 'Event starts'],
  ['registrationOpensAt', 'Registration opens'],
  ['registrationClosesAt', 'Registration closes'],
  ['checkInOpensAt', 'Check-in opens'],
  ['checkInClosesAt', 'Check-in closes'],
] as const;

export function SettingsForm({
  initial = defaultSettings,
  busy,
  locked = false,
  onSave,
  label = 'Save settings',
}: {
  initial?: Settings;
  busy: boolean;
  locked?: boolean;
  onSave: (value: Settings) => Promise<boolean>;
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  const [dates, setDates] = useState(() =>
    Object.fromEntries(dateFields.map(([key]) => [key, easternInput(initial[key])])),
  );
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function field<K extends keyof Settings>(key: K, input: Settings[K]) {
    setSaved(false);
    setValue((current) => ({ ...current, [key]: input }));
  }
  return (
    <form
      className="dt-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSaved(false);
        try {
          const converted = Object.fromEntries(
            dateFields.map(([key]) => [key, easternToIso(dates[key])]),
          );
          const result = settingsSchema.safeParse({ ...value, ...converted });
          if (!result.success) {
            setError(
              result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(' '),
            );
            return;
          }
          if (await onSave(result.data)) setSaved(true);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : 'Review the event settings.');
        }
      }}
    >
      {locked && (
        <Message>
          Settings are fixed after publication. Confirm the dates, arena, contact, and registration
          window before publishing.
        </Message>
      )}
      {error && <Message error>{error}</Message>}
      {saved && <Message>Settings saved.</Message>}
      <fieldset disabled={busy || locked} className="dt-form" style={{ minWidth: 0 }}>
        <div className="dt-form-grid">
          <label className="dt-label">
            Event title
            <input
              required
              maxLength={160}
              className="dt-input"
              value={value.title}
              onChange={(e) => field('title', e.target.value)}
            />
          </label>
          <label className="dt-label">
            URL name
            <input
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              className="dt-input"
              value={value.slug}
              onChange={(e) => field('slug', e.target.value)}
            />
          </label>
        </div>
        <label className="dt-label">
          Double-forfeit rule
          <select
            className="dt-select"
            value={value.doubleForfeitPolicy}
            onChange={(e) =>
              field('doubleForfeitPolicy', e.target.value as Settings['doubleForfeitPolicy'])
            }
          >
            <option value="hold">Hold the match for an explicit admin decision</option>
            <option value="eliminate_both">
              Both players leave the tournament, including after one loss
            </option>
          </select>
          <span className="dt-small">
            Confirm this competitive rule before publishing. Holding is the default until a ruleset
            is supplied.
          </span>
        </label>
        <label className="dt-label">
          Introduction
          <textarea
            maxLength={4000}
            className="dt-textarea"
            value={value.description}
            onChange={(e) => field('description', e.target.value)}
          />
        </label>
        <p className="dt-muted">
          All dates below are Eastern local time. October 3 uses EDT. The proposed registration
          window is editable until publication.
        </p>
        <div className="dt-form-grid">
          {dateFields.map(([key, title]) => (
            <label className="dt-label" key={key}>
              {title} (Eastern)
              <input
                required
                type="datetime-local"
                className="dt-input"
                value={dates[key]}
                onChange={(e) => {
                  setSaved(false);
                  setDates((current) => ({ ...current, [key]: e.target.value }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="dt-form-grid">
          <label className="dt-label">
            Player capacity
            <input
              required
              type="number"
              min={4}
              max={32}
              className="dt-input"
              value={value.capacity}
              onChange={(e) => field('capacity', Number(e.target.value))}
            />
            <span className="dt-small" data-testid="capacity-workload">
              {value.capacity} players, one arena: about{' '}
              {workloadLabel(
                value.capacity,
                value.estimatedChangeoverMinutes,
                value.estimatedGameSeconds,
              )}{' '}
              at {value.estimatedChangeoverMinutes} min changeovers.
            </span>
            <span className="dt-small dt-muted">
              Assumes {value.estimatedGameSeconds}-second games, all five games per series, a reset
              final and a 30-minute buffer. Longer player delays add time.
            </span>
          </label>
          <label className="dt-label">
            Rest between series (minutes)
            <input
              required
              type="number"
              min={0}
              max={60}
              className="dt-input"
              value={value.restMinutes}
              onChange={(e) => field('restMinutes', Number(e.target.value))}
            />
          </label>
          <label className="dt-label">
            Estimated seconds per game
            <input
              required
              type="number"
              min={15}
              max={120}
              className="dt-input"
              value={value.estimatedGameSeconds}
              onChange={(e) => field('estimatedGameSeconds', Number(e.target.value))}
            />
          </label>
          <label className="dt-label">
            Estimated changeover (minutes)
            <input
              required
              type="number"
              min={0}
              max={15}
              step={0.5}
              className="dt-input"
              value={value.estimatedChangeoverMinutes}
              onChange={(e) => field('estimatedChangeoverMinutes', Number(e.target.value))}
            />
          </label>
          {(['arena', 'callChannel', 'staffContact'] as const).map((key) => (
            <label key={key} className="dt-label">
              {
                {
                  arena: 'Arena name',
                  callChannel: 'Where the referee calls players',
                  staffContact: 'Staff contact',
                }[key]
              }
              <input
                required
                maxLength={160}
                className="dt-input"
                value={value[key]}
                onChange={(e) => field(key, e.target.value)}
              />
            </label>
          ))}
          <label className="dt-label">
            Seeding method
            <select
              className="dt-select"
              value={value.seedingMethod}
              onChange={(e) =>
                field('seedingMethod', e.target.value === 'draw' ? 'draw' : 'manual')
              }
            >
              <option value="draw">Public random draw</option>
              <option value="manual">Director-set seeds</option>
            </select>
          </label>
        </div>
        <label className="dt-label">
          Public seeding explanation
          <textarea
            required
            maxLength={2000}
            className="dt-textarea"
            value={value.seedingCriteria}
            onChange={(e) => field('seedingCriteria', e.target.value)}
          />
        </label>
        <div className="dt-actions">
          <button className="dt-button" type="submit">
            {busy ? 'Saving…' : label}
          </button>
          <span className="dt-small">Double elimination · BO5 throughout · BO5 final reset</span>
        </div>
      </fieldset>
    </form>
  );
}
