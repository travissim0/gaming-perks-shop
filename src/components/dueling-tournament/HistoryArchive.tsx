'use client';

import { useState } from 'react';
import { z } from 'zod';
import { historyResponseSchema } from '@/lib/dueling-tournament/wire';
import { eventTime, requestJson } from './client';
import { Message } from './Shell';

type Row = z.infer<typeof historyResponseSchema>['rows'][number];

export function HistoryArchive({
  id,
  kind,
  acknowledge,
}: {
  id: string;
  kind: 'audit' | 'draws' | 'notices' | 'announcements';
  acknowledge?: (noticeId: string) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const result = await requestJson(
        `/${encodeURIComponent(id)}/history?kind=${kind}${before ? `&before=${before}` : ''}`,
        historyResponseSchema,
      );
      setRows((previous) => [...previous, ...result.rows]);
      setBefore(result.nextBefore);
      setLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'History could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="dt-panel">
      <summary className="dt-panel-header" style={{ cursor: 'pointer' }}>
        Browse complete {kind === 'audit' ? 'event history' : kind}
      </summary>
      <div className="dt-panel-body dt-form">
        <p className="dt-small">
          All recorded items remain here, including those older than the recent activity shown
          above.
        </p>
        {error && <Message error>{error}</Message>}
        {rows.map(({ cursor, item }) => (
          <article key={cursor} className="dt-audit-item">
            {'algorithm' in item ? (
              <>
                <strong>
                  {item.voidReason ? 'Voided draw' : 'Seed draw'} ·{' '}
                  {eventTime(item.committedAt, true)}
                </strong>
                <p>{item.voidReason ?? (item.revealedAt ? 'Revealed' : 'Awaiting reveal')}</p>
                <p className="dt-proof">{item.commitment}</p>
                <details>
                  <summary>Public proof data</summary>
                  <pre className="dt-proof" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </details>
              </>
            ) : 'action' in item ? (
              <>
                <strong>
                  #{item.revision} · {item.action.replaceAll('_', ' ')}
                </strong>
                <p>{item.reason}</p>
                <p className="dt-small">
                  {eventTime(item.at, true)} · Account {item.actorId}
                </p>
                <details>
                  <summary>Recorded details</summary>
                  <pre className="dt-proof" style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(item, null, 2)}
                  </pre>
                </details>
              </>
            ) : 'message' in item ? (
              <>
                <p>{item.message}</p>
                <p className="dt-small">{eventTime(item.createdAt, true)}</p>
                {acknowledge && !item.readAt && (
                  <button
                    className="dt-button dt-button-quiet"
                    disabled={busy}
                    onClick={async () => {
                      if (await acknowledge(item.id))
                        setRows((previous) =>
                          previous.map((row) =>
                            row.cursor === cursor
                              ? { ...row, item: { ...item, readAt: new Date().toISOString() } }
                              : row,
                          ),
                        );
                    }}
                  >
                    Mark read
                  </button>
                )}
              </>
            ) : (
              <>
                <p>{item.body}</p>
                <p className="dt-small">{eventTime(item.createdAt, true)}</p>
              </>
            )}
          </article>
        ))}
        {loaded && !rows.length && <p className="dt-muted">No archived items yet.</p>}
        {(!loaded || before) && (
          <button className="dt-button dt-button-quiet" disabled={busy} onClick={() => void load()}>
            {busy ? 'Loading…' : loaded ? 'Load older items' : 'Load complete history'}
          </button>
        )}
      </div>
    </details>
  );
}
