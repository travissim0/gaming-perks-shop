import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Navbar({ user }: { user: any }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b-2 border-cyan-500 shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="text-cyan-400 text-xl font-bold tracking-wider">
              🏁 CTFPL
            </div>
            
            {user && (
              <div className="flex items-center space-x-1">
                <Link 
                  href="/" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">🏠 Home</span>
                </Link>
                <Link 
                  href="/dashboard" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">📊 Dashboard</span>
                </Link>
                <Link 
                  href="/perks" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">🛍️ Browse Perks</span>
                </Link>
                <Link 
                  href="/patch-notes" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">📋 Patch Notes</span>
                </Link>
                <Link 
                  href="/squads" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">👥 Squads</span>
                </Link>
                <Link 
                  href="/matches" 
                  className="nav-link group px-4 py-2 text-gray-300 hover:text-cyan-400 transition-all duration-300 border border-transparent hover:border-cyan-500 rounded font-medium tracking-wide"
                >
                  <span className="group-hover:text-shadow-glow">⚔️ Matches</span>
                </Link>
                {isAdmin && (
                  <Link 
                    href="/admin/donations" 
                    className="nav-link group px-4 py-2 text-gray-300 hover:text-yellow-400 transition-all duration-300 border border-transparent hover:border-yellow-500 rounded font-medium tracking-wide"
                  >
                    <span className="group-hover:text-shadow-glow">💰 Admin Donations</span>
                  </Link>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {user && (
              <Link 
                href="/donate" 
                className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-4 py-2 rounded border border-yellow-500 hover:border-yellow-400 transition-all duration-300 font-bold tracking-wide shadow-lg hover:shadow-yellow-500/25"
              >
                💰 Donate
              </Link>
            )}
            {user ? (
              <button
                onClick={handleSignOut}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 py-2 rounded border border-red-500 hover:border-red-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-red-500/25"
              >
                Sign Out
              </button>
            ) : (
              <>
                <Link 
                  href="/auth/login" 
                  className="text-gray-300 hover:text-cyan-400 transition-colors duration-300 font-medium tracking-wide"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-2 rounded border border-cyan-500 hover:border-cyan-400 transition-all duration-300 font-medium tracking-wide shadow-lg hover:shadow-cyan-500/25"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
} 