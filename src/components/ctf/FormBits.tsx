'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { displayFont, bodyFont } from '@/lib/fonts';

/** Shared styling for the CTF section's staff/analyst forms. */

export const inputCls =
  'w-full bg-[#0B0F1A] border border-white/10 rounded-md px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none';
export const labelCls = 'block text-[11px] uppercase tracking-wide text-[#8B98B0] mb-1';
export const btnPrimary =
  'px-4 py-2 rounded-md text-sm font-medium bg-[#22D3EE] text-[#0B0F1A] hover:bg-[#67E8F9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
export const btnQuiet = 'px-3.5 py-2 rounded-md text-sm bg-white/5 text-[#E6EDF7] hover:bg-white/10 transition-colors';
export const btnDanger = 'px-3.5 py-2 rounded-md text-sm text-[#F87171] hover:bg-[#F87171]/10 disabled:opacity-50 transition-colors';

export function FormPage({
  user,
  back,
  backLabel,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  user: any;
  back: string;
  backLabel: string;
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`ctf-theme ${displayFont.variable} ${bodyFont.variable} min-h-screen`}>
      <Navbar user={user} />
      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-4">
        <Link href={back} className="inline-flex items-center gap-1 text-xs text-[#8B98B0] hover:text-[#22D3EE]">
          <ChevronLeft className="w-3.5 h-3.5" /> {backLabel}
        </Link>
        <section className="relative overflow-hidden rounded-xl bg-[#131A2B]">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(34,211,238,0.12), transparent 40%)' }} />
          <div className="relative px-5 sm:px-6 py-5">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#22D3EE]/80 mb-1">{eyebrow || 'Free Infantry · CTF leagues'}</div>
            <h1 className="font-display text-4xl sm:text-5xl leading-none text-[#E6EDF7]">{title}</h1>
            {subtitle && <div className="mt-2 text-sm text-[#8B98B0]">{subtitle}</div>}
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

export function FormSection({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex items-baseline justify-between gap-3 border-b border-white/[0.06]">
        <h2 className="font-display text-lg text-[#E6EDF7]"><span className="text-[#22D3EE] mr-2">{n}</span>{title}</h2>
        {hint && <span className="text-xs text-[#8B98B0]">{hint}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Denied({ user, back, backLabel, what }: { user: any; back: string; backLabel: string; what: string }) {
  return (
    <FormPage user={user} back={back} backLabel={backLabel} title="Analysts only" subtitle={`Only analysts and league staff can ${what}.`}>
      <></>
    </FormPage>
  );
}
