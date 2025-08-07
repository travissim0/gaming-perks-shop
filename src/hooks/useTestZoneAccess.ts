import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useTestZoneAccess(userId: string | undefined) {
  const [hasTestZoneAccess, setHasTestZoneAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkTestZoneAccess() {
      if (!userId) {
        setHasTestZoneAccess(false);
        setLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        
        if (!token) {
          setHasTestZoneAccess(false);
          setLoading(false);
          return;
        }

        const response = await fetch('/api/user-zone-control', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setHasTestZoneAccess(data.zones && data.zones.length > 0);
        } else {
          setHasTestZoneAccess(false);
        }
      } catch (error) {
        console.error('Error checking test zone access:', error);
        setHasTestZoneAccess(false);
      } finally {
        setLoading(false);
      }
    }

    checkTestZoneAccess();
  }, [userId]);

  return { hasTestZoneAccess, loading };
}
