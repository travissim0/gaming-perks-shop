'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: any; // Changed from Error to any to handle malformed errors
  retryCount: number;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: any): State {
    // Enhanced error logging to debug empty error objects
    console.error('🚨 AuthErrorBoundary caught error - raw error:', error);
    console.error('🚨 Error type:', typeof error);
    console.error('🚨 Error constructor:', error?.constructor?.name);
    console.error('🚨 Error keys:', Object.keys(error || {}));
    
    // Handle both Error objects and other thrown values
    const errorMessage = error?.message || error?.toString?.() || String(error) || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace available';
    
    // Check if this is an auth-related error
    const isAuthError = (
      errorMessage.toLowerCase().includes('refresh token not found') ||
      errorMessage.toLowerCase().includes('invalid refresh token') ||
      errorMessage.toLowerCase().includes('auth') ||
      errorMessage.toLowerCase().includes('token') ||
      errorMessage.toLowerCase().includes('session') ||
      errorMessage.toLowerCase().includes('unauthorized')
    );

    console.error('🚨 AuthErrorBoundary processed error:', {
      originalError: error,
      message: errorMessage,
      isAuthError,
      stack: errorStack,
      hasMessage: !!error?.message,
      hasStack: !!error?.stack,
      errorType: typeof error
    });

    return { hasError: true, error: { message: errorMessage, stack: errorStack, original: error }, retryCount: 0 };
  }

  componentDidCatch(error: any, errorInfo: React.ErrorInfo) {
    console.error('🚨 AuthErrorBoundary componentDidCatch:', {
      error: error,
      errorType: typeof error,
      errorKeys: Object.keys(error || {}),
      message: error?.message || error?.toString?.() || String(error),
      stack: error?.stack,
      componentStack: errorInfo.componentStack
    });

    // Handle both Error objects and other thrown values
    const errorMessage = error?.message || error?.toString?.() || String(error) || '';
    
    // If it's an auth error, clear storage and prepare for redirect
    const isAuthError = (
      errorMessage.toLowerCase().includes('refresh token not found') ||
      errorMessage.toLowerCase().includes('invalid refresh token') ||
      errorMessage.toLowerCase().includes('auth') ||
      errorMessage.toLowerCase().includes('token') ||
      errorMessage.toLowerCase().includes('session') ||
      errorMessage.toLowerCase().includes('unauthorized')
    );

    if (isAuthError && typeof window !== 'undefined') {
      console.log('🧹 Clearing auth data due to error boundary');
      
      // Clear all auth-related localStorage
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      } catch (storageError) {
        console.warn('Failed to clear localStorage:', storageError);
      }

      // Show error for a moment before redirect
      setTimeout(() => {
        if (this.state.retryCount >= 2) {
          window.location.href = '/auth/login';
        }
      }, 3000);
    }
  }

  handleRetry = () => {
    console.log('🔄 AuthErrorBoundary retry requested');
    
    // Clear error state and try again
    this.setState(prevState => ({ 
      hasError: false, 
      error: undefined,
      retryCount: prevState.retryCount + 1
    }));
    
    // Also clear any auth storage
    if (typeof window !== 'undefined') {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      } catch (storageError) {
        console.warn('Failed to clear localStorage during retry:', storageError);
      }
    }
  };

  handleGoToLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'Unknown error occurred';
      const isAuthError = errorMessage.toLowerCase().includes('auth') ||
                         errorMessage.toLowerCase().includes('token') ||
                         errorMessage.toLowerCase().includes('session');
      
      const shouldAllowRetry = this.state.retryCount < 3;
      
      return this.props.fallback || (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
          <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              {isAuthError ? 'Authentication Error' : 'Application Error'}
            </h1>
            <p className="text-gray-300 mb-4">
              {isAuthError 
                ? 'Your session has expired or become invalid.'
                : 'An unexpected error occurred in the application.'
              }
            </p>
            
            {this.state.error && (
              <div className="bg-gray-800/50 border border-gray-600 rounded p-3 mb-6 text-left">
                <p className="text-xs text-gray-400 font-mono break-all">
                  {errorMessage}
                </p>
                {this.state.error.original && typeof this.state.error.original === 'object' && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">Debug Info</summary>
                    <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                      {JSON.stringify(this.state.error.original, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {this.state.retryCount > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 mb-4">
                <p className="text-yellow-400 text-sm">
                  Retry attempt {this.state.retryCount}/3
                </p>
              </div>
            )}
            
            <div className="space-y-3">
              {shouldAllowRetry && (
                <button
                  onClick={this.handleRetry}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
                >
                  {this.state.retryCount > 0 ? 'Try Again' : 'Retry'}
                </button>
              )}
              
              <button
                onClick={this.handleGoToLogin}
                className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
              >
                {this.state.retryCount >= 3 ? 'Go to Login' : 'Login Page'}
              </button>
              
              {!shouldAllowRetry && (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
                >
                  Reload Page
                </button>
              )}
            </div>
            
            <p className="text-gray-500 text-xs mt-4">
              If this continues, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 