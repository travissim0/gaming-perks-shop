'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase, getServiceSupabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface LaunchSignup {
  id: string;
  email: string;
  in_game_alias: string | null;
  notify_by_email: boolean;
  ip_address: string | null;
  created_at: string;
}

export default function AdminLaunchSignups() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [signups, setSignups] = useState<LaunchSignup[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
      return;
    }

    const checkAdmin = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single();

        if (error || !data || !data.is_admin) {
          router.push('/dashboard');
          toast.error('Unauthorized: Admin access required');
          return;
        }

        setIsAdmin(true);
        fetchSignups();
      }
    };

    checkAdmin();
  }, [user, loading, router]);

  const fetchSignups = async () => {
    try {
      setLoadingData(true);
      const res = await fetch('/api/admin/launch-signups', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (!res.ok) {
        toast.error('Failed to fetch signups');
        return;
      }

      const data = await res.json();
      setSignups(data.signups || []);
    } catch (error) {
      console.error('Failed to fetch signups:', error);
      toast.error('Failed to load signups');
    } finally {
      setLoadingData(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Email', 'In-Game Alias', 'Notify', 'Signed Up'];
    const rows = filteredSignups.map(s => [
      s.email,
      s.in_game_alias || '',
      s.notify_by_email ? 'Yes' : 'No',
      new Date(s.created_at).toLocaleString(),
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infantry2-signups-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remove signup for ${email}?`)) return;

    try {
      const res = await fetch('/api/admin/launch-signups', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setSignups(prev => prev.filter(s => s.id !== id));
        toast.success('Signup removed');
      } else {
        toast.error('Failed to remove signup');
      }
    } catch {
      toast.error('Failed to remove signup');
    }
  };

  const filteredSignups = signups.filter(s =>
    s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.in_game_alias?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />

      <main className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-gray-400 hover:text-gray-200 text-sm mb-2 inline-block">
              &larr; Back to Admin
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              Infantry 2 Launch Signups
              <span className="text-sm font-normal text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
                {signups.length} total
              </span>
            </h1>
          </div>
          <button
            onClick={handleExportCSV}
            disabled={signups.length === 0}
            className="px-4 py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Total Signups</div>
            <div className="text-2xl font-bold text-white">{signups.length}</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm">With Alias</div>
            <div className="text-2xl font-bold text-purple-400">
              {signups.filter(s => s.in_game_alias).length}
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Want Email Notification</div>
            <div className="text-2xl font-bold text-cyan-400">
              {signups.filter(s => s.notify_by_email).length}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by email or alias..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-80 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Table */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          {loadingData ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
            </div>
          ) : filteredSignups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {searchTerm ? 'No signups match your search' : 'No signups yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-left">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">In-Game Alias</th>
                    <th className="px-4 py-3 font-medium">Notify</th>
                    <th className="px-4 py-3 font-medium">Signed Up</th>
                    <th className="px-4 py-3 font-medium">IP</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSignups.map((signup, idx) => (
                    <tr key={signup.id} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                      <td className="px-4 py-3 text-white font-medium">{signup.email}</td>
                      <td className="px-4 py-3 text-purple-300">
                        {signup.in_game_alias || <span className="text-gray-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {signup.notify_by_email ? (
                          <span className="text-green-400 text-xs bg-green-400/10 px-2 py-0.5 rounded">Yes</span>
                        ) : (
                          <span className="text-gray-500 text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(signup.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{signup.ip_address || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(signup.id, signup.email)}
                          className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
