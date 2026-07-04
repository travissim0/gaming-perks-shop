'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
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

interface InfantryAccount {
  accountId: number;
  name: string;
  email: string;
  dateCreated: string | null;
  lastAccess: string | null;
  permission: number;
  silenced: boolean;
  aliases: InfantryAlias[];
}

interface CannedQueryMeta {
  key: string;
  label: string;
  description: string;
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

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

type LookupType = 'auto' | 'account' | 'alias' | 'email';

function formatPlaytime(minutes: number): string {
  if (!minutes) return '0h';
  return `${(minutes / 60).toFixed(1)}h`;
}

function resultsToCsv(result: QueryResult): string {
  const escape = (v: string | number | boolean | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns.map(escape).join(','), ...result.rows.map((r) => r.map(escape).join(','))].join('\n');
}

export default function InfantryDbPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [status, setStatus] = useState<DbStatus | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [searchType, setSearchType] = useState<LookupType>('auto');
  const [searching, setSearching] = useState(false);
  const [accounts, setAccounts] = useState<InfantryAccount[] | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [cannedParams, setCannedParams] = useState<Record<string, string>>({});
  const [consoleSql, setConsoleSql] = useState('');
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [resultLabel, setResultLabel] = useState('');

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
        const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
        if (error || !data?.is_admin) {
          toast.error('Unauthorized: Admin access required');
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
      setAccounts((prev) =>
        prev ? prev.map((a) => (a.accountId === account.accountId ? { ...a, email } : a)) : prev
      );
      setEditingId(null);
      toast.success(`Email updated for ${data.accountName}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingEmail(false);
    }
  };

  const runQuery = async (payload: { sql?: string; canned?: string; param?: string }, label: string) => {
    setRunning(payload.canned ?? 'console');
    setResult(null);
    setResultLabel('');
    try {
      const res = await authedFetch('/api/admin/infantry-db/query', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Query failed');
      setResult(data);
      setResultLabel(label);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setRunning(null);
    }
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
      <div className="min-h-screen bg-gray-900">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-32 text-gray-400">Loading...</div>
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-3xl">🗄️</span> Infantry Game Database
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Account &amp; alias lookup, email fixes, and read-only admin queries against the live game DB
            </p>
          </div>
          <div>
            {status === null ? (
              <span className="text-sm text-gray-400">Checking connection...</span>
            ) : status.connected ? (
              <div className="text-right">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-600/20 border border-green-500/30 text-green-300 text-sm">
                  ● Connected — {status.database} ({status.schemaFlavor} schema)
                </span>
                <div className="text-xs text-gray-500 mt-1">
                  {status.counts?.accounts.toLocaleString()} accounts · {status.counts?.aliases.toLocaleString()} aliases
                </div>
              </div>
            ) : (
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/30 text-red-300 text-sm"
                title={status.error}
              >
                ● Not connected — {status.error?.slice(0, 120)}
              </span>
            )}
          </div>
        </div>

        {/* Account lookup */}
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-5 mb-6">
          <h2 className="text-lg font-semibold text-cyan-400 mb-3">🔎 Account Lookup</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Account name, alias, or email..."
              className="flex-1 px-4 py-2 bg-gray-900/70 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as LookupType)}
              className="px-3 py-2 bg-gray-900/70 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="auto">Search everything</option>
              <option value="account">Account name</option>
              <option value="alias">Alias</option>
              <option value="email">Email</option>
            </select>
            <button
              onClick={runSearch}
              disabled={searching}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg font-semibold text-white transition-colors"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {accounts !== null && (
            <div className="mt-4 space-y-4">
              {accounts.length === 0 && <div className="text-gray-400 text-sm">No accounts matched.</div>}
              {accounts.map((account) => (
                <div key={account.accountId} className="bg-gray-900/50 rounded-lg border border-gray-700 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold text-white">{account.name}</span>
                        <span className="text-xs text-gray-500">#{account.accountId}</span>
                        {account.permission > 0 && (
                          <span className="px-2 py-0.5 rounded bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs">
                            perm {account.permission}
                          </span>
                        )}
                        {account.silenced && (
                          <span className="px-2 py-0.5 rounded bg-red-600/20 border border-red-500/30 text-red-300 text-xs">
                            silenced
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Created {account.dateCreated ?? '?'} · Last access {account.lastAccess ?? '?'}
                      </div>
                    </div>
                    <div className="lg:text-right">
                      {editingId === account.accountId ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEmail(account)}
                            className="px-3 py-1.5 bg-gray-900 border border-cyan-500/50 rounded text-sm text-white w-64 focus:outline-none focus:border-cyan-400"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEmail(account)}
                            disabled={savingEmail}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded text-sm font-semibold"
                          >
                            {savingEmail ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 lg:justify-end">
                          <span className={`text-sm ${account.email ? 'text-cyan-300' : 'text-red-400 italic'}`}>
                            {account.email || '(no email)'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingId(account.accountId);
                              setEditEmail(account.email);
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                            title="Edit email"
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {account.aliases.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-700">
                            <th className="py-1.5 pr-4 font-medium">Alias</th>
                            <th className="py-1.5 pr-4 font-medium">Created</th>
                            <th className="py-1.5 pr-4 font-medium">Last Access</th>
                            <th className="py-1.5 pr-4 font-medium">Playtime</th>
                            <th className="py-1.5 pr-4 font-medium">Last IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {account.aliases.map((alias) => (
                            <tr key={alias.aliasId} className="border-b border-gray-800 last:border-0">
                              <td className="py-1.5 pr-4 text-white font-medium">
                                {alias.name}
                                {alias.stealth && <span className="ml-2 text-xs text-gray-500">(stealth)</span>}
                              </td>
                              <td className="py-1.5 pr-4 text-gray-400">{alias.creation ?? '?'}</td>
                              <td className="py-1.5 pr-4 text-gray-400">{alias.lastAccess ?? '?'}</td>
                              <td className="py-1.5 pr-4 text-gray-300">{formatPlaytime(alias.timePlayedMinutes)}</td>
                              <td className="py-1.5 pr-4 text-gray-500 font-mono text-xs">{alias.ip ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Canned queries */}
        <div className="bg-gray-800/50 rounded-xl border border-purple-500/30 p-5 mb-6">
          <h2 className="text-lg font-semibold text-purple-400 mb-3">⚡ Quick Queries</h2>
          {!status?.cannedQueries?.length ? (
            <div className="text-gray-500 text-sm">Available once connected.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {status.cannedQueries.map((canned) => (
                <div key={canned.key} className="bg-gray-900/50 rounded-lg border border-gray-700 p-3 flex flex-col">
                  <div className="font-semibold text-white text-sm">{canned.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 mb-2 flex-1">{canned.description}</div>
                  <div className="flex gap-2">
                    {canned.param && (
                      <input
                        type="text"
                        value={cannedParams[canned.key] ?? ''}
                        onChange={(e) => setCannedParams((p) => ({ ...p, [canned.key]: e.target.value }))}
                        placeholder={canned.param.placeholder}
                        className="flex-1 min-w-0 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
                      />
                    )}
                    <button
                      onClick={() =>
                        runQuery({ canned: canned.key, param: cannedParams[canned.key] }, canned.label)
                      }
                      disabled={running !== null}
                      className="px-3 py-1 bg-purple-600/60 hover:bg-purple-500/60 disabled:opacity-50 rounded text-xs font-semibold"
                    >
                      {running === canned.key ? '...' : 'Run'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SQL console */}
        <div className="bg-gray-800/50 rounded-xl border border-amber-500/30 p-5 mb-6">
          <h2 className="text-lg font-semibold text-amber-400 mb-1">📟 Read-Only SQL Console</h2>
          <p className="text-xs text-gray-500 mb-3">
            Single SELECT statements only — writes are blocked server-side, results capped at 500 rows, queries run
            with READ UNCOMMITTED so they can&apos;t block the game servers.
          </p>
          <textarea
            value={consoleSql}
            onChange={(e) => setConsoleSql(e.target.value)}
            placeholder={'SELECT TOP 10 * FROM Accounts ORDER BY DateCreated DESC'}
            rows={4}
            spellCheck={false}
            className="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-green-300 font-mono text-sm placeholder-gray-700 focus:outline-none focus:border-amber-500"
          />
          <div className="mt-2">
            <button
              onClick={() => runQuery({ sql: consoleSql }, 'Console query')}
              disabled={running !== null || !consoleSql.trim()}
              className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg font-semibold text-white transition-colors"
            >
              {running === 'console' ? 'Running...' : 'Run Query'}
            </button>
          </div>
        </div>

        {/* Shared results table */}
        {result && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-600 p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="text-lg font-semibold text-white">
                {resultLabel}{' '}
                <span className="text-sm font-normal text-gray-400">
                  — {result.rowCount} row{result.rowCount === 1 ? '' : 's'}
                  {result.truncated && ' (capped at 500)'} · {result.ms}ms
                </span>
              </h2>
              <button
                onClick={downloadCsv}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                ⬇ CSV
              </button>
            </div>
            <div className="overflow-x-auto max-h-[32rem] overflow-y-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="text-left text-gray-400">
                    {result.columns.map((col, i) => (
                      <th key={i} className="px-3 py-2 font-medium border-b border-gray-700 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-gray-300 whitespace-nowrap max-w-md truncate">
                          {cell === null ? <span className="text-gray-600 italic">null</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">Query returned no rows.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
