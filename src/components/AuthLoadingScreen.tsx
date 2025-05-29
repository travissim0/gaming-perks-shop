'use client';

import React from 'react';

interface AuthLoadingScreenProps {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  showRetry?: boolean;
}

export default function AuthLoadingScreen({ 
  loading = true, 
  error = null, 
  onRetry,
  showRetry = true 
}: AuthLoadingScreenProps) {
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-red-400 mb-4">Authentication Issue</h1>
          <p className="text-gray-300 mb-4">
            We're having trouble verifying your session.
          </p>
          
          <div className="bg-gray-800/50 border border-gray-600 rounded p-3 mb-6 text-left">
            <p className="text-xs text-gray-400 break-words">
              {error}
            </p>
          </div>

          <div className="space-y-3">
            {showRetry && onRetry && (
              <button
                onClick={onRetry}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
              >
                🔄 Try Again
              </button>
            )}
            
            <button
              onClick={() => window.location.href = '/auth/login'}
              className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              🔑 Go to Login
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              🔄 Refresh Page
            </button>
          </div>
          
          <p className="text-gray-500 text-xs mt-4">
            This usually resolves by signing in again or refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl">🔐</div>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">Authenticating...</h2>
          <p className="text-gray-400 text-lg mb-4">Verifying your session</p>
          
          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-b from-slate-800/50 to-slate-700/50 rounded-lg p-4 border border-cyan-500/20">
              <div className="flex items-center justify-center space-x-2 text-gray-300">
                <div className="animate-pulse">🔍</div>
                <span className="text-sm">Checking authentication...</span>
              </div>
              
              <div className="mt-3 text-xs text-gray-500">
                This should only take a few seconds
              </div>
            </div>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm">
              Taking longer than usual? 
              <button 
                onClick={() => window.location.reload()}
                className="text-cyan-400 hover:text-cyan-300 ml-1 underline"
              >
                Try refreshing
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
} 