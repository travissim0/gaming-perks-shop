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

const CLIENT_CHIPS = ['Dynamic Zoom', 'Modern UI', 'RTS Moves', 'Spectator Cam'];
const EDITOR_CHIPS = ['Items', 'Vehicles', 'Skills', 'Map Editor', 'Converter'];

/**
 * Compact side panels for the Infantry v2 client download and the
 * browser-based editor suite at /editors. Sized to sit in the home page's
 * left sidebar column above the Infantry 2 signup card.
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
    <div className="space-y-4">

      {/* ─── Infantry v2 Client ─── */}
      <div className="group relative overflow-hidden rounded-2xl border border-cyan-500/30 hover:border-cyan-400/50 bg-gradient-to-br from-gray-800/80 via-gray-900/70 to-gray-800/60 backdrop-blur-sm shadow-xl shadow-cyan-500/10 transition-colors duration-300">
        <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400" />
        <div
          className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(34,211,238,0.18) 0%, transparent 60%)' }}
        />
        <div className="relative p-4">
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <span className="text-[10px] font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">
              New Client
            </span>
            <span className="ml-auto px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full whitespace-nowrap">
              Available Now
            </span>
          </div>

          <h3 className={`text-base xl:text-lg font-black tracking-wider mb-1.5 ${orbitron.className}`}>
            <span
              className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
              style={{ filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.35))' }}
            >
              INFANTRY V2 CLIENT
            </span>
          </h3>

          <p className="text-gray-400 text-xs leading-relaxed mb-3">
            Infantry rebuilt for modern systems: dynamic zoom, a redesigned HUD,
            right-click move commands and a better spectator camera. The full
            editor suite ships inside the desktop app.
          </p>

          <div className="flex flex-wrap gap-1 mb-3">
            {CLIENT_CHIPS.map((chip) => (
              <span
                key={chip}
                className="px-1.5 py-0.5 text-[9px] font-mono text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20 rounded"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={DOWNLOAD_URL}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white text-xs transition-colors shadow-lg shadow-cyan-500/20"
            >
              <Download className="w-3.5 h-3.5" />
              Download {version ? `v${version}` : 'Client'}
            </a>
            <Link
              href="/tools"
              className="inline-flex items-center gap-0.5 px-1.5 py-2 text-xs font-semibold text-cyan-400/80 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              What&apos;s New
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Web Editors ─── */}
      <div className="group relative overflow-hidden rounded-2xl border border-purple-500/30 hover:border-purple-400/50 bg-gradient-to-br from-gray-800/80 via-gray-900/70 to-gray-800/60 backdrop-blur-sm shadow-xl shadow-purple-500/10 transition-colors duration-300">
        <div className="h-1.5 bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400" />
        <div
          className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          style={{ background: 'radial-gradient(ellipse at 80% 0%, rgba(168,85,247,0.18) 0%, transparent 60%)' }}
        />
        <div className="relative p-4">
          <div className="flex items-center gap-2 mb-2">
            <Palette className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span className="text-[10px] font-mono font-bold text-purple-400/70 uppercase tracking-[0.2em]">
              Zone Editors
            </span>
            <span className="ml-auto px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-full whitespace-nowrap">
              In Your Browser
            </span>
          </div>

          <h3 className={`text-base xl:text-lg font-black tracking-wider mb-1.5 ${orbitron.className}`}>
            <span
              className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500"
              style={{ filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.35))' }}
            >
              WEB EDITORS
            </span>
          </h3>

          <p className="text-gray-400 text-xs leading-relaxed mb-3">
            The classic zone editors in your browser, no install required. Edit
            items, vehicles and skills, build maps on a GPU-powered viewer and
            convert sprites.
          </p>

          <div className="flex flex-wrap gap-1 mb-3">
            {EDITOR_CHIPS.map((chip) => (
              <span
                key={chip}
                className="px-1.5 py-0.5 text-[9px] font-mono text-purple-300/80 bg-purple-500/10 border border-purple-500/20 rounded"
              >
                {chip}
              </span>
            ))}
          </div>

          <Link
            href="/editors"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-bold text-white text-xs transition-colors shadow-lg shadow-purple-500/20"
          >
            <Palette className="w-3.5 h-3.5" />
            Open Editors
          </Link>
          <p className="mt-1.5 text-center text-[10px] text-gray-500 font-mono">
            Chromium browsers recommended
          </p>
        </div>
      </div>
    </div>
  );
}
