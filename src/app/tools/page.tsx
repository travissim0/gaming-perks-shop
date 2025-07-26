'use client';

import Link from 'next/link';

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              Infantry Tools
            </h1>
            <p className="text-gray-400 text-lg">
              Essential tools for Infantry Online players and developers
            </p>
          </div>

          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Infantry Blob Viewer */}
            <Link href="/tools/infantry-viewer" className="group">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-blue-500 transition-all duration-300 transform hover:scale-105">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mr-4">
                    <span className="text-2xl">🖼️</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">
                      Infantry Blob Viewer
                    </h3>
                    <p className="text-gray-400 text-sm">BLO/CFS File Viewer</p>
                  </div>
                </div>
                <p className="text-gray-300 mb-4">
                  View and animate Infantry Online BLO files with sprite animation, audio playback, and advanced controls.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs">Sprites</span>
                  <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">Animation</span>
                  <span className="px-2 py-1 bg-purple-900 text-purple-300 rounded text-xs">Audio</span>
                  <span className="px-2 py-1 bg-red-900 text-red-300 rounded text-xs">Web-based</span>
                </div>
                <div className="text-blue-400 text-sm font-medium group-hover:text-blue-300">
                  Launch Tool →
                </div>
              </div>
            </Link>

            {/* Placeholder for future tools */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 opacity-50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-2xl">🔧</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-400">
                    More Tools Coming Soon
                  </h3>
                  <p className="text-gray-500 text-sm">Under Development</p>
                </div>
              </div>
              <p className="text-gray-400 mb-4">
                Additional Infantry Online tools and utilities are in development.
              </p>
              <div className="text-gray-500 text-sm">
                Stay tuned...
              </div>
            </div>

          </div>

          {/* Back to Site */}
          <div className="text-center mt-12">
            <Link 
              href="/" 
              className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              ← Back to CTFPL
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 