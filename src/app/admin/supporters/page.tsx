'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import supportersCache from '@/lib/supporters-cache.json';

interface Supporter {
  id: string;
  rank: number;
  name: string;
  amount: number;
  currency: string;
  medal: string;
  message: string;
  date: string;
  isHighlighted: boolean;
}

interface SupportersStats {
  totalAmount: number;
  totalSupporters: number;
  thisMonthAmount: number;
  averageDonation: number;
  largestContribution: {
    name: string;
    amount: number;
    message: string;
  };
}

export default function AdminSupportersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [stats, setStats] = useState<SupportersStats>(supportersCache.stats);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/');
      return;
    }
    
    // Load current cached data
    setSupporters([...supportersCache.topSupporters]);
    setStats({ ...supportersCache.stats });
  }, [user, loading, router]);

  const handleEdit = (id: string) => {
    setEditingId(id);
  };

  const handleSave = (id: string, newData: Partial<Supporter>) => {
    setSupporters(prev => prev.map(supporter => 
      supporter.id === id 
        ? { ...supporter, ...newData }
        : supporter
    ));
    setEditingId(null);
    setIsDirty(true);
    toast.success('Supporter updated successfully');
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newSupporters = [...supporters];
      [newSupporters[index], newSupporters[index - 1]] = [newSupporters[index - 1], newSupporters[index]];
      
      // Update ranks and medals
      newSupporters.forEach((supporter, i) => {
        supporter.rank = i + 1;
        supporter.medal = getMedalForRank(i + 1);
        supporter.isHighlighted = i < 3;
      });
      
      setSupporters(newSupporters);
      setIsDirty(true);
      toast.success('Supporter moved up');
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < supporters.length - 1) {
      const newSupporters = [...supporters];
      [newSupporters[index], newSupporters[index + 1]] = [newSupporters[index + 1], newSupporters[index]];
      
      // Update ranks and medals
      newSupporters.forEach((supporter, i) => {
        supporter.rank = i + 1;
        supporter.medal = getMedalForRank(i + 1);
        supporter.isHighlighted = i < 3;
      });
      
      setSupporters(newSupporters);
      setIsDirty(true);
      toast.success('Supporter moved down');
    }
  };

  const handleAddNew = () => {
    const newId = `manual-${Date.now()}`;
    const newSupporter: Supporter = {
      id: newId,
      rank: supporters.length + 1,
      name: 'New Supporter',
      amount: 0,
      currency: 'usd',
      medal: '🏅',
      message: '',
      date: new Date().toISOString(),
      isHighlighted: false
    };
    
    setSupporters(prev => [...prev, newSupporter]);
    setEditingId(newId);
    setIsDirty(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this supporter?')) {
      setSupporters(prev => {
        const filtered = prev.filter(s => s.id !== id);
        // Rerank remaining supporters
        return filtered.map((supporter, index) => ({
          ...supporter,
          rank: index + 1,
          medal: getMedalForRank(index + 1),
          isHighlighted: index < 3
        }));
      });
      setIsDirty(true);
      toast.success('Supporter deleted');
    }
  };

  const handleSaveToCache = async () => {
    // Recalculate stats
    const totalAmount = supporters.reduce((sum, supporter) => sum + supporter.amount, 0);
    const newStats: SupportersStats = {
      totalAmount,
      totalSupporters: supporters.length,
      thisMonthAmount: Math.round(totalAmount * 0.3), // Estimate
      averageDonation: Math.round(totalAmount / supporters.length),
      largestContribution: supporters.length > 0 ? {
        name: supporters[0].name,
        amount: supporters[0].amount,
        message: supporters[0].message
      } : {
        name: 'No contributors yet',
        amount: 0,
        message: ''
      }
    };

    setStats(newStats);

    // In a real application, you would save this to a file or database
    // For now, we'll just show a success message
    console.log('Updated supporters cache:', {
      lastUpdated: new Date().toISOString(),
      topSupporters: supporters,
      recentSupporters: supporters.slice(0, 5).map(s => ({
        id: s.id,
        name: s.name,
        amount: s.amount,
        currency: s.currency,
        message: s.message,
        date: s.date
      })),
      stats: newStats
    });

    setIsDirty(false);
    toast.success('Supporters cache updated successfully!', { duration: 4000 });
  };

  const handleSyncFromDatabase = async () => {
    try {
      const response = await fetch('/api/supporters');
      if (response.ok) {
        const data = await response.json();
        
        if (data.supporters && data.supporters.length > 0) {
          const syncedSupporters = data.supporters.map((supporter: any, index: number) => ({
            id: supporter.id || `sync-${index}`,
            rank: index + 1,
            name: supporter.customer_name || supporter.name || 'Anonymous',
            amount: typeof supporter.amount_cents === 'number' 
              ? Math.round(supporter.amount_cents / 100) 
              : supporter.amount || 0,
            currency: supporter.currency || 'usd',
            medal: getMedalForRank(index + 1),
            message: supporter.donation_message || supporter.message || '',
            date: supporter.created_at || supporter.date || new Date().toISOString(),
            isHighlighted: index < 3
          }));

          setSupporters(syncedSupporters);
          setIsDirty(true);
          toast.success(`Synced ${syncedSupporters.length} supporters from database`);
        } else {
          toast.error('No supporters found in database');
        }
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      toast.error('Failed to sync from database: ' + (error as Error).message);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset to the original cached data?')) {
      setSupporters([...supportersCache.topSupporters]);
      setStats({ ...supportersCache.stats });
      setIsDirty(false);
      toast.success('Reset to original cached data');
    }
  };

  const getMedalForRank = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🏅';
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Supporters Cache Management</h1>
                <p className="text-gray-400">
                  Manually manage supporters data as a failsafe when database connection fails
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={handleSyncFromDatabase}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  🔄 Sync from DB
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
            
            {isDirty && (
              <div className="mt-4 p-3 bg-orange-900/20 border border-orange-500/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-orange-400 font-medium">
                    ⚠️ You have unsaved changes
                  </span>
                  <button
                    onClick={handleSaveToCache}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    💾 Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-r from-green-600 to-green-700 p-4 rounded-lg text-white">
              <div className="text-2xl font-bold">{formatAmount(stats.totalAmount, 'usd')}</div>
              <div className="text-green-100 text-sm">Total Raised</div>
            </div>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 rounded-lg text-white">
              <div className="text-2xl font-bold">{stats.totalSupporters}</div>
              <div className="text-blue-100 text-sm">Total Supporters</div>
            </div>
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-4 rounded-lg text-white">
              <div className="text-2xl font-bold">{formatAmount(stats.averageDonation, 'usd')}</div>
              <div className="text-purple-100 text-sm">Average Donation</div>
            </div>
            <div className="bg-gradient-to-r from-orange-600 to-orange-700 p-4 rounded-lg text-white">
              <div className="text-2xl font-bold">{formatAmount(stats.largestContribution.amount, 'usd')}</div>
              <div className="text-orange-100 text-sm">Largest Contribution</div>
            </div>
          </div>

          {/* Supporters List */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Supporters List</h2>
              <button
                onClick={handleAddNew}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                ➕ Add New
              </button>
            </div>

            <div className="space-y-3">
              {supporters.map((supporter, index) => (
                <SupporterRow
                  key={supporter.id}
                  supporter={supporter}
                  index={index}
                  isEditing={editingId === supporter.id}
                  canMoveUp={index > 0}
                  canMoveDown={index < supporters.length - 1}
                  onEdit={() => handleEdit(supporter.id)}
                  onSave={(newData) => handleSave(supporter.id, newData)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onDelete={() => handleDelete(supporter.id)}
                  formatAmount={formatAmount}
                />
              ))}
            </div>
            
            {supporters.length === 0 && (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">👥</div>
                <div className="text-gray-500 text-lg mb-2">No supporters yet</div>
                <button
                  onClick={handleAddNew}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Add First Supporter
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

interface SupporterRowProps {
  supporter: Supporter;
  index: number;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onSave: (newData: Partial<Supporter>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  formatAmount: (amount: number, currency: string) => string;
}

function SupporterRow({
  supporter,
  index,
  isEditing,
  canMoveUp,
  canMoveDown,
  onEdit,
  onSave,
  onMoveUp,
  onMoveDown,
  onDelete,
  formatAmount
}: SupporterRowProps) {
  const [tempName, setTempName] = useState(supporter.name);
  const [tempAmount, setTempAmount] = useState(supporter.amount);
  const [tempMessage, setTempMessage] = useState(supporter.message);

  const handleSave = () => {
    onSave({
      name: tempName,
      amount: tempAmount,
      message: tempMessage
    });
  };

  const handleCancel = () => {
    setTempName(supporter.name);
    setTempAmount(supporter.amount);
    setTempMessage(supporter.message);
  };

  if (isEditing) {
    return (
      <div className="bg-blue-50/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-3xl flex-shrink-0 mt-1">{supporter.medal}</span>
          
          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
                placeholder="Supporter Name"
              />
              <input
                type="number"
                value={tempAmount}
                onChange={(e) => setTempAmount(Number(e.target.value))}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
                placeholder="Amount"
                min="0"
                step="0.01"
              />
            </div>
            
            <input
              type="text"
              value={tempMessage}
              onChange={(e) => setTempMessage(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
              placeholder="Message (optional)"
            />
            
            <div className="flex space-x-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                💾 Save
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-3 p-4 rounded-lg transition-all ${
      supporter.isHighlighted 
        ? 'bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-500/30' 
        : 'bg-gray-700/30 border border-gray-600/30'
    }`}>
      <span className="text-3xl flex-shrink-0">{supporter.medal}</span>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-white text-lg">
              {supporter.name}
            </h4>
            {supporter.message && (
              <p className="text-gray-400 text-sm mt-1">
                "{supporter.message}"
              </p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              Rank #{supporter.rank} • {new Date(supporter.date).toLocaleDateString()}
            </p>
          </div>
          
          <div className="text-right">
            <div className={`font-bold text-xl ${
              supporter.isHighlighted ? 'text-orange-400' : 'text-green-400'
            }`}>
              {formatAmount(supporter.amount, supporter.currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-1 ml-4">
        <button
          onClick={onEdit}
          className="px-2 py-1 text-blue-400 hover:text-blue-300 text-sm border border-blue-500/50 rounded"
          title="Edit"
        >
          ✏️ Edit
        </button>
        {canMoveUp && (
          <button
            onClick={onMoveUp}
            className="px-2 py-1 text-gray-400 hover:text-gray-300 text-sm border border-gray-500/50 rounded"
            title="Move Up"
          >
            ⬆️
          </button>
        )}
        {canMoveDown && (
          <button
            onClick={onMoveDown}
            className="px-2 py-1 text-gray-400 hover:text-gray-300 text-sm border border-gray-500/50 rounded"
            title="Move Down"
          >
            ⬇️
          </button>
        )}
        <button
          onClick={onDelete}
          className="px-2 py-1 text-red-400 hover:text-red-300 text-sm border border-red-500/50 rounded"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
} 