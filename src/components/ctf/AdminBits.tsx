'use client';

import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/** Shared building blocks for the CTF staff pages (CTF management, draft setup). */

export function Chip({ active, onClick, children, tone = 'accent', title, disabled }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: 'accent' | 'warn'; title?: string; disabled?: boolean }) {
  const on = tone === 'warn' ? 'bg-[#F59E0B]/15 text-[#F59E0B]' : 'bg-[#22D3EE]/15 text-[#22D3EE]';
  return (
    <button type="button" onClick={onClick} title={title} disabled={disabled} className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? on : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}>
      {children}
    </button>
  );
}

export function Panel({ title, hint, actions, children, className = '' }: { title?: React.ReactNode; hint?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-[#131A2B] ${className}`}>
      {(title || actions) && (
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
          <div>
            {title && <h2 className="font-display text-lg text-[#E6EDF7]">{title}</h2>}
            {hint && <div className="text-xs text-[#8B98B0]">{hint}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, children, onClose }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#131A2B] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl text-[#E6EDF7] mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto h-7 w-7 animate-spin rounded-full border-b-2 border-[#22D3EE]" />
      <p className="mt-3 text-sm text-[#8B98B0]">{label}</p>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-8 text-center text-sm text-[#8B98B0]">{children}</div>;
}

/** Page shell: theme + fonts + navbar + container. */
export function StaffShell({ user, children, maxWidth = 'max-w-7xl' }: { user: any; children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className={`container mx-auto px-4 py-6 ${maxWidth} space-y-4`}>{children}</main>
    </div>
  );
}

/** Header strip used on every CTF page. */
export function HeaderStrip({ title, meta, actions, children }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
      <div className="relative px-5 sm:px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">Free Infantry · CTF leagues</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">{title}</h1>
            {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#8B98B0]">{meta}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}

export const th = 'py-2 px-4 text-left text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]';
export const td = 'py-2.5 px-4 text-sm';
export const pill = (on: boolean, onCls: string) => `rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${on ? onCls : 'bg-white/5 text-[#8B98B0] hover:bg-white/10'}`;
