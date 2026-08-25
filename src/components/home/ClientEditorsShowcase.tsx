'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Orbitron } from 'next/font/google';
import { Download, ChevronRight, Monitor, Palette } from 'lucide-react';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

const MANIFEST_URL = 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/public/app-updates/latest.json';
const DOWNLOAD_URL = 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/public/app-updates/infantry-cfs-studio_latest_x64-setup.nsis.zip';

const CLIENT_CHIPS = ['Dynamic Zoom', 'Modern UI', 'RTS Move Commands', 'Spectator Camera', 'Full Editor Suite'];
const EDITOR_CHIPS = ['Items', 'Vehicles', 'Skills', 'Map Editor', 'Library', 'Converter'];

/**
 * Home page showcase for the two flagship releases: the Infantry v2 client
 * and the browser-based editor suite at /editors. Full-width, top billing.
 */
export default function ClientEditorsShowcase() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(MANIFEST_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.version) setVersion(data.version); })
      .catch(() => {});
  }, []);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5">

      {/* ─── Infantry v2 Client ─── */}
      <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-cyan-500/30 hover:border-cyan-400/60 bg-gradient-to-br from-gray-900/80 via-gray-900/70 to-gray-800/60 backdrop-blur-sm shadow-xl shadow-cyan-500/10 transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400" />
        <div
          className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.18) 0%, transparent 55%)' }}
        />
        <div className="relative flex flex-col flex-1 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] font-mono font-bold text-cyan-400/70 uppercase tracking-[0.25em]">
              New Client
            </span>
            <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
              Available Now
            </span>
          </div>

          <h2 className={`text-3xl md:text-4xl font-black tracking-wider mb-3 ${orbitron.className}`}>
            <span
              className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
              style={{ filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.4))' }}
            >
              INFANTRY V2 CLIENT + EDITORS
            </span>
          </h2>

          <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-4">
            Infantry rebuilt for modern systems &mdash; smooth dynamic zoom, a redesigned HUD,
            right-click move commands, an enhanced spectator camera, and much more. The full
            editor suite comes bundled with the desktop app, with the most complete set of
            zone-building tools.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-6">
            {CLIENT_CHIPS.map((chip) => (
              <span
                key={chip}
                className="px-2 py-0.5 text-[10px] font-mono text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3">
            <a
              href={DOWNLOAD_URL}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white text-sm transition-all duration-300 hover:scale-105"
              style={{ boxShadow: '0 0 20px rgba(34,211,238,0.35), 0 0 40px rgba(34,211,238,0.15)' }}
            >
              <Download className="w-4 h-4" />
              Download {version ? `v${version}` : 'Client'}
            </a>
            <Link
              href="/tools"
              className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-cyan-400/80 hover:text-cyan-300 transition-colors"
            >
              What&apos;s New
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Web Editors ─── */}
      <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-purple-500/30 hover:border-purple-400/60 bg-gradient-to-br from-gray-900/80 via-gray-900/70 to-gray-800/60 backdrop-blur-sm shadow-xl shadow-purple-500/10 transition-all duration-300">
        <div className="h-1.5 bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400" />
        <div
          className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          style={{ background: 'radial-gradient(ellipse at 80% 0%, rgba(168,85,247,0.18) 0%, transparent 55%)' }}
        />
        <div className="relative flex flex-col flex-1 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-purple-400" />
            <span className="text-[10px] font-mono font-bold text-purple-400/70 uppercase tracking-[0.25em]">
              Zone Editors
            </span>
            <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-full">
              In Your Browser
            </span>
          </div>

          <h2 className={`text-3xl md:text-4xl font-black tracking-wider mb-3 ${orbitron.className}`}>
            <span
              className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500"
              style={{ filter: 'drop-shadow(0 0 14px rgba(168,85,247,0.4))' }}
            >
              WEB EDITORS
            </span>
          </h2>

          <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-4">
            The classic zone editors, reborn in your browser &mdash; no install required.
            Edit items, vehicles, and skills, build maps on a GPU-powered viewer, browse
            assets, and convert sprites. For the most capable editing tools, grab the
            Infantry v2 desktop app &mdash; the editors ship inside it.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-6">
            {EDITOR_CHIPS.map((chip) => (
              <span
                key={chip}
                className="px-2 py-0.5 text-[10px] font-mono text-purple-300/80 bg-purple-500/10 border border-purple-500/20 rounded"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Link
              href="/editors"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-bold text-white text-sm transition-all duration-300 hover:scale-105"
              style={{ boxShadow: '0 0 20px rgba(168,85,247,0.35), 0 0 40px rgba(168,85,247,0.15)' }}
            >
              <Palette className="w-4 h-4" />
              Open Editors
            </Link>
            <span className="text-[11px] text-gray-500 font-mono">
              Chromium browsers recommended
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
