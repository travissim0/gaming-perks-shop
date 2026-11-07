'use client';

// The zone list on /admin/zones: a compact VERTICAL list, one thin full-width row per zone (same on phones).
//   - FLAGSHIP first (src/lib/zoneGroups.ts): gold-edged, slightly taller rows, always shown; a stopped one turns red.
//   - then RUNNING zones: Bot zones, then Other zones.
//   - STOPPED non-flagship zones are tucked into a collapsed, dimmed "Stopped" section at the bottom (they often
//     sit dormant for weeks or months); a search that matches one opens it.
//   - ONE primary action per zone: "Restart" while it is running, "Start" while it is not. Stop / Rebuild / Maps are
//     rare, so they live in a "..." menu on every card.
//   - PLAYERS: a glowing pill when anyone is in the zone (amber from 10 players).
//   - columns: status dot | name (+ pinned badge) | tag | status  ...  players | Restart | ...  (info on the left, controls on the right)
// The page owns all state and the API calls; this component only renders and reports clicks.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isRebuildPinned, rebuildPinReason } from '@/lib/zoneBuildPins';
import { FLAGSHIP_ORDER, ZONE_GROUP_LABEL, zoneGroup, type ZoneGroup } from '@/lib/zoneGroups';

export type ZoneStatus = 'RUNNING' | 'STOPPED' | 'UNKNOWN';
export type ZoneActionName = 'start' | 'stop' | 'restart' | 'rebuild';

export interface ZoneListZone {
  name: string;
  status: ZoneStatus;
  key: string;
  playerCount?: number;
  runningOn?: string | null;
  availableOn?: string[];
  hasMaps?: boolean;
}

export interface ZoneListCounts {
  running: number;
  stopped: number;
  total: number;
  /** players across every running zone */
  players: number;
}

export interface ZoneListProps<Z extends ZoneListZone> {
  zones: Z[];
  query: string;
  onQueryChange: (q: string) => void;
  counts: ZoneListCounts;
  resolveHost: (zone: Z) => string;
  serverLabel: (serverKey: string) => string;
  onSelectHost: (zoneKey: string, host: string) => void;
  /** `${zoneKey}-${action}` of the command in flight, or null. */
  actionLoading: string | null;
  onAction: (zoneKey: string, action: ZoneActionName, host: string) => void;
  onOpenMaps: (zone: Z) => void;
}

const DOT: Record<ZoneStatus, string> = { RUNNING: 'bg-green-400', STOPPED: 'bg-red-400', UNKNOWN: 'bg-yellow-400' };
const STATUS_TEXT: Record<ZoneStatus, string> = { RUNNING: 'text-green-300', STOPPED: 'text-red-300', UNKNOWN: 'text-yellow-300' };
const STATUS_LABEL: Record<ZoneStatus, string> = { RUNNING: 'Running', STOPPED: 'Stopped', UNKNOWN: 'Unknown' };

const panel =
  'bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm border border-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/5';

const MENU_W = 176;
const MENU_H = 128;

const spinner = (
  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
);

/** players in a running zone (0 when it is not running) */
const popOf = (z: ZoneListZone) => (z.status === 'RUNNING' ? z.playerCount || 0 : 0);

/** The player count: dim zero, glowing pill when anyone is in (amber from 10). */
function Pop({ n, hideZero = false }: { n: number; hideZero?: boolean }): ReactNode {
  if (n <= 0) return hideZero ? null : <span className="hidden text-sm tabular-nums text-gray-600 md:inline">0</span>;
  const hot = n >= 10;
  return (
    <span
      title={`${n} player${n === 1 ? '' : 's'} online`}
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-sm font-semibold tabular-nums ring-1 ${
        hot
          ? 'bg-amber-400/15 text-amber-200 ring-amber-300/50 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
          : 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/50 shadow-[0_0_12px_rgba(52,211,153,0.55)]'
      }`}
    >
      {n}
    </span>
  );
}

const GROUP_TEXT: Record<ZoneGroup, string> = { flagship: 'text-amber-300', bots: 'text-cyan-300', legacy: 'text-gray-400' };

function MenuItem({
  icon,
  label,
  hint,
  tone,
  disabled,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  tone?: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
        disabled ? 'cursor-not-allowed text-gray-500' : `${tone || 'text-gray-100'} hover:bg-gray-700/70`
      }`}
    >
      <span aria-hidden className="w-4 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
    </button>
  );
}

