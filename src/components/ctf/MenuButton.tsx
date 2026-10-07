'use client';

import { useEffect, useState } from 'react';

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Red text for destructive or disruptive actions. */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}

/**
 * A small "Label ▾" button that opens a list of actions. Used to tuck staff / organiser
 * controls away from captains on the match page. Closes on pick, outside click or Escape.
 */
export default function MenuButton({ label, items, className = '' }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <span className={`relative inline-block ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${open ? 'bg-white/10 text-[#E6EDF7]' : 'bg-white/5 text-[#8B98B0] hover:bg-white/10 hover:text-[#E6EDF7]'}`}
      >
        {label}
        <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[11rem] overflow-hidden rounded-lg bg-[#0B0F1A] py-1 shadow-xl ring-1 ring-white/10">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              disabled={it.disabled}
              title={it.title}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 ${it.danger ? 'text-[#F87171]' : 'text-[#E6EDF7]'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
