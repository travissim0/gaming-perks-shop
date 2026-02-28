'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import FreeAgentJoinForm, { FreeAgentFormData } from '@/components/FreeAgentJoinForm';

export default function UpdateFreeAgentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentData, setCurrentData] = useState<Partial<FreeAgentFormData> | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
      return;
    }
    if (user) {
      loadCurrentFreeAgentData();
    }
  }, [user, authLoading]);

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
        setCurrentData({
          preferred_roles: data.preferred_roles || [],
          secondary_roles: data.secondary_roles || [],
          availability: data.availability || '',
          availability_days: data.availability_days || [],
          availability_times: data.availability_times || {},
          skill_level: data.skill_level || 'intermediate',
          class_ratings: data.class_ratings || {},
          classes_to_try: data.classes_to_try || [],
          notes: data.notes || '',
          contact_info: data.contact_info || '',
          timezone: data.timezone || 'America/New_York',
        });
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

  const handleUpdate = async (formData: FreeAgentFormData) => {
    if (!user) return;
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again.');
        return;
      }

      const response = await fetch('/api/free-agents/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update');
      }

      toast.success('Free agent info updated successfully!');
      router.push('/free-agents');
    } catch (error: any) {
      console.error('Error updating free agent info:', error);
      toast.error(error.message || 'Failed to update free agent info');
    } finally {
      setUpdating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      </div>
    );
  }

  if (!currentData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-400 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <FreeAgentJoinForm
      onSubmit={handleUpdate}
      onCancel={() => router.push('/free-agents')}
      initialData={currentData}
      submitLabel={updating ? 'Updating...' : 'Update Free Agent Info'}
    />
  );
}
