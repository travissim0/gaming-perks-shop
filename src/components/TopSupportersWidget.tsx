'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

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

interface TopSupportersWidgetProps {
  showAdminControls?: boolean;
  maxSupporters?: number;
  className?: string;
  compact?: boolean;
}

export default function TopSupportersWidget({
  showAdminControls = false,
  maxSupporters = 10,
  className = "",
  compact = false
}: TopSupportersWidgetProps) {
  const { user } = useAuth();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSupporterId, setEditingSupporterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getMedalForRank = (rank: number): string => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🏅';
    }
  };

  useEffect(() => {
    const fetchSupporters = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/supporters');
        const data = await response.json();
        
        if (data.topSupporters) {
          // Map API response to component format
          const formattedSupporters = data.topSupporters.slice(0, maxSupporters).map((supporter: any, index: number) => ({
            id: supporter.latestContribution?.id || `supporter-${index}`,
            rank: index + 1,
            name: supporter.name,
            amount: supporter.totalAmount,
            currency: 'usd',
            medal: getMedalForRank(index + 1),
            message: supporter.latestContribution?.message || '',
            date: supporter.latestContribution?.created_at || new Date().toISOString(),
            isHighlighted: false
          }));
          setSupporters(formattedSupporters);
        }
      } catch (error) {
        console.error('Failed to fetch supporters:', error);
        // Fallback to empty array on error
        setSupporters([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSupporters();
  }, [maxSupporters]);

  const isAdmin = user?.role === 'admin';

  const handleEdit = (supporterId: string) => {
    setEditingSupporterId(supporterId);
    setIsEditing(true);
  };

  const handleSave = (supporterId: string, newData: Partial<Supporter>) => {
    setSupporters(prev => prev.map(supporter => 
      supporter.id === supporterId 
        ? { ...supporter, ...newData }
        : supporter
    ));
    setEditingSupporterId(null);
    setIsEditing(false);
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newSupporters = [...supporters];
      [newSupporters[index], newSupporters[index - 1]] = [newSupporters[index - 1], newSupporters[index]];
      // Update ranks
      newSupporters.forEach((supporter, i) => {
        supporter.rank = i + 1;
        supporter.medal = getMedalForRank(i + 1);
      });
      setSupporters(newSupporters);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < supporters.length - 1) {
      const newSupporters = [...supporters];
      [newSupporters[index], newSupporters[index + 1]] = [newSupporters[index + 1], newSupporters[index]];
      // Update ranks
      newSupporters.forEach((supporter, i) => {
        supporter.rank = i + 1;
        supporter.medal = getMedalForRank(i + 1);
      });
      setSupporters(newSupporters);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  return (
    <div className={`bg-gray-900/60 backdrop-blur-sm border border-purple-500/15 rounded-xl overflow-hidden relative ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800/80 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-gradient-to-b from-purple-400 via-pink-400 to-amber-400 rounded-full" />
            <h3 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-400 uppercase tracking-wider">
              Top Supporters
            </h3>
          </div>

          {isAdmin && showAdminControls && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                isEditing
                  ? 'bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30'
                  : 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30'
              }`}
            >
              {isEditing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-gray-500 text-sm">Loading supporters...</div>
            </div>
          ) : supporters.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-gray-500 text-sm">No supporters found</div>
            </div>
          ) : (
            supporters.map((supporter, index) => (
            <SupporterRow
              key={supporter.id}
              supporter={supporter}
              index={index}
              isEditing={isEditing && editingSupporterId === supporter.id}
              isAdmin={isAdmin && showAdminControls}
              canMoveUp={index > 0}
              canMoveDown={index < supporters.length - 1}
              onEdit={() => handleEdit(supporter.id)}
              onSave={(newData) => handleSave(supporter.id, newData)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              formatAmount={formatAmount}
              compact={compact}
            />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface SupporterRowProps {
  supporter: Supporter;
  index: number;
  isEditing: boolean;
  isAdmin: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  compact?: boolean;
  onEdit: () => void;
  onSave: (newData: Partial<Supporter>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  formatAmount: (amount: number, currency: string) => string;
}

function SupporterRow({
  supporter,
  index,
  isEditing,
  isAdmin,
  canMoveUp,
  canMoveDown,
  onEdit,
  onSave,
  onMoveUp,
  onMoveDown,
  formatAmount,
  compact = false
}: SupporterRowProps) {
  const [tempName, setTempName] = useState(supporter.name);
  const [tempAmount, setTempAmount] = useState(supporter.amount);
  const [tempMessage, setTempMessage] = useState(supporter.message);

  // Cascading styling arrays matching the space theme
  const trophyIcons = ['🥇', '🥈', '🥉'];
  const trophyColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
  const nameTextSizes = ['text-lg', 'text-base', 'text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs', 'text-xs'];
  const amountTextSizes = ['text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs', 'text-xs', 'text-xs', 'text-xs'];
  const paddingSizes = ['p-3', 'p-2.5', 'p-2.5', 'p-2', 'p-2', 'p-2', 'p-1.5', 'p-1.5'];
  const cardThemes = [
    'bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-yellow-500/30 shadow-yellow-500/10', // Gold
    'bg-gradient-to-br from-gray-600/20 to-gray-500/10 border-gray-400/30 shadow-gray-400/10',       // Silver
    'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-600/30 shadow-amber-600/10',    // Bronze
    'bg-gradient-to-br from-blue-900/15 to-blue-800/10 border-blue-500/20 shadow-blue-500/10',        // 4th
    'bg-gradient-to-br from-purple-900/15 to-purple-800/10 border-purple-500/20 shadow-purple-500/10', // 5th
    'bg-gradient-to-br from-cyan-900/15 to-cyan-800/10 border-cyan-500/20 shadow-cyan-500/10',        // 6th
    'bg-gradient-to-br from-gray-800/15 to-gray-800/10 border-gray-600/20',                           // Lower ranks
    'bg-gradient-to-br from-gray-800/10 to-gray-900/10 border-gray-700/15'                            // Lowest ranks
  ];

  const rankIndex = Math.min(index, cardThemes.length - 1);

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
      <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/20 border border-blue-500/50 rounded-lg p-4 backdrop-blur-sm shadow-lg">
        <div className="flex items-start space-x-3">
          <div className="text-9xl opacity-15 absolute inset-0 flex items-center justify-center pointer-events-none">
            {supporter.medal}
          </div>
          <span className="text-3xl flex-shrink-0 mt-1 relative z-10">{supporter.medal}</span>
          
          <div className="flex-1 space-y-3 relative z-10">
            <div className="flex space-x-2">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800/70 border border-blue-500/50 rounded text-cyan-200 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/50 transition-colors"
                placeholder="Name"
              />
              <input
                type="number"
                value={tempAmount}
                onChange={(e) => setTempAmount(Number(e.target.value))}
                className="w-24 px-3 py-2 bg-gray-800/70 border border-blue-500/50 rounded text-cyan-200 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/50 transition-colors"
                placeholder="Amount"
              />
            </div>
            
            <input
              type="text"
              value={tempMessage}
              onChange={(e) => setTempMessage(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800/70 border border-blue-500/50 rounded text-cyan-200 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/50 transition-colors"
              placeholder="Message"
            />
            
            <div className="flex space-x-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded hover:from-green-500 hover:to-green-400 transition-all duration-300 shadow-lg"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-500 text-white rounded hover:from-gray-500 hover:to-gray-400 transition-all duration-300 shadow-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compact mode - single line with inline message
  if (compact) {
    const compactColors = ['text-yellow-400', 'text-gray-300', 'text-amber-500', 'text-blue-400', 'text-purple-400'];
    const compactBorders = [
      'border-yellow-500/30',
      'border-gray-400/30',
      'border-amber-500/30',
      'border-blue-500/20',
      'border-purple-500/20',
      'border-cyan-500/20',
      'border-gray-500/20',
      'border-gray-600/20',
      'border-gray-600/20',
      'border-gray-600/20'
    ];

    return (
      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border bg-gray-800/30 hover:bg-gray-800/50 transition-colors ${compactBorders[Math.min(index, compactBorders.length - 1)]}`}>
        <span className="text-sm flex-shrink-0">{supporter.medal}</span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-gray-200 font-semibold text-xs truncate">
            {supporter.name}
          </span>
          {supporter.message && (
            <span className="text-gray-500 text-[10px] truncate italic">
              "{supporter.message}"
            </span>
          )}
        </div>
        <span className={`font-semibold text-xs flex-shrink-0 ${compactColors[Math.min(index, compactColors.length - 1)]}`}>
          {formatAmount(supporter.amount, supporter.currency)}
        </span>
      </div>
    );
  }

  return (
    <div className={`group relative overflow-hidden rounded-lg border transition-all duration-300 hover:brightness-110 ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
      {/* Subtle background trophy */}
      {rankIndex < 3 && (
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.06] pointer-events-none">
          <div className="text-7xl">{supporter.medal}</div>
        </div>
      )}

      {/* Amount in top right */}
      <div className="absolute top-1.5 right-2 z-20">
        <div className={`font-semibold ${rankIndex < 3 ? trophyColors[rankIndex] : 'text-cyan-400/70'} ${amountTextSizes[rankIndex]}`}>
          {formatAmount(supporter.amount, supporter.currency)}
        </div>
      </div>

      <div className="relative z-10">
        <div className="pr-16 flex items-baseline gap-2">
          <div className={`text-gray-200 font-bold ${nameTextSizes[rankIndex]} text-left flex-shrink-0`}>
            {supporter.name}
          </div>
          {supporter.message && (
            <p className="text-gray-500 text-xs truncate italic">
              "{supporter.message}"
            </p>
          )}
        </div>
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div className="absolute bottom-1.5 right-1.5 flex space-x-0.5 opacity-0 group-hover:opacity-80 transition-opacity">
          <button
            onClick={onEdit}
            className="px-1.5 py-0.5 bg-blue-600/80 text-white text-[10px] rounded hover:bg-blue-500 transition-colors"
            title="Edit"
          >
            ✏️
          </button>
          {canMoveUp && (
            <button
              onClick={onMoveUp}
              className="px-1.5 py-0.5 bg-purple-600/80 text-white text-[10px] rounded hover:bg-purple-500 transition-colors"
              title="Move Up"
            >
              ⬆️
            </button>
          )}
          {canMoveDown && (
            <button
              onClick={onMoveDown}
              className="px-1.5 py-0.5 bg-purple-600/80 text-white text-[10px] rounded hover:bg-purple-500 transition-colors"
              title="Move Down"
            >
              ⬇️
            </button>
          )}
        </div>
      )}
    </div>
  );
} 