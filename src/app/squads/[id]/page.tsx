'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface SquadMember {
  id: string;
  player_id: string;
  in_game_alias: string;
  role: 'captain' | 'co_captain' | 'player';
  joined_at: string;
}

interface Squad {
  id: string;
  name: string;
  tag: string;
  description: string;
  discord_link?: string;
  website_link?: string;
  captain_id: string;
  created_at: string;
  members: SquadMember[];
}

export default function SquadDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const squadId = params.id as string;
  const [squad, setSquad] = useState<Squad | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (squadId) {
      fetchSquadDetails();
    }
  }, [squadId]);

  const fetchSquadDetails = async () => {
    try {
      setPageLoading(true);
      
      // Get squad details
      const { data: squadData, error: squadError } = await supabase
        .from('squads')
        .select('*')
        .eq('id', squadId)
        .eq('is_active', true)
        .single();

      if (squadError) {
        console.error('Error fetching squad:', squadError);
        return;
      }

      if (!squadData) {
        return;
      }

      // Get squad members
      const { data: members, error: membersError } = await supabase
        .from('squad_members')
        .select(`
          id,
          player_id,
          role,
          joined_at,
          profiles!squad_members_player_id_fkey(in_game_alias)
        `)
        .eq('squad_id', squadId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      if (membersError) {
        console.error('Error fetching squad members:', membersError);
        return;
      }

      const formattedSquad: Squad = {
        ...squadData,
        members: members?.map((member: any) => ({
          id: member.id,
          player_id: member.player_id,
          in_game_alias: member.profiles?.in_game_alias || 'Unknown',
          role: member.role,
          joined_at: member.joined_at
        })) || []
      };

      setSquad(formattedSquad);
    } catch (error) {
      console.error('Error fetching squad details:', error);
    } finally {
      setPageLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'captain': return '👑';
      case 'co_captain': return '⭐';
      default: return '🎮';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'captain': return 'text-yellow-400';
      case 'co_captain': return 'text-blue-400';
      default: return 'text-gray-300';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'captain': return 'Captain';
      case 'co_captain': return 'Co-Captain';
      default: return 'Player';
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (!squad) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="max-w-7xl mx-auto p-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Squad Not Found</h1>
            <p className="text-gray-400 mb-6">The squad you're looking for doesn't exist or has been disbanded.</p>
            <Link href="/squads" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded">
              Back to Squads
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/squads" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-2">
            ← Back to Squads
          </Link>
        </div>

        {/* Squad Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">
                [{squad.tag}] {squad.name}
              </h1>
              <p className="text-gray-300 mb-4">{squad.description}</p>
              <div className="flex gap-4 text-sm text-gray-400">
                <span>Members: {squad.members.length}</span>
                <span>Created: {new Date(squad.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-4 mt-4">
                {squad.discord_link && (
                  <a 
                    href={squad.discord_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                  >
                    💬 Discord
                  </a>
                )}
                {squad.website_link && (
                  <a 
                    href={squad.website_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                  >
                    🌐 Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Squad Members */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">Squad Members ({squad.members.length})</h2>
          
          <div className="grid gap-4">
            {squad.members
              .sort((a, b) => {
                // Sort by role priority: captain, co_captain, then players
                const roleOrder = { captain: 0, co_captain: 1, player: 2 };
                const aOrder = roleOrder[a.role] || 3;
                const bOrder = roleOrder[b.role] || 3;
                if (aOrder !== bOrder) return aOrder - bOrder;
                // Then by join date
                return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
              })
              .map((member) => (
                <div key={member.id} className="bg-gray-700 rounded p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getRoleIcon(member.role)}</span>
                    <div>
                      <span className={`font-semibold text-lg ${getRoleColor(member.role)}`}>
                        {member.in_game_alias}
                      </span>
                      <div className="text-sm text-gray-400">
                        {getRoleDisplayName(member.role)} • Joined {new Date(member.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {squad.members.length === 0 && (
            <div className="text-center py-8">
              <div className="text-gray-500">No members found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 