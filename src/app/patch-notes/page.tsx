'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'react-hot-toast';

export default function PatchNotesPage() {
  const { user, loading } = useAuth();
  const [patchNotes, setPatchNotes] = useState<string>('');
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [lastModified, setLastModified] = useState<string>('');

  useEffect(() => {
    const fetchPatchNotes = async () => {
      try {
        setLoadingNotes(true);
        
        // For local development, we'll read from the specified file path
        // In production, this would need to be adapted to read from a different source
        const response = await fetch('/api/patch-notes');
        
        if (!response.ok) {
          throw new Error('Failed to fetch patch notes');
        }
        
        const data = await response.json();
        setPatchNotes(data.content || 'No patch notes available.');
        setLastModified(data.lastModified || '');
      } catch (error: any) {
        console.error('Error fetching patch notes:', error);
        setPatchNotes('Unable to load patch notes at this time.');
        toast.error('Error loading patch notes: ' + error.message);
      } finally {
        setLoadingNotes(false);
      }
    };

    fetchPatchNotes();
  }, []);

  // Function to parse and highlight .nws content based on the Infantry Online in-game colors
  const parseNWSContent = (content: string) => {
    const lines = content.split('\n');
    
    return lines.map((line, index) => {
      let className = 'text-green-400'; // Default bright green
      let processedLine = line;

      // Parse Infantry Online .nws syntax based on in-game appearance
      // Title/Header lines (like "OTF News") - Red/Orange
      if (line.includes('OTF News') || line.includes('News') && index < 5) {
        className = 'text-red-400 font-bold';
      }
      // Date lines (starting with ~6 or containing dates) - Cyan/Blue  
      else if (line.includes('~6') || /\w{3} \d{1,2}, \d{4}/.test(line)) {
        processedLine = line.replace(/~6/g, '');
        className = 'text-cyan-400 font-bold';
      }
      // Updates by author line - Green/Cyan
      else if (line.includes('~2') || line.includes('updates by')) {
        processedLine = line.replace(/~2/g, '');
        className = 'text-emerald-400';
      }
      // Section headers (Misc:, Bases:, Bug fix:, etc.) - Purple/Magenta
      else if (line.includes('~5') || /^\s*\w+:/.test(line.trim())) {
        processedLine = line.replace(/~5/g, '');
        className = 'text-purple-400 font-bold';
      }
      // Main content lines (starting with ~ or -) - Yellow/Gold
      else if (line.includes('~4') || line.includes('~1') || line.includes('~3') || line.includes('~7') || line.trim().startsWith('-')) {
        processedLine = line.replace(/~[1-7]/g, '');
        className = 'text-yellow-300';
      }
      // Team abbreviations and single lines - Yellow/Gold
      else if (/^[A-Z]{2,4}$/.test(line.trim()) || line.trim().length < 10) {
        className = 'text-yellow-300';
      }
      // Comments and special lines (starting with ~B) - Keep as default green
      else if (line.trim().startsWith('~B')) {
        processedLine = line.replace(/~B/g, '');
        className = 'text-green-400 font-bold';
      }

      return (
        <div key={index} className={`font-mono text-sm leading-relaxed ${className}`}>
          <span className="text-gray-500 mr-4 select-none">{(index + 1).toString().padStart(3, ' ')}</span>
          <span>{processedLine}</span>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">📋 UPDATES</h1>
            {lastModified && (
              <p className="text-sm text-gray-400 mt-2 font-mono">
                Last transmission: {new Date(lastModified).toLocaleString()}
              </p>
            )}
          </div>
          
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl overflow-hidden">
            <div className="bg-gray-700/50 px-6 py-4 border-b border-cyan-500/30">
              <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-wider">📄 CTFPL.NWS</h2>
            </div>
            
            <div className="p-6 bg-gray-900 overflow-x-auto">
              {loadingNotes ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
                  <span className="ml-3 text-cyan-400 font-mono">Downloading battlefield updates...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {parseNWSContent(patchNotes)}
                </div>
              )}
            </div>
          </div>
          
          <div className="mt-8 bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl p-8">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400 tracking-wider">🎖️ MISSION INTEL</h3>
            <div className="space-y-4 text-gray-300">
              <p>
                These tactical updates are automatically synchronized from the Infantry Online command center 
                and contain real-time battlefield modifications and combat system enhancements.
              </p>
              <p>
                The display format follows Infantry Online's native .nws protocol with color-coded 
                classification levels and tactical formatting for optimal readability during combat operations.
              </p>
              <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mt-4">
                <p className="text-yellow-400 font-bold text-sm">
                  ⚡ REAL-TIME SYNC: Updates are pulled directly from active game servers
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 