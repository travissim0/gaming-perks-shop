'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import NeutralNavbar from '@/components/home/NeutralNavbar';
import SpaceBackground from '@/components/SpaceBackground';
import { toast } from 'react-hot-toast';

interface InfantryAlias {
  aliasId: number;
  name: string;
  creation: string | null;
  lastAccess: string | null;
  timePlayedMinutes: number;
  ip: string | null;
  stealth: boolean;
}

interface InfantryBan {
  banId: number;
  type: number;
  typeLabel: string;
  reason: string | null;
  name: string | null;
  ip: string | null;
  zone: number | null;
  created: string | null;
  expires: string | null;
  active: boolean;
}

interface InfantryAccount {
  accountId: number;
  name: string;
  email: string;
  dateCreated: string | null;
  lastAccess: string | null;
  permission: number;
  silenced: boolean;
  aliases: InfantryAlias[];
  bans: InfantryBan[];
}

interface ResetHistoryEntry {
  tokenId: number;
  token: string;
  expireDate: string | null;
  used: boolean;
  status: 'used' | 'expired' | 'active';
}

interface CannedQueryMeta {
  key: string;
  label: string;
  description: string;
  category: string;
  param: { label: string; placeholder: string } | null;
}

interface DbStatus {
  connected: boolean;
  version?: string;
  database?: string;
  schemaFlavor?: string;
  counts?: { accounts: number; aliases: number };
  cannedQueries?: CannedQueryMeta[];
  error?: string;
}

type Cell = string | number | boolean | null;

