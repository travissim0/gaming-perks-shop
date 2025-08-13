'use client';

import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

export default function RulesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar user={user} />
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
            CTFPL Season 22 Rules
          </h1>
          <p className="text-gray-400 text-lg">
            Official tournament rules and regulations for CTFPL Season 22
          </p>
        </div>

        {/* PDF Viewer Container */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
          <div className="p-4 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                CTFPL S22 Rules - August 11th, 2025
              </h2>
              <a 
                href="/CTFPL S22 Rules August 11th, 2025.pdf" 
                download
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download PDF
              </a>
            </div>
          </div>
          
          {/* PDF Embed */}
          <div className="relative" style={{ height: '80vh' }}>
            <iframe
              src="/CTFPL-S22-Rules-August-11th-2025.pdf"
              className="w-full h-full"
              title="CTFPL Season 22 Rules"
              style={{ border: 'none' }}
            >
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-red-400 mb-4">
                  <svg className="w-16 h-16 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">PDF Viewer Not Supported</h3>
                <p className="text-gray-400 mb-6">
                  Your browser doesn't support embedded PDF viewing. Please download the file to view the rules.
                </p>
                <a 
                  href="/CTFPL-S22-Rules-August-11th-2025.pdf" 
                  download
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors font-semibold"
                >
                  Download CTFPL S22 Rules PDF
                </a>
              </div>
            </iframe>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">Tournament Schedule</h3>
            <p className="text-gray-400 text-sm mb-4">
              View upcoming tournament matches and important dates
            </p>
            <a href="/tournament-matches" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View Tournament Matches →
            </a>
          </div>
          
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">League Standings</h3>
            <p className="text-gray-400 text-sm mb-4">
              Check current CTFPL season standings and rankings
            </p>
            <a href="/league/ctfpl" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View Standings →
            </a>
          </div>
          
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Squad Management</h3>
            <p className="text-gray-400 text-sm mb-4">
              Manage your squad roster and participate in the league
            </p>
            <a href="/squads" className="text-blue-400 hover:text-blue-300 text-sm font-medium">
              View Squads →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
