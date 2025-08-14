'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      
      {/* Custom Triple Threat Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-cyan-500/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/triple-threat" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                TRIPLE THREAT
              </div>
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/triple-threat" className="text-gray-300 hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/triple-threat/rules" className="text-cyan-300 hover:text-cyan-100 transition-colors font-medium">
                Rules
              </Link>
              <Link href="/triple-threat/signup" className="text-gray-300 hover:text-white transition-colors">
                Teams
              </Link>
              <Link href="/triple-threat/matches" className="text-gray-300 hover:text-white transition-colors">
                Matches
              </Link>
              <Link href="/" className="bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 px-4 py-2 rounded-lg transition-all text-sm font-medium">
                ← Back to CTFPL
              </Link>
            </nav>
          </div>
        </div>
      </header>
      
      {/* Animated Background */}
      <div className="fixed inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-purple-900/20 to-pink-900/20"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute bg-cyan-400/10 rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 3 + 1}px`,
                height: `${Math.random() * 3 + 1}px`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${Math.random() * 4 + 3}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-6xl font-black mb-6 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-2xl">
            RULES
          </h1>
          <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 backdrop-blur-sm border border-cyan-500/30 rounded-2xl p-6">
            <p className="text-xl text-cyan-100">
              Tournament rules and competition guidelines for Triple Threat
            </p>
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

            <div className="text-center mt-8 p-6 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 rounded-xl border border-cyan-400/20">
              <p className="text-cyan-100/70 mb-4">
                Complete tournament rules and guidelines will be provided to all registered teams.
              </p>
              <p className="text-sm text-cyan-200/50">
                For questions about rules or tournaments, contact the administrators.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
