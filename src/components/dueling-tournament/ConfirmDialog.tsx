'use client';

import { useEffect, useRef, useState } from 'react';

export function ConfirmDialog({
  title,
  children,
  requireReason = false,
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  requireReason?: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dt-dialog"
      aria-labelledby="dt-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        className="dt-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onConfirm(reason.trim())) onCancel();
        }}
      >
        <h2 id="dt-confirm-title">{title}</h2>
        <div className="dt-muted">{children}</div>
        {requireReason && (
          <label className="dt-label">
            Reason (required)
            <textarea
              required
              maxLength={2000}
              className="dt-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        )}
        <div className="dt-actions">
          <button className="dt-button" disabled={busy || (requireReason && !reason.trim())}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
          <button
            type="button"
            className="dt-button dt-button-quiet"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
