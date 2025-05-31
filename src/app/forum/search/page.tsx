'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import type { ForumThread, ForumPost } from '@/types/forum';

function ForumSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { searchForum, loading, error } = useForum();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<{ threads: ForumThread[], posts: ForumPost[], total: number }>({
    threads: [],
    posts: [],
    total: 0
  });
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      performSearch(urlQuery);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setHasSearched(true);
    
    try {
      const searchResults = await searchForum({
        query: searchQuery.trim(),
        type: 'both'
      });
      setResults(searchResults);
    } catch (err) {
      console.error('Search error:', err);
      setResults({ threads: [], posts: [], total: 0 });
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    // Update URL with search query
    const newUrl = `/forum/search?q=${encodeURIComponent(query.trim())}`;
    router.push(newUrl);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg border border-green-500/50">
              🔍
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                Search Forum
              </h1>
              <p className="text-gray-400 text-sm mt-1">Find discussions and posts</p>
            </div>
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <span>Search</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Search Form */}
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl mb-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex space-x-4">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for threads, posts, or keywords..."
                className="flex-1 bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300"
              />
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
              >
                {searching ? '🔄 Searching...' : '🔍 Search'}
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {searching ? (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="w-12 h-12 bg-gray-700 rounded-lg"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : hasSearched ? (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className="text-center text-gray-400 text-sm">
              {results.total > 0 ? (
                <>Found {results.total} result{results.total !== 1 ? 's' : ''} for "{query}"</>
              ) : (
                <>No results found for "{query}"</>
              )}
            </div>

            {/* Thread Results */}
            {results.threads.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-green-400 tracking-wider">📋 Threads</h2>
                {results.threads.map((thread) => (
                  <div key={thread.id} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                    <div className="flex items-start space-x-4">
                      <UserAvatar user={thread.author || {}} size="md" />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/forum/c/${thread.category?.slug}/${thread.slug}`}
                          className="text-cyan-400 font-bold text-lg hover:text-cyan-300 transition-colors block mb-2"
                        >
                          {thread.title}
                        </Link>
                        <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
                          <span>by {thread.author?.in_game_alias || 'Anonymous'}</span>
                          <span>in {thread.category?.name}</span>
                          <span>👁️ {thread.view_count}</span>
                          <span>💬 {thread.reply_count}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Created: {formatDate(thread.created_at)}
                          {thread.last_reply_at && (
                            <>
                              <span className="mx-2">•</span>
                              Last reply: {formatDate(thread.last_reply_at)}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Post Results */}
            {results.posts.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-purple-400 tracking-wider">💬 Posts</h2>
                {results.posts.map((post) => (
                  <div key={post.id} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                    <div className="flex items-start space-x-4">
                      <UserAvatar user={post.author || {}} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-gray-300 font-medium">{post.author?.in_game_alias || 'Anonymous'}</span>
                          <span className="text-gray-500 text-sm">posted a reply</span>
                        </div>
                        <div className="text-gray-300 mb-2 line-clamp-3">
                          {post.content.slice(0, 200)}
                          {post.content.length > 200 && '...'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Posted: {formatDate(post.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No Results */}
            {results.total === 0 && (
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl text-center">
                <div className="text-gray-500 text-6xl mb-4">🔍</div>
                <div className="text-gray-500 text-lg mb-2">No Results Found</div>
                <div className="text-gray-600 text-sm mb-6">
                  Try different keywords or check your spelling.
                </div>
                <Link 
                  href="/forum"
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 inline-block"
                >
                  🚀 Browse Forum
                </Link>
              </div>
            )}
          </div>
        ) : (
          /* Initial State */
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl text-center">
            <div className="text-gray-500 text-6xl mb-4">🔍</div>
            <div className="text-gray-500 text-lg mb-2">Search the Forum</div>
            <div className="text-gray-600 text-sm">
              Enter keywords to find threads and posts that match your interests.
            </div>
          </div>
        )}

        {/* Search Tips */}
        <div className="mt-8 bg-gradient-to-b from-gray-800 to-gray-900 border border-blue-500/30 rounded-lg p-6 shadow-xl">
          <h3 className="text-lg font-bold text-blue-400 mb-4 tracking-wider">
            💡 Search Tips
          </h3>
          <div className="space-y-2 text-gray-300 text-sm">
            <div>• Use specific keywords for better results</div>
            <div>• Search for author names, categories, or topics</div>
            <div>• Results include both thread titles and post content</div>
            <div>• Try different variations of your search terms</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForumSearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-8">
              <div className="h-8 bg-gray-700 rounded mb-6 w-48"></div>
              <div className="h-12 bg-gray-700 rounded mb-6"></div>
              <div className="h-32 bg-gray-700 rounded mb-6"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <ForumSearchContent />
    </Suspense>
  );
} 