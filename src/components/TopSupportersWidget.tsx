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
}

export default function TopSupportersWidget({ 
  showAdminControls = false, 
  maxSupporters = 10,
  className = ""
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
    <div className={`bg-gradient-to-b from-gray-900/90 to-black/90 backdrop-blur-sm border border-purple-500/30 rounded-xl shadow-2xl overflow-hidden relative ${className}`}>
      {/* Starfield Background Effect */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-6 left-10 w-1 h-1 bg-purple-300 rounded-full animate-pulse"></div>
        <div className="absolute top-16 right-8 w-0.5 h-0.5 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.7s' }}></div>
        <div className="absolute top-28 left-16 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-pulse" style={{ animationDelay: '1.2s' }}></div>
        <div className="absolute top-40 right-12 w-1 h-1 bg-indigo-300 rounded-full animate-pulse" style={{ animationDelay: '1.8s' }}></div>
        <div className="absolute bottom-16 left-8 w-0.5 h-0.5 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '2.3s' }}></div>
        <div className="absolute bottom-32 right-20 w-0.5 h-0.5 bg-blue-300 rounded-full animate-pulse" style={{ animationDelay: '2.8s' }}></div>
      </div>

      <div className="bg-gradient-to-r from-purple-600/50 to-pink-600/50 px-6 py-4 border-b border-purple-500/50 relative">
        {/* Cosmic background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="text-6xl flex items-center justify-center h-full">🌌</div>
        </div>
        
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">🏆</span>  
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-wider">Top Supporters</h3>
              <p className="text-sm text-purple-200"></p>
            </div>
          </div>
          
          {isAdmin && showAdminControls && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all duration-300 ${
                isEditing 
                  ? 'bg-red-600/30 text-red-300 border border-red-500/50 hover:bg-red-600/40' 
                  : 'bg-blue-600/30 text-blue-300 border border-blue-500/50 hover:bg-blue-600/40'
              }`}
            >
              {isEditing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 bg-gradient-to-b from-gray-900/50 to-black/50">
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">Loading supporters...</div>
            </div>
          ) : supporters.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">No supporters found</div>
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
  formatAmount
}: SupporterRowProps) {
  const [tempName, setTempName] = useState(supporter.name);
  const [tempAmount, setTempAmount] = useState(supporter.amount);
  const [tempMessage, setTempMessage] = useState(supporter.message);

  // Cascading styling arrays matching the space theme
  const trophyIcons = ['🥇', '🥈', '🥉'];
  const trophyColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
  const nameTextSizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs'];
  const amountTextSizes = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs', 'text-xs'];
  const paddingSizes = ['p-4', 'p-3.5', 'p-3', 'p-3', 'p-2.5', 'p-2.5', 'p-2', 'p-2'];
  const cardThemes = [
    'bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 border-yellow-500/50 shadow-yellow-500/20', // Gold - more cosmic
    'bg-gradient-to-br from-gray-600/30 to-gray-500/20 border-gray-400/50 shadow-gray-400/20',       // Silver
    'bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-600/50 shadow-amber-600/20',    // Bronze
    'bg-gradient-to-br from-blue-900/25 to-blue-800/15 border-blue-500/40 shadow-blue-500/20',      // 4th place - more cosmic
    'bg-gradient-to-br from-purple-900/25 to-purple-800/15 border-purple-500/40 shadow-purple-500/20', // 5th place
    'bg-gradient-to-br from-cyan-900/25 to-cyan-800/15 border-cyan-500/40 shadow-cyan-500/20',       // 6th place - changed to cyan
    'bg-gradient-to-br from-gray-700/20 to-gray-800/15 border-gray-500/30 shadow-gray-500/10',      // Lower ranks
    'bg-gradient-to-br from-gray-800/15 to-gray-900/10 border-gray-600/20 shadow-gray-600/10'       // Lowest ranks
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

  return (
    <div className={`relative overflow-hidden rounded-lg border transition-all duration-300 shadow-lg hover:shadow-2xl ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
      {/* Massive background trophy icon with opacity */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
        <div className="text-9xl">{supporter.medal}</div>
      </div>
      
      {/* Money amount in top right corner */}
      <div className="absolute top-2 right-2 z-20">
        <div className={`font-bold ${rankIndex < 3 ? trophyColors[rankIndex] : 'text-cyan-300'} ${amountTextSizes[rankIndex]}`}>
          {formatAmount(supporter.amount, supporter.currency)}
        </div>
      </div>
      
      <div className="relative z-10">
        <div className="pr-20"> {/* Add right padding to avoid overlap with amount */}
          <div className={`text-white font-bold ${nameTextSizes[rankIndex]} truncate text-left`}>
            {supporter.name}
          </div>
          {supporter.message && (
            <p className="text-gray-300 text-sm mt-1">
              "{supporter.message}"
            </p>
          )}
        </div>
      </div>

      {/* Admin controls overlay */}
      {isAdmin && (
        <div className="absolute bottom-2 right-2 flex space-x-1 opacity-60 hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="px-2 py-1 bg-blue-600/90 text-white text-xs rounded hover:bg-blue-500 transition-colors shadow-lg"
            title="Edit"
          >
            ✏️
          </button>
          {canMoveUp && (
            <button
              onClick={onMoveUp}
              className="px-2 py-1 bg-purple-600/90 text-white text-xs rounded hover:bg-purple-500 transition-colors shadow-lg"
              title="Move Up"
            >
              ⬆️
            </button>
          )}
          {canMoveDown && (
            <button
              onClick={onMoveDown}
              className="px-2 py-1 bg-purple-600/90 text-white text-xs rounded hover:bg-purple-500 transition-colors shadow-lg"
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