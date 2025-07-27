'use client';

import React from 'react';
import Link from 'next/link';

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-6">
            Infantry Tools
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Professional development tools for Infantry Online creators, mappers, and developers
          </p>
        </div>

        {/* Available Tools */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-100 mb-8 flex items-center">
            <span className="mr-3">🎨</span>
            Available Tools
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Infantry Blob Viewer */}
            <div className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-xl p-8 hover:scale-105 transition-all duration-300 group relative overflow-hidden">
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Status Badge */}
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30">
                Active
              </div>

              {/* Tool Icon */}
              <div className="text-5xl mb-6">🖼️</div>

              {/* Tool Info */}
              <h3 className="text-2xl font-bold text-gray-100 mb-4 group-hover:text-white transition-colors">
                Infantry Blob Viewer
              </h3>
              <p className="text-gray-400 text-base mb-8 leading-relaxed group-hover:text-gray-300 transition-colors">
                Professional-grade sprite and audio viewer for Infantry Online BLO/CFS files. Perfect for developers, mappers, and content creators. Features animation playback, frame control, color adjustments, and audio waveform visualization.
              </p>

              {/* Features */}
              <div className="mb-8">
                <ul className="text-sm text-gray-400 space-y-2">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                    Universal BLO/CFS file support with instant loading
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                    Smooth animation playback with precise speed control
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                    High-quality audio playback with visual waveforms
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                    Advanced zoom (50%-2000%) and HSV color adjustments
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                    Frame-by-frame navigation and directory batch loading
                  </li>
                </ul>
              </div>

              {/* Action Button */}
                                    <Link
                        href="/tools/blob-viewer/index.html"
                        className="inline-flex items-center px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-lg text-base font-medium transition-all duration-200 group-hover:translate-x-1"
                      >
                Launch Blob Viewer
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Placeholder for future tools */}
            <div className="bg-gradient-to-br from-gray-600/20 to-gray-700/20 border border-gray-500/30 rounded-xl p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30">
                Coming Soon
              </div>

              <div className="text-5xl mb-6 opacity-50">🛠️</div>

              <h3 className="text-2xl font-bold text-gray-300 mb-4">
                More Tools Coming
              </h3>
              <p className="text-gray-500 text-base mb-8 leading-relaxed">
                Additional Infantry development tools are in development. Check back soon for map editors, config analyzers, and more.
              </p>

              <button 
                disabled
                className="inline-flex items-center px-6 py-3 bg-gray-500/20 border border-gray-500/30 rounded-lg text-base font-medium text-gray-500 cursor-not-allowed"
              >
                In Development
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-gray-700">
          <p className="text-gray-400 mb-4">
            Have suggestions for new tools? Let us know on the forum.
          </p>
          <div className="flex justify-center space-x-4">
            <Link 
              href="/forum" 
              className="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg text-cyan-400 hover:text-cyan-300 transition-all duration-200"
            >
              💬 Forum
            </Link>
            <Link 
              href="/guides" 
              className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-purple-400 hover:text-purple-300 transition-all duration-200"
            >
              📚 Guides
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 