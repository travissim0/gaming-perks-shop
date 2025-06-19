'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface FreeAgentData {
  id: string;
  preferred_roles: string[];
  secondary_roles: string[];
  availability: string;
  availability_days: string[];
  availability_times: Record<string, { start: string; end: string }>;
  skill_level: string;
  class_ratings: Record<string, number>;
  classes_to_try: string[];
  notes: string;
  contact_info: string;
  timezone: string;
}

const CLASS_COLORS = {
  'O INF': 'bg-red-500/20 text-red-300 border-red-500/30',
  'D INF': 'bg-red-500/20 text-red-300 border-red-500/30',
  'O HVY': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'D HVY': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Medic': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'SL': 'bg-green-500/20 text-green-300 border-green-500/30',
  'Foot JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'Pack JT': 'bg-gray-400/20 text-gray-300 border-gray-400/30',
  'Engineer': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Infil': 'bg-purple-500/20 text-purple-300 border-purple-500/30'
};

const CLASS_OPTIONS = ['O INF', 'D INF', 'O HVY', 'D HVY', 'Medic', 'SL', 'Foot JT', 'Pack JT', 'Engineer', 'Infil'];

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago', 
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Australia/Sydney',
  'Asia/Tokyo'
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function UpdateFreeAgentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentData, setCurrentData] = useState<any>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    loadCurrentFreeAgentData();
  }, [user]);

  const loadCurrentFreeAgentData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('free_agents')
        .select('*')
        .eq('player_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentData(data);
      } else {
        toast.error('You are not currently in the free agent pool');
        router.push('/free-agents');
      }
    } catch (error) {
      console.error('Error loading free agent data:', error);
      toast.error('Failed to load your free agent information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            Update Free Agent Information
          </h1>
          <p className="text-gray-300 text-lg">
            Feature coming soon! For now, please contact an admin to update your information.
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-300 mb-4">
            We're working on this feature. In the meantime, you can:
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/free-agents')}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Back to Free Agents
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 