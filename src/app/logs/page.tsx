'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface LogEntry {
  tabNumber: number;
  sender: string;
  recipient?: string;
  message: string;
  timestamp?: number;
  color: string;
}

interface PlayerStats {
  name: string;
  messageCount: number;
  kills?: number;
  deaths?: number;
  accuracy?: number;
}

const TAB_COLORS = {
  0: { 
    primary: { bg: 'bg-cyan-600/25', text: 'text-cyan-200', border: 'border-cyan-500/40' },
    alternate: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-400/35' }
  },
  2: { 
    primary: { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
    alternate: { bg: 'bg-green-400/15', text: 'text-green-200', border: 'border-green-400/25' }
  },
  5: { 
    primary: { bg: 'bg-green-400/20', text: 'text-green-200', border: 'border-green-400/30' },
    alternate: { bg: 'bg-green-300/15', text: 'text-green-100', border: 'border-green-300/25' }
  },
  6: { 
    primary: { bg: 'bg-yellow-600/20', text: 'text-yellow-300', border: 'border-yellow-600/30' },
    alternate: { bg: 'bg-yellow-500/15', text: 'text-yellow-200', border: 'border-yellow-500/25' }
  },
  9: { 
    primary: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
    alternate: { bg: 'bg-purple-400/15', text: 'text-purple-200', border: 'border-purple-400/25' }
  },
};

export default function LogViewerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [logContent, setLogContent] = useState<string>('');
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<PlayerStats[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1300);
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [playerFilterOpen, setPlayerFilterOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // SECURITY: Check admin access
  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user) {
        setAuthLoading(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin, ctf_role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        } else {
          // Allow access for admins and CTF staff who might need to review game logs
          const hasAccess = profile?.is_admin || 
                           profile?.ctf_role === 'ctf_admin' || 
                           profile?.ctf_role === 'ctf_head_referee';
          setIsAdmin(hasAccess || false);
        }
      } catch (error) {
        console.error('Error checking admin access:', error);
        setIsAdmin(false);
      }
      
      setAuthLoading(false);
    };

    checkAdminAccess();
  }, [user]);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    } else if (!authLoading && user && !isAdmin) {
      router.push('/');
    }
  }, [authLoading, user, isAdmin, router]);

  // SECURITY: Sanitize sensitive data from log content
  const sanitizeLogContent = (content: string): string => {
    // Remove potential IP addresses (IPv4 pattern)
    const ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    content = content.replace(ipPattern, '[IP_REDACTED]');
    
    // Remove potential IPv6 addresses
    const ipv6Pattern = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;
    content = content.replace(ipv6Pattern, '[IPV6_REDACTED]');
    
    // Remove potential MAC addresses
    const macPattern = /\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g;
    content = content.replace(macPattern, '[MAC_REDACTED]');
    
    // Remove potential email addresses (basic pattern)
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    content = content.replace(emailPattern, '[EMAIL_REDACTED]');
    
    // Remove potential file paths that might contain sensitive info
    const pathPattern = /[C-Z]:\\[^\\:\*\?"<>\|]*\\[^\\:\*\?"<>\|]*/g;
    content = content.replace(pathPattern, '[PATH_REDACTED]');
    
    // Remove potential Discord/external links that might contain tokens
    const discordPattern = /https:\/\/discord\.gg\/[a-zA-Z0-9]+/g;
    content = content.replace(discordPattern, '[DISCORD_LINK_REDACTED]');
    
    return content;
  };

  // Single source of truth for player validation
  const isValidPlayer = (name: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    
    // Convert to lowercase for checking
    const lower = trimmed.toLowerCase();
    
    // Exclude obvious system messages
    const systemKeywords = ['server', 'system', 'admin', 'bot', 'console', 'unknown'];
    if (systemKeywords.some(keyword => lower.includes(keyword))) return false;
    
    // Exclude special cases
    if (lower === 'you' || lower === 'me') return false;
    
    // Exclude messages starting with obvious system symbols
    if (trimmed.startsWith('*') || trimmed.startsWith('<') || trimmed.startsWith('>')) return false;
    if (trimmed.startsWith('[system') || trimmed.startsWith('[server')) return false;
    
    return true;
  };

  // Parse log content with unified logic
  const parseLogContent = (content: string) => {
    // SECURITY: Sanitize content before processing
    const sanitizedContent = sanitizeLogContent(content);
    
    const lines = sanitizedContent.split('\n').filter(line => line.trim());
    const entries: LogEntry[] = [];
    const playerSet = new Set<string>();
    const statsMap: { [key: string]: PlayerStats } = {};

    console.log('=== UNIFIED PARSING & STATISTICS (SANITIZED) ===');
    console.log('Total lines:', lines.length);

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      
      // Split by actual tab characters
      const parts = line.split('\t');
      
      if (parts.length >= 3) {
        const tabNumber = parseInt(parts[0]) || 0;
        const rawSender = parts[1]?.trim() || '';
        let recipient = '';
        let message = '';

        // Handle different formats:
        // Format 1: tab_num \t sender \t message (3 parts)
        // Format 2: tab_num \t sender \t recipient \t message (4+ parts)
        if (parts.length === 3) {
          message = parts[2] || '';
        } else if (parts.length >= 4) {
          // Check if parts[2] looks like a recipient (short, no spaces usually)
          // or if it's part of the message
          const possibleRecipient = parts[2]?.trim() || '';
          const possibleMessage = parts[3] || '';
          
          // If parts[2] is very long or has spaces, it's probably part of the message
          if (possibleRecipient.length > 20 || possibleRecipient.includes(' ')) {
            message = parts.slice(2).join('\t');
          } else {
            recipient = possibleRecipient;
            message = parts.slice(3).join('\t');
          }
        }

        const colorConfig = TAB_COLORS[tabNumber as keyof typeof TAB_COLORS] || TAB_COLORS[0];
        
        // Create the entry
        const entry: LogEntry = {
          tabNumber,
          sender: rawSender,
          recipient,
          message,
          timestamp: index,
          color: colorConfig.primary.text
        };
        
        entries.push(entry);

        // Debug specific lines for troubleshooting
        if (index < 10 || rawSender.toLowerCase().includes('melantho') || rawSender.toLowerCase().includes('colossal')) {
          console.log(`Line ${index}:`, {
            original: line.substring(0, 100),
            parts: parts.map(p => `"${p}"`),
            tabNumber,
            rawSender: `"${rawSender}"`,
            recipient: `"${recipient}"`,
            message: `"${message.substring(0, 30)}..."`
          });
        }

        // Process players and stats in one pass
        if (isValidPlayer(rawSender)) {
          playerSet.add(rawSender);
          
          // Initialize or update stats immediately
          if (!statsMap[rawSender]) {
            statsMap[rawSender] = { name: rawSender, messageCount: 0, kills: 0, deaths: 0 };
            console.log(`✅ Created player & stats: "${rawSender}"`);
          }
          statsMap[rawSender].messageCount++;
          
          // Enhanced logging for tracked players
          if (rawSender.toLowerCase().includes('melantho') || rawSender.toLowerCase().includes('colossal')) {
            console.log(`🎯 INCREMENTING: Player "${rawSender}" now has ${statsMap[rawSender].messageCount} messages`);
            console.log(`🎯 Message content: "${message.substring(0, 50)}..."`);
            console.log(`🎯 Stats object for ${rawSender}:`, JSON.stringify(statsMap[rawSender]));
          }
        } else if (rawSender) {
          if (index < 20 || rawSender.toLowerCase().includes('melantho') || rawSender.toLowerCase().includes('colossal')) {
            console.log(`❌ Rejected: "${rawSender}" (reason: ${getRejectReason(rawSender)})`);
          }
        }
        
        if (recipient && isValidPlayer(recipient)) {
          playerSet.add(recipient);
          if (!statsMap[recipient]) {
            statsMap[recipient] = { name: recipient, messageCount: 0, kills: 0, deaths: 0 };
          }
          // Don't count recipient messages, only sender messages
        }

        // Extract kills/deaths from messages
        if (message && message.includes('killed by')) {
          const killerMatch = message.match(/(\w+)\(\d+\) killed by (\w+)/);
          if (killerMatch) {
            const victim = killerMatch[1];
            const killer = killerMatch[2];
            if (statsMap[killer]) {
              statsMap[killer].kills = (statsMap[killer].kills || 0) + 1;
              console.log(`💀 Kill recorded: ${killer} killed ${victim}`);
            }
            if (statsMap[victim]) {
              statsMap[victim].deaths = (statsMap[victim].deaths || 0) + 1;
            }
          }
        }

        // Extract accuracy
        if (message && message.includes('% accuracy')) {
          const accuracyMatch = message.match(/(\d+\.\d+) % accuracy/);
          if (accuracyMatch && statsMap[rawSender]) {
            const accuracy = parseFloat(accuracyMatch[1]);
            statsMap[rawSender].accuracy = accuracy;
            console.log(`🎯 Accuracy recorded: ${rawSender} = ${accuracy}%`);
          }
        }
      } else {
        if (index < 10) {
          console.log(`Skipped malformed line ${index} (${parts.length} parts):`, line.substring(0, 50));
        }
      }
    });

    const sortedStats = Object.values(statsMap).sort((a, b) => b.messageCount - a.messageCount);

    console.log('=== UNIFIED RESULTS (SANITIZED) ===');
    console.log('Total entries created:', entries.length);
    console.log('Total unique players found:', playerSet.size);
    console.log('Total players with stats:', sortedStats.length);
    console.log('Top 10 players with stats:', sortedStats.slice(0, 10).map(p => `${p.name}: ${p.messageCount}`));
    
    // Check for our specific players - FINAL CHECK
    const melantho = sortedStats.find(p => p.name.toLowerCase().includes('melantho'));
    const colossal = sortedStats.find(p => p.name.toLowerCase().includes('colossal'));
    
    console.log('🔍 FINAL STATS CHECK:');
    if (melantho) {
      console.log(`🎯 MELANTHO FINAL: ${melantho.messageCount} messages - Full object:`, JSON.stringify(melantho));
    } else {
      console.log(`❌ MELANTHO NOT FOUND in final sorted stats`);
      // Check if it exists in raw statsMap
      const rawMelantho = Object.keys(statsMap).find(key => key.toLowerCase().includes('melantho'));
      if (rawMelantho) {
        console.log(`🔍 Found melantho in raw statsMap: "${rawMelantho}" =`, JSON.stringify(statsMap[rawMelantho]));
      }
    }
    
    if (colossal) {
      console.log(`🎯 COLOSSAL FINAL: ${colossal.messageCount} messages - Full object:`, JSON.stringify(colossal));
    } else {
      console.log(`❌ COLOSSAL NOT FOUND in final sorted stats`);
      // Check if it exists in raw statsMap
      const rawColossal = Object.keys(statsMap).find(key => key.toLowerCase().includes('colossal'));
      if (rawColossal) {
        console.log(`🔍 Found colossal in raw statsMap: "${rawColossal}" =`, JSON.stringify(statsMap[rawColossal]));
      }
    }
    
    setParsedLogs(entries);
    setPlayerStats(sortedStats);
    setAvailablePlayers(sortedStats);
    determineWinner(entries);
  };

  // Helper function to explain why a player was rejected
  const getRejectReason = (name: string): string => {
    if (!name || typeof name !== 'string') return 'empty/invalid';
    const trimmed = name.trim();
    if (trimmed.length === 0) return 'empty after trim';
    
    const lower = trimmed.toLowerCase();
    const systemKeywords = ['server', 'system', 'admin', 'bot', 'console', 'unknown'];
    if (systemKeywords.some(keyword => lower.includes(keyword))) return 'system keyword';
    
    if (lower === 'you' || lower === 'me') return 'generic pronoun';
    
    if (trimmed.startsWith('*') || trimmed.startsWith('<') || trimmed.startsWith('>')) return 'system symbol';
    if (trimmed.startsWith('[system') || trimmed.startsWith('[server')) return 'system bracket';
    
    return 'unknown reason';
  };

  // Filter logs based on selected players
  useEffect(() => {
    if (selectedPlayers.length === 0) {
      setFilteredLogs(parsedLogs);
    } else {
      const filtered = parsedLogs.filter(entry => 
        selectedPlayers.includes(entry.sender) || 
        (entry.recipient && selectedPlayers.includes(entry.recipient))
      );
      setFilteredLogs(filtered);
    }
  }, [selectedPlayers, parsedLogs]);

  // Animation logic
  useEffect(() => {
    if (isAnimating && currentAnimationIndex < filteredLogs.length) {
      const timer = setTimeout(() => {
        setCurrentAnimationIndex(prev => prev + 1);
        
        // Smooth scroll to the current message instead of bottom
        if (logContainerRef.current) {
          const messageElements = logContainerRef.current.children;
          const currentMessage = messageElements[currentAnimationIndex];
          if (currentMessage) {
            currentMessage.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }
        }
      }, animationSpeed);
      return () => clearTimeout(timer);
    } else if (currentAnimationIndex >= filteredLogs.length) {
      setIsAnimating(false);
    }
  }, [isAnimating, currentAnimationIndex, filteredLogs.length, animationSpeed]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setPlayerFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setLogContent(content);
        parseLogContent(content);
        setCurrentAnimationIndex(0);
      };
      reader.readAsText(file);
    }
  };

  // Handle manual text input
  const handleTextInput = (content: string) => {
    setLogContent(content);
    parseLogContent(content);
    setCurrentAnimationIndex(0);
  };

  // Toggle player filter
  const togglePlayerFilter = (player: string) => {
    setSelectedPlayers(prev => 
      prev.includes(player) 
        ? prev.filter(p => p !== player)
        : [...prev, player]
    );
  };

  // Start/stop animation
  const toggleAnimation = () => {
    if (isAnimating) {
      setIsAnimating(false);
    } else {
      setCurrentAnimationIndex(0);
      setIsAnimating(true);
    }
  };

  // Reset animation
  const resetAnimation = () => {
    setIsAnimating(false);
    setCurrentAnimationIndex(filteredLogs.length);
  };

  // Filter players based on search (case-insensitive)
  const filteredPlayers = availablePlayers.filter(player =>
    player.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  const renderLogEntry = (entry: LogEntry, index: number) => {
    const colorConfig = TAB_COLORS[entry.tabNumber as keyof typeof TAB_COLORS] || TAB_COLORS[0];
    const isAlternate = index % 2 === 1;
    const colors = isAlternate ? colorConfig.alternate : colorConfig.primary;
    const isVisible = isAnimating ? index < currentAnimationIndex : true;
    
    return (
      <div
        key={index}
        className={`
          flex items-start gap-3 px-4 py-2 transition-all duration-300 transform border-l-2
          ${colors.bg} ${colors.border} 
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          ${isAnimating && index === currentAnimationIndex - 1 ? 'ring-1 ring-white/20' : ''}
        `}
        style={{
          animationDelay: isAnimating ? `${index * (animationSpeed / 1000)}s` : '0s'
        }}
      >
        {/* Message content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className={`font-bold text-lg ${colors.text}`}>
              {entry.sender}
            </span>
            {entry.recipient && (
              <>
                <span className="text-gray-500 text-base">→</span>
                <span className={`font-bold text-lg ${colors.text}`}>
                  {entry.recipient}
                </span>
              </>
            )}
            <span className={`text-base ${colors.text} opacity-90 break-words`}>
              {entry.message}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Determine winner based on various factors
  const determineWinner = (entries: LogEntry[]) => {
    if (!entries || entries.length === 0) {
      setWinner('No data available');
      return;
    }

    const lastMessage = entries[entries.length - 1];
    if (lastMessage?.message?.includes('Victory')) {
      setWinner('Victory Achieved! 🏆');
    } else {
      // Wait for playerStats to be calculated
      setTimeout(() => {
        if (playerStats && playerStats.length > 0) {
          const mostActive = playerStats.reduce((prev, current) => 
            (prev.messageCount > current.messageCount) ? prev : current
          );
          setWinner(mostActive?.name || 'Unknown Champion');
        } else {
          setWinner('Match Complete');
        }
      }, 100);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 mb-4">
              🎮 Game Log Viewer
            </h1>
            <p className="text-gray-300">
              Upload your game logs for syntax highlighting, player filtering, and epic animations!
            </p>
          </div>

          {/* Upload Section */}
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-purple-400 mb-4">📁 Load Game Log</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Upload Log File
                </label>
                <input
                  type="file"
                  accept=".txt,.log"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
              </div>

              {/* Text Input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Or Paste Log Content
                </label>
                <textarea
                  value={logContent}
                  onChange={(e) => handleTextInput(e.target.value)}
                  placeholder="Paste your game log content here..."
                  className="w-full h-20 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none"
                />
              </div>
            </div>
          </div>

          {parsedLogs.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Controls Panel */}
              <div className="space-y-6">
                {/* Animation Controls */}
                <div className="bg-gray-800 border border-purple-500/30 rounded-xl p-4">
                  <h3 className="text-lg font-bold text-purple-400 mb-4">🎬 Animation</h3>
                  
                  <div className="space-y-3">
                    <button
                      onClick={toggleAnimation}
                      className={`w-full py-2 px-4 rounded-lg font-bold transition-colors ${
                        isAnimating 
                          ? 'bg-red-600 hover:bg-red-700 text-white' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {isAnimating ? '⏸️ Pause' : '▶️ Play'}
                    </button>
                    
                    <button
                      onClick={resetAnimation}
                      className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors"
                    >
                      🔄 Show All
                    </button>

                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Speed: {animationSpeed}ms
                      </label>
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        value={animationSpeed}
                        onChange={(e) => setAnimationSpeed(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>

                    <div className="text-sm text-gray-400">
                      Progress: {currentAnimationIndex} / {filteredLogs.length}
                    </div>
                  </div>
                </div>

                {/* Player Filter with Search & Dropdown */}
                <div className="bg-gray-800 border border-cyan-500/30 rounded-xl p-4 relative" ref={filterDropdownRef}>
                  <h3 className="text-lg font-bold text-cyan-400 mb-4">👥 Player Filter</h3>
                  
                  {/* Search & Dropdown Toggle */}
                  <div className="relative">
                    <div className="flex items-center">
                      <input
                        type="text"
                        placeholder="🔍 Search players..."
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        onClick={() => setPlayerFilterOpen(true)}
                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-l-lg text-white placeholder-gray-400 text-sm"
                      />
                      <button
                        onClick={() => setPlayerFilterOpen(!playerFilterOpen)}
                        className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 border border-cyan-600 rounded-r-lg text-white transition-colors"
                      >
                        {playerFilterOpen ? '▲' : '▼'}
                      </button>
                    </div>
                    
                    {/* Dropdown */}
                    {playerFilterOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto">
                        {filteredPlayers.map(player => (
                          <div
                            key={player.name}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-600 cursor-pointer"
                            onClick={() => togglePlayerFilter(player.name)}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedPlayers.includes(player.name)}
                                onChange={() => {}}
                                className="w-4 h-4 text-cyan-600 bg-gray-600 border-gray-500 rounded"
                              />
                              <span className="text-white text-sm">{player.name}</span>
                            </div>
                            <span className="text-gray-400 text-xs">({player.messageCount})</span>
                          </div>
                        ))}
                        {filteredPlayers.length === 0 && (
                          <div className="px-3 py-2 text-gray-400 text-sm">No players found</div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedPlayers.length > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedPlayers.map(player => (
                          <span
                            key={player}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-600 text-white text-xs rounded"
                          >
                            {player}
                            <button
                              onClick={() => togglePlayerFilter(player)}
                              className="hover:text-cyan-200"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => setSelectedPlayers([])}
                        className="w-full py-1 px-3 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </div>

                {/* Statistics */}
                <div className="bg-gray-800 border border-yellow-500/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-yellow-400">📊 Stats</h3>
                    <button
                      onClick={() => setShowStats(!showStats)}
                      className="text-sm text-yellow-400 hover:text-yellow-300"
                    >
                      {showStats ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showStats && (
                    <div className="space-y-2 text-sm">
                      <div className="text-gray-300">
                        Total Messages: <span className="text-white font-bold">{filteredLogs.length}</span>
                      </div>
                      <div className="text-gray-300">
                        Players: <span className="text-white font-bold">{availablePlayers.length}</span>
                      </div>
                      {playerStats.slice(0, 3).map((stat, i) => (
                        <div key={stat.name} className="text-gray-300">
                          #{i + 1} {stat.name}: <span className="text-white font-bold">{stat.messageCount}</span> msgs
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Winner Display */}
                {winner && (
                  <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/30 rounded-xl p-4 text-center">
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">🏆 Victory!</h3>
                    <div className="text-white font-bold">{winner}</div>
                  </div>
                )}
              </div>

              {/* Log Display */}
              <div className="xl:col-span-3">
                <div className="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden">
                  <div className="bg-gray-700/50 px-6 py-4 border-b border-gray-600">
                    <h3 className="text-lg font-bold text-white">
                      💬 Game Chat Log
                      {selectedPlayers.length > 0 && (
                        <span className="text-sm text-cyan-400 ml-2">
                          (Filtered: {selectedPlayers.join(', ')})
                        </span>
                      )}
                    </h3>
                  </div>

                  <div
                    ref={logContainerRef}
                    className="max-h-[600px] overflow-y-auto bg-black/20"
                  >
                    {filteredLogs.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">
                        No messages to display
                      </div>
                    ) : (
                      filteredLogs.map((entry, index) => renderLogEntry(entry, index))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {parsedLogs.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📜</div>
              <h3 className="text-xl font-bold text-gray-400 mb-2">No Logs Loaded</h3>
              <p className="text-gray-500">Upload a log file or paste content to get started!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 