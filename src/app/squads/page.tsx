'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { queries } from '@/utils/dataFetching';

interface SimpleSquad {
  id: string;
  name: string;
  tag: string;
  description: string;
  captain_alias: string;
  member_count: number;
  created_at: string;
  is_active: boolean;
  banner_url?: string;
}

export default function QuickSquadsPage() {
  const { user, loading } = useAuth();
  const [activeSquads, setActiveSquads] = useState<SimpleSquad[]>([]);
  const [inactiveSquads, setInactiveSquads] = useState<SimpleSquad[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSquads();
  }, []);

  const loadSquads = async () => {
    try {
      console.log('⚡ Loading all squads...');
      setDataLoading(true);
      setError(null);

      // Load all squads (both active and inactive) using optimized query
      const { data: squadsData, success } = await queries.getAllSquads();

      if (!success || !squadsData) {
        setError('Failed to load squads');
        return;
      }

      console.log('✅ Loaded', squadsData?.length || 0, 'squads');

      // Get member counts for all squads
      const squadIds = squadsData?.map(s => s.id) || [];
      let memberCounts: Record<string, number> = {};

      if (squadIds.length > 0) {
        const { data: memberData, error: memberError } = await supabase
          .from('squad_members')
          .select('squad_id')
          .in('squad_id', squadIds)
          .eq('status', 'active');

        if (!memberError && memberData) {
          memberCounts = memberData.reduce((acc, member) => {
            acc[member.squad_id] = (acc[member.squad_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        }
      }

      const formattedSquads: SimpleSquad[] = squadsData.map((squad: any) => ({
        id: squad.id,
        name: squad.name,
        tag: squad.tag,
        description: squad.description,
        captain_alias: squad.profiles?.in_game_alias || 'Unknown',
        member_count: memberCounts[squad.id] || 0,
        created_at: squad.created_at,
        is_active: squad.is_active,
        banner_url: squad.banner_url
      }));

      // Separate and sort squads by member count (descending)
      const active = formattedSquads
        .filter(squad => squad.is_active)
        .sort((a, b) => b.member_count - a.member_count);
      
      const inactive = formattedSquads
        .filter(squad => !squad.is_active)
        .sort((a, b) => b.member_count - a.member_count);

      setActiveSquads(active);
      setInactiveSquads(inactive);
      console.log('✅ Squads loading completed:', active.length, 'active,', inactive.length, 'inactive');

    } catch (error) {
      console.error('❌ Exception loading squads:', error);
      setError('Failed to load squads');
    } finally {
      setDataLoading(false);
    }
  };

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto py-8 px-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto mb-6"></div>
            <p className="text-cyan-400 font-mono text-lg">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">🛡️ Squad Management</h1>
          <p className="text-gray-400 text-lg">Form teams, compete together, dominate the battlefield</p>
        </div>

        {/* Anonymous user notice */}
        {!user && (
          <div className="bg-gray-800 rounded-lg p-6 text-center mb-8">
            <h2 className="text-xl font-semibold mb-4">Join the Squad System</h2>
            <p className="text-gray-300 mb-4">Sign in to create or join squads, and manage your team</p>
            <a href="/auth/login" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded inline-block">
              Sign In
            </a>
          </div>
        )}
          
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
              <p className="text-red-400">{error}</p>
              <button 
                onClick={loadSquads}
                className="mt-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {dataLoading ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-6">
                <div className="bg-gray-700 rounded p-4 animate-pulse">
                  <div className="h-5 bg-gray-600 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-600 rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-gray-600 rounded w-1/2"></div>
                </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-8">
            {/* Active Squads Section */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold text-green-400">✅ Active Squads</h2>
                <span className="bg-green-600/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium border border-green-600/30">
                  {activeSquads.length} squads
                </span>
              </div>
              
            <div className="grid gap-4">
                {activeSquads.map((squad: SimpleSquad) => (
                <Link key={squad.id} href={`/squads/${squad.id}`}>
                  <div className="bg-gray-700 rounded-lg overflow-hidden hover:bg-gray-600 transition-colors cursor-pointer">
                    <div className="p-4">
                      <div className="flex gap-4">
                          {/* Squad Banner */}
                          {squad.banner_url && (
                            <div className="w-64 h-48 flex-shrink-0">
                              <img 
                                src={squad.banner_url} 
                                alt={`${squad.name} banner`}
                                className="w-full h-full object-cover rounded border border-gray-600"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold mb-2 text-cyan-400 hover:text-cyan-300 truncate">
                            [{squad.tag}] {squad.name}
                          </h3>
                          
                          <p className="text-gray-300 mb-3 text-sm line-clamp-2">{squad.description}</p>
                          
                          <div className="flex justify-between items-center">
                            <div className="flex gap-4 text-sm text-gray-400">
                              <span className="flex items-center gap-1">
                                👥 {squad.member_count} members
                              </span>
                              <span className="flex items-center gap-1">
                                👑 {squad.captain_alias}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(squad.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
                {activeSquads.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                    No active squads found. Be the first to create one!
                  </div>
                )}
              </div>
            </div>

            {/* Inactive Squads Section */}
            {inactiveSquads.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-2xl font-bold text-red-400">⚠️ Inactive Squads</h2>
                  <span className="bg-red-600/20 text-red-400 px-3 py-1 rounded-full text-sm font-medium border border-red-600/30">
                    {inactiveSquads.length} squads
                  </span>
                </div>
                
                <div className="grid gap-4">
                  {inactiveSquads.map((squad: SimpleSquad) => (
                    <Link key={squad.id} href={`/squads/${squad.id}`}>
                      <div className="bg-gray-700/70 rounded-lg overflow-hidden hover:bg-gray-600/70 transition-colors cursor-pointer opacity-80">
                        <div className="p-4">
                          <div className="flex gap-4">
                            {/* Squad Banner */}
                            {squad.banner_url && (
                              <div className="w-64 h-48 flex-shrink-0">
                                <img 
                                  src={squad.banner_url} 
                                  alt={`${squad.name} banner`}
                                  className="w-full h-full object-cover rounded border border-gray-600 opacity-70"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-semibold text-cyan-400 hover:text-cyan-300 truncate">
                                  [{squad.tag}] {squad.name}
                                </h3>
                                <span className="bg-red-600/20 text-red-400 px-2 py-1 rounded text-xs font-medium border border-red-600/30">
                                  INACTIVE
                                </span>
                              </div>
                              
                              <p className="text-gray-300 mb-3 text-sm line-clamp-2">{squad.description}</p>
                              
                              <div className="flex justify-between items-center">
                                <div className="flex gap-4 text-sm text-gray-400">
                                  <span className="flex items-center gap-1">
                                    👥 {squad.member_count} members
                                  </span>
                                  <span className="flex items-center gap-1">
                                    👑 {squad.captain_alias}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(squad.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                </div>
              )}
            </div>
          )}
      </main>
    </div>
  );
} 