'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import { useDonationMode, DonationMode } from '@/hooks/useDonationMode';

interface DonationModeStatus {
  currentMode: DonationMode;
  databaseStatus: 'connected' | 'error' | 'connection_failed' | 'unknown';
  donationCount: number;
  kofiWebhookStatus: 'working' | 'no_recent_data' | 'unknown';
  modes: Record<string, string>;
}

export default function AdminDonationManagerPage() {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<DonationModeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<DonationMode>('auto');
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Use the donation mode hook for testing
  const { 
    donations: testDonations, 
    mode: currentMode, 
    isLoading: donationsLoading,
    error: donationsError,
    isUsingCache,
    refreshData,
    setMode 
  } = useDonationMode('recent-donations', 5);

  useEffect(() => {
    if (!loading && !user) {
      return;
    }

    fetchStatus();
  }, [user, loading]);

  const fetchStatus = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session');
      }

      const response = await fetch('/api/admin/donation-mode', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          setIsAdmin(false);
          return;
        }
        throw new Error('Failed to fetch donation mode status');
      }

      const data = await response.json();
      setStatus(data);
      setSelectedMode(data.currentMode || 'auto');
      setIsAdmin(true);
    } catch (error) {
      console.error('Error fetching donation mode status:', error);
      toast.error('Failed to load admin panel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = async (newMode: DonationMode) => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session');
      }

      const response = await fetch('/api/admin/donation-mode', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'set_mode', mode: newMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to set donation mode');
      }

      const data = await response.json();
      setSelectedMode(newMode);
      setMode(newMode); // Update the hook
      toast.success(data.message);
      
      // Refresh test data
      await refreshData();
      
    } catch (error) {
      console.error('Error setting donation mode:', error);
      toast.error('Failed to update donation mode');
    }
  };

  const handleSyncDatabase = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session');
      }

      const response = await fetch('/api/admin/donation-mode', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'sync_database' }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message);
        
        if (data.donations && data.donations.length > 0) {
          console.log('Recent donations from database:', data.donations);
        }
        
        // Refresh status and test data
        await fetchStatus();
        await refreshData();
      } else {
        toast.error(data.error || 'Database sync failed');
      }
      
    } catch (error) {
      console.error('Error syncing database:', error);
      toast.error('Failed to sync database');
    }
  };

  const handleTestKofiWebhook = async () => {
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session');
      }

      const response = await fetch('/api/admin/donation-mode', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'test_kofi_webhook' }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message);
        
        if (data.recentKofiDonations && data.recentKofiDonations.length > 0) {
          console.log('Recent Ko-Fi donations:', data.recentKofiDonations);
          
          // Check if the $121 donation is there
          const largeDonation = data.recentKofiDonations.find((d: any) => d.amount >= 121);
          if (largeDonation) {
            toast.success(`Found your $${largeDonation.amount} Ko-Fi donation from ${largeDonation.name}!`, {
              duration: 5000
            });
          } else {
            toast('No $121 donation found in recent Ko-Fi webhook data. Check webhook settings.', {
              duration: 8000,
              icon: '⚠️'
            });
          }
        } else {
          toast.error('No Ko-Fi donations found in database. Webhook may not be working.', {
            duration: 6000
          });
        }
      } else {
        toast.error(data.error || 'Ko-Fi webhook test failed');
      }
      
    } catch (error) {
      console.error('Error testing Ko-Fi webhook:', error);
      toast.error('Failed to test Ko-Fi webhook');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-white">Loading admin panel...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="bg-red-600/20 border border-red-500/50 rounded-lg p-6">
            <h1 className="text-xl font-bold text-red-400 mb-2">Access Denied</h1>
            <p className="text-gray-300">Admin access required to view this page.</p>
          </div>
        </main>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'working':
        return 'text-green-400';
      case 'error':
      case 'connection_failed':
        return 'text-red-400';
      case 'no_recent_data':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'working':
        return '✅';
      case 'error':
      case 'connection_failed':
        return '❌';
      case 'no_recent_data':
        return '⚠️';
      default:
        return '❓';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Donation Manager</h1>
          <p className="text-gray-400">
            Control how donations are displayed across your site and troubleshoot issues
          </p>
        </div>

        {/* Status Overview */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">Database Status</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getStatusIcon(status.databaseStatus)}</span>
                <span className={`font-medium ${getStatusColor(status.databaseStatus)}`}>
                  {status.databaseStatus.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                {status.donationCount} donations found
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">Ko-Fi Webhook</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getStatusIcon(status.kofiWebhookStatus)}</span>
                <span className={`font-medium ${getStatusColor(status.kofiWebhookStatus)}`}>
                  {status.kofiWebhookStatus.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                Recent Ko-Fi integration status
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-2">Current Mode</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl">
                  {isUsingCache ? '💾' : '🗄️'}
                </span>
                <span className="font-medium text-cyan-400">
                  {selectedMode.toUpperCase()}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                {isUsingCache ? 'Using cached data' : 'Using database data'}
              </p>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Donation Display Mode</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {['auto', 'database', 'cache'].map((mode) => (
              <label
                key={mode}
                className={`
                  cursor-pointer rounded-lg p-4 border transition-colors
                  ${selectedMode === mode 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-gray-600 hover:border-gray-500'
                  }
                `}
              >
                <input
                  type="radio"
                  name="donationMode"
                  value={mode}
                  checked={selectedMode === mode}
                  onChange={(e) => setSelectedMode(e.target.value as DonationMode)}
                  className="sr-only"
                />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">
                    {mode === 'auto' ? '🔄' : mode === 'database' ? '🗄️' : '💾'}
                  </span>
                  <span className="font-semibold text-white capitalize">{mode}</span>
                </div>
                <p className="text-gray-400 text-sm">
                  {mode === 'auto' && 'Try database first, fallback to cache'}
                  {mode === 'database' && 'Database only (may show errors)'}
                  {mode === 'cache' && 'Cached data only (always works)'}
                </p>
              </label>
            ))}
          </div>

          <button
            onClick={() => handleModeChange(selectedMode)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Apply Mode Change
          </button>
        </div>

        {/* Actions */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Troubleshooting Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={handleSyncDatabase}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>🔄</span>
              Sync Database
            </button>

            <button
              onClick={handleTestKofiWebhook}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>☕</span>
              Test Ko-Fi Webhook
            </button>

            <button
              onClick={() => refreshData()}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>🔃</span>
              Refresh Test Data
            </button>
          </div>
        </div>

        {/* Test Data Preview */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Live Test Data Preview</h2>
          
          {donationsLoading ? (
            <div className="text-gray-400">Loading test data...</div>
          ) : donationsError ? (
            <div className="bg-red-600/20 border border-red-500/50 rounded p-4 mb-4">
              <p className="text-red-400 font-medium">Error: {donationsError}</p>
            </div>
          ) : null}

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-400">
                Data Source: 
              </span>
              <span className={`text-sm px-2 py-1 rounded ${
                isUsingCache 
                  ? 'bg-yellow-600/20 text-yellow-400' 
                  : 'bg-green-600/20 text-green-400'
              }`}>
                {isUsingCache ? 'Cache' : 'Database'}
              </span>
            </div>
          </div>

          {testDonations.length > 0 ? (
            <div className="space-y-3">
              {testDonations.map((donation, index) => (
                <div key={donation.id} className="bg-gray-700/50 rounded p-4 border border-gray-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-white font-medium">{donation.customerName}</p>
                      <p className="text-gray-400 text-sm">{donation.message || 'No message'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-cyan-400 font-bold">
                        ${donation.amount.toFixed(2)} {donation.currency.toUpperCase()}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {new Date(donation.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 py-8 text-center">
              No donation data available in current mode
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mt-8">
          <h2 className="text-xl font-bold text-white mb-4">Troubleshooting Guide</h2>
          
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="font-semibold text-white mb-2">Missing $121 Ko-Fi Donation</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Click "Test Ko-Fi Webhook" to check if the donation is in the database</li>
                <li>Verify Ko-Fi webhook URL is set to: <code className="bg-gray-700 px-1 rounded">https://freeinf.org/api/kofi-webhook</code></li>
                <li>Check Ko-Fi dashboard for webhook delivery status</li>
                <li>Ensure KOFI_VERIFICATION_TOKEN matches in your environment</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-2">Database Connection Issues</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Click "Sync Database" to test connectivity</li>
                <li>Switch to "Cache" mode for immediate fallback</li>
                <li>Use "Auto" mode for best user experience (tries database, falls back to cache)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-2">Site-wide Impact</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>Auto Mode:</strong> Recommended for production - shows database data when available, cache when not</li>
                <li><strong>Database Mode:</strong> Use for testing - will show errors if database is down</li>
                <li><strong>Cache Mode:</strong> Emergency fallback - always shows cached data</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 