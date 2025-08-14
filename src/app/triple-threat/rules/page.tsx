'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader from '@/components/TripleThreatHeader';

export default function TripleThreatRulesPage() {
  const { user, loading } = useAuth();
  const [rulesDocument, setRulesDocument] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (user) {
      checkAdminStatus();
      loadRulesDocument();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, in_game_alias')
        .eq('id', user.id)
        .single();

      setIsAdmin(profile?.is_admin || profile?.in_game_alias === 'FlyMolo');
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadRulesDocument = async () => {
    try {
      // Check if there's an uploaded rules document
      const { data: files } = await supabase.storage
        .from('avatars')
        .list('triple-threat-rules', {
          limit: 1,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (files && files.length > 0) {
        const { data } = supabase.storage
          .from('avatars')
          .getPublicUrl(`triple-threat-rules/${files[0].name}`);
        
        setRulesDocument(data.publicUrl);
      }
    } catch (error) {
      console.error('Error loading rules document:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);

    try {
      const fileName = `triple-threat-rules-${Date.now()}.pdf`;
      const filePath = `triple-threat-rules/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setRulesDocument(data.publicUrl);
      toast.success('Rules document uploaded successfully!');

    } catch (error: any) {
      console.error('Error uploading rules:', error);
      toast.error('Failed to upload rules document: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const downloadRulesPDF = () => {
    if (rulesDocument) {
      // If we have an uploaded PDF, download it
      const link = document.createElement('a');
      link.href = rulesDocument;
      link.download = 'Triple-Threat-Rules.pdf';
      link.click();
    } else {
      // Generate a basic rules PDF content
      const rulesContent = `
Triple Threat League Rules

OVERVIEW
The Triple Threat League is a competitive 3v3 Infantry tournament system designed for organized team competition.

TEAM COMPOSITION
- Maximum 4 players per team (3 active + 1 alternate)
- Teams must have a unique name and password
- Team owners can manage membership

MATCH STRUCTURE
- Best-of-3 series format
- Standard Infantry CTF rules apply
- Matches can be friendly or tournament-based

TOURNAMENT SYSTEM
- Multiple tournament types supported
- Registration deadlines enforced
- Bracket generation and tracking

CHALLENGE SYSTEM
- Teams can challenge other teams
- Challenges must be accepted/declined
- Successful challenges create scheduled matches

For complete rules and updates, visit the Triple Threat section of CTFPL.
      `;
      
      const blob = new Blob([rulesContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Triple-Threat-Rules.txt';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Rules downloaded!');
    }
  };

  if (loading) {
    return (
      <TripleThreatBackground opacity={0.15}>
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse text-white">Loading...</div>
        </div>
      </TripleThreatBackground>
    );
  }

  return (
    <TripleThreatBackground opacity={0.18}>
      <TripleThreatHeader 
        currentPage="rules" 
        showTeamStatus={true}
      />

      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-6xl font-black mb-6 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-2xl">
            RULES
          </h1>
          <div className="bg-gradient-to-r from-cyan-400/15 via-purple-500/15 to-pink-400/15 backdrop-blur-sm border border-purple-400/40 rounded-2xl p-6 shadow-2xl shadow-purple-500/20">
            <p className="text-xl text-white/90 mb-4">
              Tournament rules and competition guidelines for Triple Threat
            </p>
            <button
              onClick={downloadRulesPDF}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-6 py-3 rounded-lg transition-all font-bold text-white shadow-lg hover:shadow-xl"
            >
              📥 Download Rules
            </button>
          </div>
        </div>
      </div>



      <div className="max-w-4xl mx-auto px-6 pb-20 relative z-10">
        
        {/* Admin Upload Section */}
        {isAdmin && (
          <div className="bg-gradient-to-br from-yellow-500/5 to-orange-500/5 backdrop-blur-sm border border-yellow-400/30 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold text-yellow-300 mb-4 flex items-center">
              🔧 Admin Controls
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-yellow-200">Upload Rules Document (PDF)</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="w-full px-3 py-2 bg-gray-800/50 border border-yellow-400/30 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
                <p className="text-xs text-yellow-200/70 mt-1">
                  Max 10MB. PDF files only.
                </p>
              </div>
              {uploading && (
                <div className="text-yellow-300 text-sm">
                  Uploading rules document...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rules Display */}
        {rulesDocument ? (
          <div className="bg-gradient-to-br from-cyan-500/5 to-purple-500/5 backdrop-blur-sm border border-cyan-400/30 rounded-2xl p-8">
            <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
              OFFICIAL RULES DOCUMENT
            </h2>
            <div className="bg-black/20 rounded-xl p-4">
              <iframe
                src={rulesDocument}
                className="w-full h-96 rounded-lg"
                title="Triple Threat Rules"
              />
            </div>
            <div className="text-center mt-6">
              <a
                href={rulesDocument}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-6 py-3 rounded-lg transition-all font-bold"
              >
                📄 Open Full Document
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-cyan-500/5 to-purple-500/5 backdrop-blur-sm border border-cyan-400/30 rounded-2xl p-8">
            <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
              TOURNAMENT RULES
            </h2>
            
            <div className="space-y-8">
              <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-cyan-300 mb-4 flex items-center">
                  🛡️ Team Composition
                </h3>
                <ul className="space-y-2 text-cyan-100/80">
                  <li>• Maximum 4 players per team</li>
                  <li>• 3 active players in matches</li>
                  <li>• 1 alternate for substitutions</li>
                  <li>• Password required for team formation</li>
                </ul>
              </div>

              <div className="bg-purple-500/10 border border-purple-400/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-purple-300 mb-4 flex items-center">
                  ⚔️ Game Format
                </h3>
                <ul className="space-y-2 text-purple-100/80">
                  <li>• Quick Fights (AC) game mode</li>
                  <li>• Series-based matches</li>
                  <li>• Round and series tracking</li>
                  <li>• Kill/death statistics</li>
                </ul>
              </div>

              <div className="bg-pink-500/10 border border-pink-400/30 rounded-xl p-6">
                <h3 className="text-xl font-bold text-pink-300 mb-4 flex items-center">
                  🏆 Tournament Format
                </h3>
                <ul className="space-y-2 text-pink-100/80">
                  <li>• Elimination bracket tournaments</li>
                  <li>• League-style regular season</li>
                  <li>• Registration deadlines required</li>
                  <li>• Separate tournament statistics</li>
                </ul>
              </div>
            </div>

            <div className="text-center mt-8 p-6 bg-gradient-to-r from-cyan-400/10 via-purple-500/10 to-pink-400/10 rounded-xl border border-purple-400/30 shadow-lg">
              <p className="text-white/80 mb-4">
                Complete tournament rules and guidelines will be provided to all registered teams.
              </p>
              <p className="text-sm text-gray-300/70">
                For questions about rules or tournaments, contact the administrators.
              </p>
            </div>
          </div>
        )}

      </div>
    </TripleThreatBackground>
  );
}
