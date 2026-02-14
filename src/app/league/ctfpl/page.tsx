'use client';

import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { CTFPLStandingsContent } from '@/components/league/CTFPLStandingsContent';

export default function CTFPLStandingsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <>
        <Navbar user={user} />
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading CTFPL Standings...</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar user={user} />
      <CTFPLStandingsContent />
    </>
  );
}
