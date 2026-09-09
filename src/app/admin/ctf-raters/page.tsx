'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface Rater {
  user_id: string;
  in_game_alias: string;
  note: string | null;
  created_at: string;
}

interface SearchResult {
  id: string;
  in_game_alias: string;
  email: string | null;
}

export default function CtfRatersAdminPage() {
  const { user } = useAuth();

  const [raters, setRaters] = useState<Rater[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, []);

  const loadRaters = useCallback(async () => {
    try {
      const res = await fetch('/api/ctf/ratings/raters', { headers: await authHeaders() });
      if (res.status === 403 || res.status === 401) {
        setDenied(true);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setRaters(json.raters || []);
        setDenied(false);
      }
    } catch {
      toast.error('Could not load raters');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadRaters();
  }, [loadRaters, user]);

  const search = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/ctf/ratings/raters?q=${encodeURIComponent(query.trim())}`, {
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (json.success) setResults(json.results || []);
    } catch {
      toast.error('Search failed');
    }
  };

  const grant = async (r: SearchResult) => {
    setBusy(true);
    try {
      const res = await fetch('/api/ctf/ratings/raters', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: r.id }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${r.in_game_alias} can now rate`);
        setQuery('');
        setResults([]);
        await loadRaters();
      } else {
        toast.error(json.error || 'Grant failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (r: Rater) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/ctf/ratings/raters?userId=${encodeURIComponent(r.user_id)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Revoked ${r.in_game_alias}`);
        await loadRaters();
      } else {
        toast.error(json.error || 'Revoke failed');
      }
    } finally {
      setBusy(false);
    }
  };

  if (denied) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-xl font-bold text-gray-200">Admin access required</h1>
          <p className="text-gray-500 text-sm mt-2">
            Only site admins and CTF admins can manage rater access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-gray-800/50 rounded-xl border border-cyan-500/30 p-5">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
            CTF Raters
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Who can see and vote on{' '}
            <Link href="/league/community-ratings" className="text-cyan-400 hover:underline">
              Community Ratings
            </Link>
            . Site admins and CTF admins already qualify and do not need a grant.
          </p>
          <p className="text-gray-600 text-xs mt-2">
            A grant is permission to vote, not a staff role — it carries no other access and
            appears nowhere else on the site.
          </p>
        </div>

        {/* Grant */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-5">
          <h2 className="font-bold text-gray-200 mb-3">Grant access</h2>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search by in-game alias…"
              className="flex-1 bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={search}
              className="px-4 py-2 rounded-lg bg-cyan-600/80 hover:bg-cyan-600 text-white text-sm font-semibold transition-colors"
            >
              Search
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-3 space-y-1">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-700/50"
                >
                  <span className="text-gray-200 text-sm">{r.in_game_alias}</span>
                  <button
                    onClick={() => grant(r)}
                    disabled={busy}
                    className="px-3 py-1 rounded bg-green-600/70 hover:bg-green-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Grant
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Current raters */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700/60">
            <h2 className="font-bold text-gray-200">
              Current raters{' '}
              <span className="text-gray-500 font-normal text-sm">({raters.length})</span>
            </h2>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : raters.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              No grants yet. Admins can already view and vote.
            </div>
          ) : (
            <div className="divide-y divide-gray-700/40">
              {raters.map((r) => (
                <div key={r.user_id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-gray-200 text-sm">{r.in_game_alias}</div>
                    <div className="text-gray-600 text-xs">
                      granted {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(r)}
                    disabled={busy}
                    className="px-3 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center">
          Revoking stops future votes; past votes stay on record. Because every vote stores the
          ratings in force at the time, the whole board can be replayed without a given voter if
          it ever needs to be.
        </p>
      </div>
    </div>
  );
}