interface QueryResult {
  columns: string[];
  rows: Cell[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

type LookupType = 'auto' | 'account' | 'alias' | 'email';

const CATEGORY_ORDER = ['Emails & Resets', 'Accounts', 'Alts & IPs', 'Moderation'];

function resultsToCsv(result: QueryResult): string {
  const escape = (v: Cell) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns.map(escape).join(','), ...result.rows.map((r) => r.map(escape).join(','))].join('\n');
}

/** Generic compact table with click-to-sort headers (numeric-aware). */
function SortableTable({ columns, rows, maxHeightClass = 'max-h-[30rem]' }: {
  columns: string[];
  rows: Cell[][];
  maxHeightClass?: string;
}) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    if (sortCol === null || sortCol >= columns.length) return rows;
    const isNumeric = rows.every((r) => {
      const v = r[sortCol];
      return v === null || typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));
    });
    const copy = [...rows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // nulls last regardless of direction
      if (vb === null) return -1;
      const cmp = isNumeric
        ? Number(va) - Number(vb)
        : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns.length, sortCol, sortDir]);

  const toggleSort = (i: number) => {
    if (sortCol === i) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(i);
      setSortDir('asc');
    }
  };

  return (
    <div className={`overflow-x-auto ${maxHeightClass} overflow-y-auto rounded-lg border border-gray-700/60`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-950/95 backdrop-blur-sm z-10">
          <tr className="text-left text-gray-300">
            {columns.map((col, i) => (
              <th
                key={i}
                onClick={() => toggleSort(i)}
                className="px-3 py-2 font-semibold border-b border-gray-700/60 whitespace-nowrap cursor-pointer select-none hover:text-cyan-300 transition-colors"
                title="Click to sort"
              >
                {col}
                <span className="ml-1 text-cyan-400">{sortCol === i ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-800/60 last:border-0 odd:bg-white/[0.02] hover:bg-cyan-500/5">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-gray-200 whitespace-nowrap max-w-sm truncate">
                  {cell === null ? <span className="text-gray-600 italic">null</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-3 text-center text-gray-500 text-sm">No rows.</div>}
    </div>
  );
}

export default function InfantryDbPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // SpaceBackground positions stars with Math.random(), so it only matches
  // after mount — gate it client-side to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [status, setStatus] = useState<DbStatus | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchType, setSearchType] = useState<LookupType>('auto');
  const [searching, setSearching] = useState(false);
  const [accounts, setAccounts] = useState<InfantryAccount[] | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingResetId, setSendingResetId] = useState<number | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<number>>(new Set());
  const [resetHistory, setResetHistory] = useState<Record<number, ResetHistoryEntry[] | 'loading'>>({});

  const [selectedCanned, setSelectedCanned] = useState<CannedQueryMeta | null>(null);
  const [cannedParam, setCannedParam] = useState('');
  const [consoleSql, setConsoleSql] = useState('');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [resultLabel, setResultLabel] = useState('');
  const [resultCollapsed, setResultCollapsed] = useState(false);

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }
    if (!user) return;

    const checkAdmin = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin, is_zone_admin')
          .eq('id', user.id)
          .single();
        if (error || (!data?.is_zone_admin && !data?.is_admin)) {
          toast.error('Unauthorized: Zone admin access required');
          router.push('/dashboard');
          return;
        }
        setIsAdmin(true);
      } finally {
        setCheckingAdmin(false);
      }
    };
    checkAdmin();
  }, [user, loading, router]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchStatus = async () => {
      try {
        const res = await authedFetch('/api/admin/infantry-db/status');
        const data = await res.json();
        setStatus(data);
      } catch (err: unknown) {
        setStatus({ connected: false, error: err instanceof Error ? err.message : 'Failed to reach API' });
      }
    };
    fetchStatus();
  }, [isAdmin, authedFetch]);

  const cannedByCategory = useMemo(() => {
    const groups = new Map<string, CannedQueryMeta[]>();
    for (const c of status?.cannedQueries ?? []) {
      const list = groups.get(c.category) ?? [];
      list.push(c);
      groups.set(c.category, list);
    }
    return groups;
  }, [status?.cannedQueries]);

  const runSearch = async () => {
    const q = searchQ.trim();
    if (q.length < 2) {
      toast.error('Enter at least 2 characters');
      return;
    }
    setSearching(true);
    setAccounts(null);
    try {
      const res = await authedFetch(
        `/api/admin/infantry-db/lookup?q=${encodeURIComponent(q)}&type=${searchType}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setAccounts(data.accounts);
      if (data.accounts.length === 0) toast('No accounts matched', { icon: '🔍' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setSearching(false);
    }
  };

  const sendReset = async (account: InfantryAccount, silent = false): Promise<boolean> => {
    if (!account.email) {
      if (!silent) toast.error('No email on file for this account');
      return false;
    }
    setSendingResetId(account.accountId);
    try {
      const res = await authedFetch('/api/admin/infantry-db/send-reset', {
        method: 'POST',
        body: JSON.stringify({ accountId: account.accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reset');
      toast.success(`Reset email sent to ${data.email}`);
      // Reveal/refresh the history so the admin sees the new token land
      setOpenHistory((prev) => new Set(prev).add(account.accountId));
      fetchHistory(account.accountId);
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset');
      return false;
    } finally {
      setSendingResetId(null);
    }
  };

  const fetchHistory = async (accountId: number) => {
    setResetHistory((prev) => ({ ...prev, [accountId]: 'loading' }));
    try {
      const res = await authedFetch(`/api/admin/infantry-db/reset-history?accountId=${accountId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load history');
      setResetHistory((prev) => ({ ...prev, [accountId]: data.history }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load history');
      setResetHistory((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
      setOpenHistory((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  };

  const toggleHistory = (accountId: number) => {
    if (openHistory.has(accountId)) {
      setOpenHistory((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
      return;
    }
    setOpenHistory((prev) => new Set(prev).add(accountId));
    fetchHistory(accountId);
  };

  // Inline yes/no toast — resolves true if the admin clicks "Send it"
  const confirmToast = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      toast(
        (t) => (
          <div className="flex flex-col gap-2">
            <span className="text-sm">{message}</span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(true);
                }}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 rounded text-xs font-semibold text-white"
              >
                Send it
              </button>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(false);
                }}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white"
              >
                No
              </button>
            </div>
          </div>
        ),
        { duration: 8000 }
      );
    });

  const saveEmail = async (account: InfantryAccount) => {
    const email = editEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSavingEmail(true);
    try {
      const res = await authedFetch('/api/admin/infantry-db/update-email', {
        method: 'POST',
        body: JSON.stringify({ accountId: account.accountId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      const updated = { ...account, email };
      setAccounts((prev) =>
        prev ? prev.map((a) => (a.accountId === account.accountId ? updated : a)) : prev
      );
      setEditingId(null);
      toast.success(`Email updated for ${data.accountName}`);
      if (await confirmToast(`Also send a password-reset email to ${email}?`)) {
        await sendReset(updated, true);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingEmail(false);
    }
  };

  const runQuery = async (payload: { sql?: string; canned?: string; param?: string }, label: string) => {
    setRunning(payload.canned ?? 'console');
    try {
      const res = await authedFetch('/api/admin/infantry-db/query', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Query failed');
      setResult(data);
      setResultLabel(label);
      setResultCollapsed(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setRunning(null);
    }
  };

  const clickCanned = (canned: CannedQueryMeta) => {
    if (canned.param) {
      setSelectedCanned(canned);
      setCannedParam('');
    } else {
      setSelectedCanned(null);
      runQuery({ canned: canned.key }, canned.label);
    }
  };

  const runSelectedCanned = () => {
    if (!selectedCanned) return;
    if (!cannedParam.trim()) {
      toast.error(`${selectedCanned.param?.label} is required`);
      return;
    }
    runQuery({ canned: selectedCanned.key, param: cannedParam }, selectedCanned.label);
  };

  const downloadCsv = () => {
    if (!result) return;
    const blob = new Blob([resultsToCsv(result)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infantry-${resultLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || checkingAdmin) {
    return (
      <div className="min-h-screen relative text-white">
        {mounted && <SpaceBackground />}
        <div className="relative z-10">
          <NeutralNavbar />
          <div className="flex items-center justify-center pt-32 text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }
  if (!isAdmin) return null;

  const glass = 'bg-gray-900/50 backdrop-blur-md rounded-xl border';

  return (
    <div className="min-h-screen relative text-white">
      {mounted && <SpaceBackground />}
      <div className="relative z-10">
        <NeutralNavbar />
        <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold tracking-wide bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-400 bg-clip-text text-transparent">
                🗄️ Infantry Game Database
              </h1>
              <span className="text-sm text-gray-400 hidden sm:inline">
                lookup · email fixes · read-only queries
              </span>
            </div>
            {status === null ? (
              <span className="text-sm text-gray-400">Checking connection...</span>
            ) : status.connected ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-400/30 text-green-300 text-sm backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {status.database} · {status.counts?.accounts.toLocaleString()} accounts ·{' '}
                {status.counts?.aliases.toLocaleString()} aliases
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-400/30 text-red-300 text-sm"
                title={status.error}
              >
                ● offline — {status.error?.slice(0, 100)}
              </span>
            )}
          </div>

          {/* Account lookup */}
          <section className={`${glass} border-cyan-400/20 p-3.5`}>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Search account name, alias, or email..."
                className="flex-1 px-3.5 py-2 text-base bg-black/40 border border-gray-600/60 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30"
              />
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as LookupType)}
                className="px-3 py-2 text-sm bg-black/40 border border-gray-600/60 rounded-lg text-gray-200 focus:outline-none focus:border-cyan-400/70"
              >
                <option value="auto">Everything</option>
                <option value="account">Account name</option>
                <option value="alias">Alias</option>
                <option value="email">Email</option>
              </select>
              <button
                onClick={runSearch}
                disabled={searching}
                className="px-6 py-2 text-sm bg-cyan-500/80 hover:bg-cyan-400/80 disabled:opacity-50 rounded-lg font-semibold text-white transition-colors shadow-lg shadow-cyan-500/20"
              >
                {searching ? '...' : 'Search'}
              </button>
            </div>

            {accounts !== null && (
              <div className="mt-3 space-y-2.5">
                {accounts.length === 0 && <div className="text-gray-500 text-sm">No accounts matched.</div>}
                {accounts.map((account) => (
                  <div
                    key={account.accountId}
                    className="bg-black/30 backdrop-blur-sm rounded-lg border border-gray-700/50 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap text-base">
                        <span className="font-bold text-white">{account.name}</span>
                        <span className="text-xs text-gray-500">#{account.accountId}</span>
                        {account.permission > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-400/30 text-purple-300 text-xs">
                            perm {account.permission}
                          </span>
                        )}
                        {account.silenced && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/15 border border-red-400/30 text-red-300 text-xs">
                            silenced
                          </span>
                        )}
                        {account.bans.some((b) => b.active) && (
                          <span className="px-1.5 py-0.5 rounded bg-red-600/25 border border-red-500/40 text-red-300 text-xs font-semibold">
                            🚫 {account.bans.filter((b) => b.active).length} active ban
                            {account.bans.filter((b) => b.active).length === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          created {account.dateCreated?.slice(0, 10) ?? '?'} · last {account.lastAccess ?? '?'}
                        </span>
                      </div>
                      {editingId === account.accountId ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEmail(account)}
                            className="px-3 py-1.5 bg-black/50 border border-cyan-400/50 rounded text-sm text-white w-64 focus:outline-none focus:border-cyan-300"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEmail(account)}
                            disabled={savingEmail}
                            className="px-3 py-1.5 bg-green-500/80 hover:bg-green-400/80 disabled:opacity-50 rounded text-sm font-semibold"
                          >
                            {savingEmail ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-gray-700/80 hover:bg-gray-600/80 rounded text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${account.email ? 'text-cyan-300' : 'text-red-400 italic'}`}>
                            {account.email || '(no email)'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingId(account.accountId);
                              setEditEmail(account.email);
                            }}
                            className="px-2 py-1 bg-gray-700/60 hover:bg-gray-600/60 border border-gray-600/40 rounded text-xs transition-colors"
                            title="Edit email"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => sendReset(account)}
                            disabled={sendingResetId === account.accountId || !account.email}
                            title={account.email ? 'Email a password-reset link to this account' : 'No email on file'}
                            className="px-2 py-1 bg-cyan-600/40 hover:bg-cyan-500/40 border border-cyan-500/40 rounded text-xs transition-colors disabled:opacity-40"
                          >
                            {sendingResetId === account.accountId ? '...' : '✉️ Send reset'}
                          </button>
                          <button
                            onClick={() => toggleHistory(account.accountId)}
                            title="Show this account's password-reset tokens"
                            className={`px-2 py-1 border rounded text-xs transition-colors ${
                              openHistory.has(account.accountId)
                                ? 'bg-gray-600/60 border-gray-500/50 text-white'
                                : 'bg-gray-700/60 hover:bg-gray-600/60 border-gray-600/40'
                            }`}
                          >
                            🕑 History
                          </button>
                        </div>
                      )}
                    </div>

                    {account.aliases.length > 0 && (
                      <div className="mt-2">
                        <SortableTable
                          columns={['Alias', 'Created', 'Last Access', 'Hours', 'Last IP']}
                          rows={account.aliases.map((a) => [
                            a.stealth ? `${a.name} (stealth)` : a.name,
                            a.creation?.slice(0, 10) ?? null,
                            a.lastAccess ?? null,
                            Math.round((a.timePlayedMinutes / 60) * 10) / 10,
                            a.ip,
                          ])}
                          maxHeightClass="max-h-56"
                        />
                      </div>
                    )}

                    {account.bans.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-red-300/90 mb-1">🚫 Bans ({account.bans.length})</div>
                        <SortableTable
                          columns={['Type', 'Reason', 'Banned as', 'IP', 'Zone', 'Created', 'Expires', 'Status']}
                          rows={account.bans.map((b) => [
                            b.typeLabel,
                            b.reason ?? '',
                            b.name ?? '',
                            b.ip ?? '',
                            b.zone ?? '',
                            b.created ?? '',
                            b.expires && b.expires.slice(0, 4) > '3000' ? 'permanent' : b.expires ?? '',
                            b.active ? 'ACTIVE' : 'expired',
                          ])}
                          maxHeightClass="max-h-56"
                        />
                      </div>
                    )}

                    {openHistory.has(account.accountId) && (
                      <div className="mt-2 bg-black/40 rounded-lg border border-gray-700/50 p-2.5">
                        <div className="text-xs font-semibold text-gray-400 mb-1.5">🕑 Password-reset history</div>
                        {resetHistory[account.accountId] === 'loading' ? (
                          <div className="text-xs text-gray-500">Loading...</div>
                        ) : (resetHistory[account.accountId] as ResetHistoryEntry[])?.length ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b border-gray-700/60">
                                <th className="py-1 pr-4 font-medium">Token</th>
                                <th className="py-1 pr-4 font-medium">Expires</th>
                                <th className="py-1 pr-4 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(resetHistory[account.accountId] as ResetHistoryEntry[]).map((h) => (
                                <tr key={h.tokenId} className="border-b border-gray-800/60 last:border-0">
                                  <td className="py-1 pr-4 font-mono text-gray-300 text-xs">{h.token}</td>
                                  <td className="py-1 pr-4 text-gray-400">{h.expireDate ?? '—'}</td>
                                  <td className="py-1 pr-4">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-xs ${
                                        h.status === 'active'
                                          ? 'bg-green-500/15 border border-green-400/30 text-green-300'
                                          : h.status === 'used'
                                            ? 'bg-gray-500/15 border border-gray-400/30 text-gray-400'
                                            : 'bg-amber-500/15 border border-amber-400/30 text-amber-300'
                                      }`}
                                    >
                                      {h.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-xs text-gray-500">No reset tokens for this account.</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick queries — grouped chips */}
          <section className={`${glass} border-purple-400/20 p-3.5`}>
            {!status?.cannedQueries?.length ? (
              <div className="text-gray-500 text-xs">Quick queries available once connected.</div>
            ) : (
              <div className="space-y-1.5">
                {CATEGORY_ORDER.filter((cat) => cannedByCategory.has(cat)).map((cat) => (
                  <div key={cat} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-purple-300/90 w-28 shrink-0">
                      {cat}
                    </span>
                    {cannedByCategory.get(cat)!.map((canned) => (
                      <button
                        key={canned.key}
                        onClick={() => clickCanned(canned)}
                        disabled={running !== null}
                        title={canned.description}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors disabled:opacity-50 ${
                          selectedCanned?.key === canned.key
                            ? 'bg-purple-500/25 border-purple-400/60 text-purple-200'
                            : running === canned.key
                              ? 'bg-purple-500/25 border-purple-400/60 text-purple-200 animate-pulse'
                              : 'bg-white/[0.04] border-gray-600/50 text-gray-200 hover:border-purple-400/50 hover:text-purple-200'
                        }`}
                      >
                        {canned.label}
                        {canned.param && <span className="text-purple-400/80"> …</span>}
                      </button>
                    ))}
                  </div>
                ))}
                {selectedCanned?.param && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-700/40 mt-2">
                    <span className="text-sm text-purple-300">{selectedCanned.label}</span>
                    <input
                      type="text"
                      value={cannedParam}
                      onChange={(e) => setCannedParam(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runSelectedCanned()}
                      placeholder={selectedCanned.param.placeholder}
                      className="w-60 px-3 py-1.5 bg-black/40 border border-purple-400/40 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-300"
                      autoFocus
                    />
                    <button
                      onClick={runSelectedCanned}
                      disabled={running !== null}
                      className="px-4 py-1.5 bg-purple-500/70 hover:bg-purple-400/70 disabled:opacity-50 rounded text-sm font-semibold"
                    >
                      {running === selectedCanned.key ? '...' : 'Run'}
                    </button>
                    <button
                      onClick={() => setSelectedCanned(null)}
                      className="px-2 py-1.5 text-gray-500 hover:text-gray-300 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Results */}
          {result && (
            <section className={`${glass} border-gray-500/20 p-3.5`}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <button
                  onClick={() => setResultCollapsed((c) => !c)}
                  className="flex items-center gap-2 text-left"
                  title={resultCollapsed ? 'Expand' : 'Collapse'}
                >
                  <span className="text-gray-500 text-xs">{resultCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-base font-semibold text-white">
                    {resultLabel}{' '}
                    <span className="font-normal text-sm text-gray-400">
                      — {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
                      {result.truncated && ' (capped at 500)'} · {result.ms}ms
                    </span>
                  </h2>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadCsv}
                    className="px-3 py-1 bg-white/[0.05] hover:bg-white/[0.1] border border-gray-600/50 rounded text-sm transition-colors"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    onClick={() => setResult(null)}
                    title="Dismiss results"
                    className="px-2.5 py-1 bg-white/[0.05] hover:bg-red-500/20 border border-gray-600/50 hover:border-red-400/40 rounded text-sm transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!resultCollapsed && (
                <SortableTable key={`${resultLabel}-${result.ms}`} columns={result.columns} rows={result.rows} />
              )}
            </section>
          )}

          {/* SQL console — collapsed by default */}
          <section className={`${glass} border-amber-400/20 p-3.5`}>
            <button
              onClick={() => setConsoleOpen((o) => !o)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-base font-semibold text-amber-300">
                📟 SQL Console <span className="text-xs font-normal text-gray-400">read-only · single SELECT · 500 row cap</span>
              </span>
              <span className="text-gray-500 text-sm">{consoleOpen ? '▲' : '▼'}</span>
            </button>
            {consoleOpen && (
              <div className="mt-2.5">
                <textarea
                  value={consoleSql}
                  onChange={(e) => setConsoleSql(e.target.value)}
                  placeholder={'SELECT TOP 10 * FROM account ORDER BY dateCreated DESC'}
                  rows={3}
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-black/60 border border-gray-600/60 rounded-lg text-green-300 font-mono text-sm placeholder-gray-700 focus:outline-none focus:border-amber-400/60"
                />
                <button
                  onClick={() => runQuery({ sql: consoleSql }, 'Console query')}
                  disabled={running !== null || !consoleSql.trim()}
                  className="mt-1.5 px-5 py-1.5 bg-amber-500/80 hover:bg-amber-400/80 disabled:opacity-50 rounded-lg text-sm font-semibold text-white transition-colors"
                >
                  {running === 'console' ? 'Running...' : 'Run Query'}
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