function SectionHeader({ g, label, n, extra }: { g: ZoneGroup; label?: string; n: number; extra?: ReactNode }): ReactNode {
  return (
    <div className={`mb-1.5 mt-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider first:mt-0 ${GROUP_TEXT[g]}`}>
      <span>{label || ZONE_GROUP_LABEL[g]}</span>
      <span className="font-normal text-gray-500">{n}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-current to-transparent opacity-20" />
      {extra}
    </div>
  );
}

export default function ZoneList<Z extends ZoneListZone>(p: ZoneListProps<Z>) {
  const busy = (z: Z, a: ZoneActionName) => p.actionLoading === `${z.key}-${a}`;
  const anyBusy = (z: Z) => (['start', 'stop', 'restart', 'rebuild'] as ZoneActionName[]).some((a) => busy(z, a));

  // ---- sections: flagship (fixed order, any status) / running bots / running others / stopped (collapsed)
  const flagship = FLAGSHIP_ORDER.map((tag) => p.zones.find((z) => z.key === tag)).filter(Boolean) as Z[];
  const rest = p.zones.filter((z) => zoneGroup(z.key) !== 'flagship');
  const live = rest.filter((z) => z.status !== 'STOPPED');
  const botZones = live.filter((z) => zoneGroup(z.key) === 'bots');
  const otherZones = live.filter((z) => zoneGroup(z.key) !== 'bots');
  const stoppedZones = rest.filter((z) => z.status === 'STOPPED');

  // the stopped section is collapsed by default (remembered); a search always opens it
  const [showStopped, setShowStopped] = useState(false);
  useEffect(() => {
    try { setShowStopped(localStorage.getItem('adminZonesShowStopped') === '1'); } catch { /* keep collapsed */ }
  }, []);
  const toggleStopped = () =>
    setShowStopped((v) => {
      const n = !v;
      try { localStorage.setItem('adminZonesShowStopped', n ? '1' : '0'); } catch { /* ignore */ }
      return n;
    });
  const stoppedOpen = showStopped || p.query.trim() !== '';

  // ---- the "..." menu: one at a time, fixed coordinates in a portal (flips up near the bottom)
  const [menu, setMenu] = useState<{ key: string; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (menuRef.current?.contains(t as Node)) return;
      if (t?.closest?.('[data-zone-menu-trigger]')) return; // the trigger toggles itself
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, close]);

  const toggleMenu = (e: ReactMouseEvent<HTMLButtonElement>, key: string) => {
    if (menu?.key === key) {
      close();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const up = r.bottom + MENU_H + 8 > window.innerHeight;
    setMenu({
      key,
      left: Math.max(8, Math.min(window.innerWidth - MENU_W - 8, r.right - MENU_W)),
      top: up ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4,
    });
  };

  const menuZone = menu ? p.zones.find((z) => z.key === menu.key) : undefined;

  // ---- per-zone controls
  const primary = (z: Z) => {
    const running = z.status === 'RUNNING';
    const action: ZoneActionName = running ? 'restart' : 'start';
    const loading = busy(z, 'start') || busy(z, 'restart');
    return (
      <button
        type="button"
        onClick={() => p.onAction(z.key, action, p.resolveHost(z))}
        disabled={loading}
        title={running ? 'Restart this zone (disconnects its players)' : 'Start this zone'}
        className={`inline-flex h-6 w-[5.5rem] shrink-0 items-center justify-center gap-1 rounded text-[11px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          running ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {loading ? spinner : <><span aria-hidden>{running ? '🔄' : '▶'}</span><span>{running ? 'Restart' : 'Start'}</span></>}
      </button>
    );
  };

  const moreBtn = (z: Z) => (
    <button
      type="button"
      data-zone-menu-trigger
      aria-haspopup="menu"
      aria-expanded={menu?.key === z.key}
      aria-label={`More actions for ${z.name}`}
      title="More: Stop, Rebuild, Maps"
      onClick={(e) => toggleMenu(e, z.key)}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm leading-none text-gray-300 transition-colors hover:bg-gray-600/60 hover:text-white ${
        menu?.key === z.key ? 'bg-gray-600/60 text-white' : 'bg-gray-700/50'
      }`}
    >
      ⋯
    </button>
  );

  const pinBadge = (z: Z) =>
    isRebuildPinned(z.key) ? (
      <span
        title={rebuildPinReason(z.key)}
        className="shrink-0 cursor-help rounded border border-amber-500/30 bg-amber-900/30 px-1 text-[10px] leading-4 text-amber-300"
      >
        📌<span className="hidden md:inline"> pinned build</span>
      </span>
    ) : null;

  const serverSelect = (z: Z) => {
    const on = z.availableOn || [];
    if (on.length <= 1) return null;
    return (
      <select
        value={p.resolveHost(z)}
        onChange={(e) => p.onSelectHost(z.key, e.target.value)}
        // globals.css forces select text to 16px !important (stops iOS zooming on focus); keep that on phones, shrink on desktop only
        className="mt-1 h-8 w-full rounded border border-gray-600 bg-gray-700 px-1 text-white focus:border-cyan-500 focus:outline-none lg:h-6 lg:text-[11px]!"
      >
        {on.map((h) => (
          <option key={h} value={h}>
            {p.serverLabel(h)}
            {z.runningOn === h ? ' ●' : ''}
          </option>
        ))}
      </select>
    );
  };

  const rowTitle = (z: Z) => {
    const on = z.availableOn || [];
    return on.length === 1 ? `${z.name} — ${p.serverLabel(on[0])}` : z.name;
  };

  /** One thin line per zone, in a vertical list that runs the full width, with the columns lined up.
   *  Flagship rows are a little taller, gold and bold (red when the zone is down); bot zones get a cyan edge. */
  const row = (z: Z, g: ZoneGroup) => {
    const stopped = z.status === 'STOPPED';
    const flag = g === 'flagship';
    const tone =
      flag && stopped
        ? 'border-red-400/80 bg-gradient-to-r from-red-400/[0.16] via-red-400/[0.05] to-transparent'
        : flag
        ? 'border-amber-400/80 bg-gradient-to-r from-amber-400/[0.14] via-amber-400/[0.04] to-transparent'
        : g === 'bots'
        ? 'border-cyan-400/50 bg-cyan-400/[0.04]'
        : 'border-gray-600/60 bg-white/[0.02]';
    const nameTone = flag
      ? 'text-[15px] font-semibold text-amber-100'
      : stopped
      ? 'text-[13px] font-medium text-gray-400'
      : `text-[13px] font-medium ${g === 'bots' ? 'text-cyan-50' : 'text-gray-100'}`;
    return (
      <div key={z.key}>
        <div
          className={`flex items-center gap-2 rounded-md border-l-2 px-2.5 transition-colors hover:bg-white/[0.05] ${
            flag ? 'py-1.5' : 'py-1'
          } ${tone} ${stopped && !flag ? 'opacity-60 hover:opacity-100' : ''}`}
        >
          <span className="flex w-2.5 shrink-0 justify-center" title={STATUS_LABEL[z.status]}>
            <span className={`${flag ? 'h-2.5 w-2.5' : 'h-2 w-2'} rounded-full ${DOT[z.status]}`} />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2 md:w-64 md:flex-none lg:w-80">
            <span className={`truncate leading-tight ${nameTone}`} title={rowTitle(z)}>
              {z.name}
            </span>
            {pinBadge(z)}
          </span>
          <code className={`hidden shrink-0 truncate text-[11px] min-[400px]:block md:w-28 ${flag ? 'text-amber-200/70' : 'text-cyan-300/70'}`}>{z.key}</code>
          <span className={`hidden w-16 shrink-0 whitespace-nowrap text-xs md:block ${STATUS_TEXT[z.status]}`}>{STATUS_LABEL[z.status]}</span>
          <span className="flex shrink-0 justify-end md:ml-auto md:w-9">
            <Pop n={popOf(z)} hideZero={stopped} />
          </span>
          {primary(z)}
          {moreBtn(z)}
        </div>
        {serverSelect(z)}
      </div>
    );
  };

  const rows = 'flex flex-col gap-1';
  const nothing = p.zones.length === 0;

  return (
    <div className="w-full">
      {/* Toolbar: search + players online */}
      <div className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 ${panel}`}>
        <input
          type="search"
          value={p.query}
          onChange={(e) => p.onQueryChange(e.target.value)}
          placeholder="Search name or tag…"
          aria-label="Search zones"
          // globals.css forces input text to 16px !important (iOS zoom); desktop only gets the smaller size
          className="h-7 w-56 rounded-md border border-gray-600 bg-gray-800/70 px-2 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:outline-none lg:text-[13px]!"
        />
        <div className="ml-auto text-xs">
          {p.counts.players > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-200 ring-1 ring-emerald-300/50 shadow-[0_0_12px_rgba(52,211,153,0.45)]">
              👥 {p.counts.players} online
            </span>
          ) : (
            <span className="text-gray-500">nobody online · {p.counts.running} zone{p.counts.running === 1 ? '' : 's'} running</span>
          )}
        </div>
      </div>

      {nothing ? (
        <div className={`px-4 py-6 text-center ${panel}`}>
          <div className="text-sm text-gray-300">No zones match{p.query ? ` “${p.query}”` : ''}.</div>
          <button type="button" onClick={() => p.onQueryChange('')} className="mt-2 rounded bg-gray-700/70 px-3 py-1 text-xs text-white hover:bg-gray-600/70">
            Clear search
          </button>
        </div>
      ) : (
        <>
          {flagship.length > 0 && (
            <section>
              <SectionHeader g="flagship" n={flagship.length} />
              <div className="flex flex-col gap-1.5">{flagship.map((z) => row(z, 'flagship'))}</div>
            </section>
          )}
          {botZones.length > 0 && (
            <section>
              <SectionHeader g="bots" n={botZones.length} />
              <div className={rows}>{botZones.map((z) => row(z, 'bots'))}</div>
            </section>
          )}
          {otherZones.length > 0 && (
            <section>
              <SectionHeader g="legacy" n={otherZones.length} />
              <div className={rows}>{otherZones.map((z) => row(z, 'legacy'))}</div>
            </section>
          )}
          {stoppedZones.length > 0 && (
            <section className="mt-3">
              <button
                type="button"
                onClick={toggleStopped}
                aria-expanded={stoppedOpen}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[11px] uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-300"
              >
                <span aria-hidden>{stoppedOpen ? '▾' : '▸'}</span>
                <span>Stopped</span>
                <span className="font-normal">{stoppedZones.length}</span>
                <span className="normal-case tracking-normal text-gray-600">· dormant zones{stoppedOpen ? '' : ' (click to show)'}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-gray-600 to-transparent opacity-30" />
              </button>
              {stoppedOpen && <div className={`mt-1.5 ${rows}`}>{stoppedZones.map((z) => row(z, zoneGroup(z.key)))}</div>}
            </section>
          )}
        </>
      )}

      {/* The "..." menu (portal, fixed position) */}
      {menu && menuZone && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`More actions for ${menuZone.name}`}
            style={{ position: 'fixed', left: menu.left, top: menu.top, width: MENU_W }}
            className="z-50 rounded-lg border border-gray-600/60 bg-gray-900 p-1 shadow-xl shadow-black/50"
          >
            <div className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-gray-500">{menuZone.key}</div>
            <MenuItem
              icon="⏹"
              label="Stop"
              tone="text-red-300"
              disabled={menuZone.status === 'STOPPED' || anyBusy(menuZone)}
              hint={menuZone.status === 'STOPPED' ? 'not running' : undefined}
              onClick={() => { close(); p.onAction(menuZone.key, 'stop', p.resolveHost(menuZone)); }}
            />
            <MenuItem
              icon={isRebuildPinned(menuZone.key) ? '📌' : '🛠'}
              label="Rebuild"
              tone="text-purple-300"
              disabled={isRebuildPinned(menuZone.key) || anyBusy(menuZone)}
              hint={isRebuildPinned(menuZone.key) ? 'pinned build' : undefined}
              title={isRebuildPinned(menuZone.key) ? rebuildPinReason(menuZone.key) : 'Stop, deploy latest server build, and restart'}
              onClick={() => { close(); p.onAction(menuZone.key, 'rebuild', p.resolveHost(menuZone)); }}
            />
            <MenuItem
              icon="🗺"
              label="Maps…"
              tone="text-cyan-300"
              disabled={!menuZone.hasMaps}
              hint={menuZone.hasMaps ? undefined : 'none'}
              title={menuZone.hasMaps ? "Swap this zone's map (lvl/lio) and restart" : 'No maps configured for this zone'}
              onClick={() => { close(); if (menuZone.hasMaps) p.onOpenMaps(menuZone); }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
