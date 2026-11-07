'use client';

// The zone list on /admin/zones, built to stay short as zones are added:
//   - desktop: one dense row per zone (~32px): name + tag inline, server, status dot, players, five small actions
//   - mobile:  two thin lines per zone inside ONE panel (name/tag/status/players, then the five actions)
// Behaviour is unchanged from the old table + cards; the page still owns all state and the API calls.

import type { ReactNode } from 'react';
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

const DOT: Record<ZoneStatus, string> = {
  RUNNING: 'bg-green-400',
  STOPPED: 'bg-red-400',
  UNKNOWN: 'bg-yellow-400',
};
const STATUS_TEXT: Record<ZoneStatus, string> = {
  RUNNING: 'text-green-300',
  STOPPED: 'text-red-300',
  UNKNOWN: 'text-yellow-300',
};
const STATUS_LABEL: Record<ZoneStatus, string> = {
  RUNNING: 'Running',
  STOPPED: 'Stopped',
  UNKNOWN: 'Unknown',
};

const panel =
  'bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm border border-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/5 overflow-hidden';

const spinner = (
  <span className="inline-block animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent" />
);

function Btn({
  tone,
  icon,
  label,
  onClick,
  disabled,
  loading,
  title,
  mobile,
}: {
  tone: string;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  mobile?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1 rounded font-medium whitespace-nowrap text-white transition-colors disabled:cursor-not-allowed ${
        mobile ? 'h-6 px-0.5 text-[10px]' : 'h-6 px-2 text-[11px] min-w-[3.4rem]'
      } ${disabled ? 'bg-gray-600/60 text-gray-400' : tone}`}
    >
      {loading ? spinner : <><span aria-hidden>{icon}</span><span>{label}</span></>}
    </button>
  );
}

export default function ZoneList<Z extends ZoneListZone>(p: ZoneListProps<Z>) {
  const sortIcon = (f: ZoneSortField) => (p.sortField !== f ? '⇅' : p.sortOrder === 'asc' ? '↑' : '↓');
  const busy = (z: Z, a: ZoneActionName) => p.actionLoading === `${z.key}-${a}`;

  const actions = (z: Z, mobile: boolean) => {
    const host = p.resolveHost(z);
    const pinned = isRebuildPinned(z.key);
    return (
      <>
        <Btn mobile={mobile} tone="bg-green-600 hover:bg-green-700" icon="▶" label="Start"
          disabled={z.status === 'RUNNING' || busy(z, 'start')} loading={busy(z, 'start')}
          onClick={() => p.onAction(z.key, 'start', host)} />
        <Btn mobile={mobile} tone="bg-red-600 hover:bg-red-700" icon="⏹" label="Stop"
          disabled={z.status === 'STOPPED' || busy(z, 'stop')} loading={busy(z, 'stop')}
          onClick={() => p.onAction(z.key, 'stop', host)} />
        <Btn mobile={mobile} tone="bg-orange-600 hover:bg-orange-700" icon="🔄" label="Restart"
          disabled={busy(z, 'restart')} loading={busy(z, 'restart')}
          onClick={() => p.onAction(z.key, 'restart', host)} />
        <Btn mobile={mobile} tone="bg-purple-600 hover:bg-purple-700" icon={pinned ? '📌' : '🛠'} label="Rebuild"
          disabled={pinned || busy(z, 'rebuild')} loading={busy(z, 'rebuild')}
          title={pinned ? REBUILD_PINNED_REASON : 'Stop, deploy latest server build, and restart'}
          onClick={() => p.onAction(z.key, 'rebuild', host)} />
        <Btn mobile={mobile} tone="bg-cyan-700 hover:bg-cyan-600" icon="🗺" label="Maps"
          disabled={!z.hasMaps}
          title={z.hasMaps ? "Swap this zone's map (lvl/lio) and restart" : 'No maps configured for this zone'}
          onClick={() => z.hasMaps && p.onOpenMaps(z)} />
      </>
    );
  };

  const pinBadge = (z: Z) =>
    isRebuildPinned(z.key) ? (
      <span
        title={REBUILD_PINNED_REASON}
        className="shrink-0 rounded border border-amber-500/30 bg-amber-900/30 px-1 text-[10px] leading-4 text-amber-300"
      >
        📌 pinned build
      </span>
    ) : null;

  const serverCell = (z: Z) => {
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
        <span className="truncate text-[11px] text-gray-400" title={p.serverLabel(on[0])}>
          {p.serverLabel(on[0])}
        </span>
      );
    }
    return <span className="text-[11px] text-gray-600">—</span>;
  };

  const headBtn = (f: ZoneSortField, text: string) => (
    <button type="button" onClick={() => p.onSort(f)} className="flex items-center gap-1 text-left transition-colors hover:text-white">
      {text} <span className="text-gray-500">{sortIcon(f)}</span>
    </button>
  );

  return (
    <>
      {/* Desktop: one dense row per zone */}
      <div className={`hidden lg:block ${panel}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_3rem_auto] items-center gap-x-3 border-b border-gray-600/30 bg-gray-700/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {headBtn('name', 'Zone')}
          <div>Server</div>
          {headBtn('status', 'Status')}
          <div className="text-center">Players</div>
          <div className="w-[19.5rem] text-center">Actions</div>
        </div>
        <div className="divide-y divide-gray-600/20">
          {p.zones.map((z) => (
            <div
              key={z.key}
              className="grid grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_3rem_auto] items-center gap-x-3 px-3 py-1 transition-colors hover:bg-gray-700/30"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-white" title={z.name}>{z.name}</span>
                <code className="shrink-0 text-[11px] text-cyan-300/70">{z.key}</code>
                {pinBadge(z)}
              </div>
              <div className="min-w-0">{serverCell(z)}</div>
              <div className={`flex items-center gap-1.5 text-xs ${STATUS_TEXT[z.status]}`}>
                <span className={`h-2 w-2 rounded-full ${DOT[z.status]}`} />
                {STATUS_LABEL[z.status]}
              </div>
              <div className="text-center text-sm tabular-nums text-gray-300">
                {z.status === 'RUNNING' ? z.playerCount || 0 : 0}
              </div>
              <div className="flex w-[19.5rem] items-center justify-end gap-1">{actions(z, false)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: two thin lines per zone, all inside one panel */}
      <div className={`lg:hidden divide-y divide-gray-600/20 ${panel}`}>
        {p.zones.map((z) => {
          const multi = (z.availableOn?.length || 0) > 1;
          return (
            <div key={z.key} className="px-2.5 py-1.5">
              <div className="mb-1 flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[z.status]}`} title={STATUS_LABEL[z.status]} />
                <span className="min-w-0 truncate text-[13px] font-medium leading-tight text-white">{z.name}</span>
                <code className="shrink-0 text-[10px] text-cyan-300/70">{z.key}</code>
                {pinBadge(z)}
                <span className="ml-auto shrink-0 text-[10px] tabular-nums text-gray-400">
                  {z.status === 'RUNNING' ? `${z.playerCount || 0}p` : STATUS_LABEL[z.status]}
                </span>
              </div>
              {multi && <div className="mb-1">{serverCell(z)}</div>}
              <div className="grid grid-cols-5 gap-1">{actions(z, true)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
