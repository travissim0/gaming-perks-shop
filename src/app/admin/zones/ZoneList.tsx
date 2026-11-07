'use client';

// The zone list on /admin/zones, built to stay short as zones are added.
//   - ONE primary action per zone: "Restart" while it is running, "Start" while it is not (both mean
//     "have this zone running", and Restart is by far the most used). Stop / Rebuild / Maps are rare, so they
//     live in a "..." menu on every row.
//   - desktop: one ~32px row per zone: name + tag, status dot, players, primary button, menu. The Server column
//     only appears when some zone exists on more than one server (with one server it is the same on every row).
//   - mobile: ONE thin line per zone inside one panel.
// Behaviour is unchanged: the page still owns all state and the API calls.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isRebuildPinned, REBUILD_PINNED_REASON } from '@/lib/zoneBuildPins';

export type ZoneStatus = 'RUNNING' | 'STOPPED' | 'UNKNOWN';
export type ZoneActionName = 'start' | 'stop' | 'restart' | 'rebuild';
export type ZoneSortField = 'name' | 'status' | 'key';

export interface ZoneListZone {
  name: string;
  status: ZoneStatus;
  key: string;
  playerCount?: number;
  runningOn?: string | null;
  availableOn?: string[];
  hasMaps?: boolean;
}

export interface ZoneListProps<Z extends ZoneListZone> {
  zones: Z[];
  sortField: ZoneSortField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: ZoneSortField) => void;
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
  'bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm border border-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/5 overflow-hidden';

const MENU_W = 176;
const MENU_H = 128;

const spinner = (
  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
);

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

export default function ZoneList<Z extends ZoneListZone>(p: ZoneListProps<Z>) {
  const sortIcon = (f: ZoneSortField) => (p.sortField !== f ? '⇅' : p.sortOrder === 'asc' ? '↑' : '↓');
  const busy = (z: Z, a: ZoneActionName) => p.actionLoading === `${z.key}-${a}`;
  const anyBusy = (z: Z) => (['start', 'stop', 'restart', 'rebuild'] as ZoneActionName[]).some((a) => busy(z, a));

  // Server column only when some zone exists on more than one server.
  const multiServer = p.zones.some((z) => (z.availableOn?.length || 0) > 1);

  // ---- the "..." menu: one at a time, positioned with fixed coordinates in a portal so the
  // panel's overflow-hidden can never clip it (last rows open it upwards)
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

  // ---- per-row controls
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

  const pinBadge = (z: Z, compact = false) =>
    isRebuildPinned(z.key) ? (
      <span
        title={REBUILD_PINNED_REASON}
        className="shrink-0 rounded border border-amber-500/30 bg-amber-900/30 px-1 text-[10px] leading-4 text-amber-300"
      >
        📌{compact ? '' : ' pinned'}
      </span>
    ) : null;

  const serverSelect = (z: Z) => {
    const on = z.availableOn || [];
    if (on.length > 1) {
      return (
        <select
          value={p.resolveHost(z)}
          onChange={(e) => p.onSelectHost(z.key, e.target.value)}
          // globals.css forces select text to 16px !important (stops iOS zooming on focus); keep that on phones, shrink on desktop only
          className="h-8 w-full rounded border border-gray-600 bg-gray-700 px-1 text-white focus:border-cyan-500 focus:outline-none lg:h-6 lg:text-[11px]!"
        >
          {on.map((h) => (
            <option key={h} value={h}>
              {p.serverLabel(h)}
              {z.runningOn === h ? ' ●' : ''}
            </option>
          ))}
        </select>
      );
    }
    if (on.length === 1) {
      return (
        <span className="block truncate text-[11px] text-gray-400" title={p.serverLabel(on[0])}>
          {p.serverLabel(on[0])}
        </span>
      );
    }
    return <span className="text-[11px] text-gray-600">—</span>;
  };

  const rowTitle = (z: Z) => {
    const on = z.availableOn || [];
    return on.length === 1 ? `${z.name} — ${p.serverLabel(on[0])}` : z.name;
  };

  const headBtn = (f: ZoneSortField, text: string) => (
    <button type="button" onClick={() => p.onSort(f)} className="flex items-center gap-1 text-left transition-colors hover:text-white">
      {text} <span className="text-gray-500">{sortIcon(f)}</span>
    </button>
  );

  const cols = multiServer
    ? 'grid-cols-[minmax(0,1fr)_9rem_6.25rem_3.5rem_7.25rem]'
    : 'grid-cols-[minmax(0,1fr)_6.25rem_3.5rem_7.25rem]';

  return (
    <div className={`w-full ${multiServer ? 'lg:max-w-4xl' : 'lg:max-w-2xl'}`}>
      {/* Desktop */}
      <div className={`hidden lg:block ${panel}`}>
        <div className={`grid ${cols} items-center gap-x-3 border-b border-gray-600/30 bg-gray-700/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400`}>
          {headBtn('name', 'Zone')}
          {multiServer && <div>Server</div>}
          {headBtn('status', 'Status')}
          <div className="text-center">Players</div>
          <div />
        </div>
        <div className="divide-y divide-gray-600/20">
          {p.zones.map((z) => (
            <div key={z.key} className={`grid ${cols} items-center gap-x-3 px-3 py-1 transition-colors hover:bg-gray-700/30`}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-white" title={rowTitle(z)}>{z.name}</span>
                <code className="shrink-0 text-[11px] text-cyan-300/70">{z.key}</code>
                {pinBadge(z)}
              </div>
              {multiServer && <div className="min-w-0">{serverSelect(z)}</div>}
              <div className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${STATUS_TEXT[z.status]}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[z.status]}`} />
                {STATUS_LABEL[z.status]}
              </div>
              <div className="text-center text-sm tabular-nums text-gray-300">{z.status === 'RUNNING' ? z.playerCount || 0 : 0}</div>
              <div className="flex items-center justify-end gap-1">
                {primary(z)}
                {moreBtn(z)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: one thin line per zone, one panel */}
      <div className={`lg:hidden divide-y divide-gray-600/20 ${panel}`}>
        {p.zones.map((z) => (
          <div key={z.key} className="px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[z.status]}`} title={STATUS_LABEL[z.status]} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-white" title={rowTitle(z)}>{z.name}</span>
              <code className="hidden shrink-0 text-[10px] text-cyan-300/70 min-[400px]:inline">{z.key}</code>
              {pinBadge(z, true)}
              <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-gray-400">{z.status === 'RUNNING' ? `${z.playerCount || 0}p` : ''}</span>
              {primary(z)}
              {moreBtn(z)}
            </div>
            {(z.availableOn?.length || 0) > 1 && <div className="mt-1">{serverSelect(z)}</div>}
          </div>
        ))}
      </div>

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
              title={isRebuildPinned(menuZone.key) ? REBUILD_PINNED_REASON : 'Stop, deploy latest server build, and restart'}
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
