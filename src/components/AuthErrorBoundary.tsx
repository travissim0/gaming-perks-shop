'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is an auth-related error
    const errorMessage = error.message?.toLowerCase() || '';
    const isAuthError = (
      errorMessage.includes('refresh token not found') ||
      errorMessage.includes('invalid refresh token') ||
      errorMessage.includes('auth') ||
      errorMessage.includes('token')
    );

    console.error('🚨 AuthErrorBoundary caught error:', {
      message: error.message,
      isAuthError,
      stack: error.stack
    });

    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 AuthErrorBoundary error details:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });

    // If it's an auth error, clear storage and redirect
    const errorMessage = error.message?.toLowerCase() || '';
    const isAuthError = (
      errorMessage.includes('refresh token not found') ||
      errorMessage.includes('invalid refresh token') ||
      errorMessage.includes('auth') ||
      errorMessage.includes('token')
    );

    if (isAuthError && typeof window !== 'undefined') {
      console.log('🧹 Clearing auth data due to error boundary');
      
      // Clear all auth-related localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.includes('auth-token') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });

      // Redirect to login after a short delay
      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 1000);
    }
  }

  handleRetry = () => {
    // Clear error state and try again
    this.setState({ hasError: false, error: undefined });
    
    // Also clear any auth storage
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach(key => {
        if (key.includes('auth-token') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
    }
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
          <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">Authentication Error</h1>
            <p className="text-gray-300 mb-6">
              An authentication error occurred. This usually happens when your session has expired.
            </p>
            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.href = '/auth/login'}
                className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
              >
                Go to Login
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-gray-400 cursor-pointer text-sm">Error Details</summary>
                <pre className="text-xs text-gray-500 mt-2 bg-gray-800/50 p-2 rounded overflow-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 