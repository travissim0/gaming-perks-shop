'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import type { ForumThread, ForumPost } from '@/types/forum';

export default function ForumSearchPage() {
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
  const [searchType, setSearchType] = useState<'both' | 'threads' | 'posts'>('both');
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const initialQuery = searchParams.get('q');
    if (initialQuery) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setHasSearched(true);
    const searchResults = await searchForum({
      query: searchQuery.trim(),
      type: searchType
    });
    
    setResults(searchResults);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    // Update URL with search query
    const newUrl = `/forum/search?q=${encodeURIComponent(query.trim())}`;
    router.push(newUrl);
    
    performSearch(query);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold shadow-lg border border-cyan-500/50">
              🔍
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                Forum Search
              </h1>
              <p className="text-gray-400 text-sm mt-1">Search threads and posts</p>
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
        {/* Search Form */}
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl mb-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="search" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wider">
                🔍 Search Forums
              </label>
              <input
                id="search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your search terms..."
                className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300"
                required
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-4">
                <span className="text-gray-400 font-medium">Search in:</span>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="both"
                    checked={searchType === 'both'}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="text-cyan-500"
                  />
                  <span className="text-gray-300">Both</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="threads"
                    checked={searchType === 'threads'}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="text-cyan-500"
                  />
                  <span className="text-gray-300">Threads</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="posts"
                    checked={searchType === 'posts'}
                    onChange={(e) => setSearchType(e.target.value as any)}
                    className="text-cyan-500"
                  />
                  <span className="text-gray-300">Posts</span>
                </label>
              </div>
              
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
              >
                {loading ? '🔄 Searching...' : '🚀 Search'}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div className="space-y-6">
            {results.total > 0 ? (
              <>
                <div className="text-center text-gray-400 text-sm">
                  Found {results.total} result{results.total !== 1 ? 's' : ''} for "{query}"
                </div>

                {/* Thread Results */}
                {results.threads.length > 0 && (
                  <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-green-400 mb-4 tracking-wider">
                      📝 Threads ({results.threads.length})
                    </h3>
                    <div className="space-y-4">
                      {results.threads.map((thread) => (
                        <Link
                          key={thread.id}
                          href={`/forum/c/${thread.category?.slug}/${thread.slug}`}
                          className="block bg-gray-700/30 border border-gray-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300"
                        >
                          <div className="flex items-start space-x-3">
                            <UserAvatar user={thread.author || {}} size="sm" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-cyan-400 font-bold hover:text-cyan-300 mb-2">
                                {thread.title}
                              </h4>
                              <p className="text-gray-300 text-sm line-clamp-2 mb-2">
                                {thread.content.substring(0, 200)}...
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-gray-400">
                                <span>by {thread.author?.in_game_alias || 'Anonymous'}</span>
                                <span>in {thread.category?.name}</span>
                                <span>{formatDate(thread.created_at)}</span>
                                <span>👁️ {thread.view_count}</span>
                                <span>💬 {thread.reply_count}</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Post Results */}
                {results.posts.length > 0 && (
                  <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-purple-400 mb-4 tracking-wider">
                      💬 Posts ({results.posts.length})
                    </h3>
                    <div className="space-y-4">
                      {results.posts.map((post) => (
                        <div
                          key={post.id}
                          className="bg-gray-700/30 border border-gray-600 rounded-lg p-4"
                        >
                          <div className="flex items-start space-x-3">
                            <UserAvatar user={post.author || {}} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-300 text-sm mb-3 line-clamp-3">
                                {post.content.substring(0, 300)}...
                              </p>
                              <div className="flex items-center space-x-4 text-xs text-gray-400">
                                <span>by {post.author?.in_game_alias || 'Anonymous'}</span>
                                <span>{formatDate(post.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl text-center">
                <div className="text-gray-500 text-lg mb-2">No results found</div>
                <div className="text-gray-600 text-sm">
                  Try different search terms or check your spelling
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Tips */}
        {!hasSearched && (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
            <h3 className="text-xl font-bold text-yellow-400 mb-4 tracking-wider">
              💡 Search Tips
            </h3>
            <div className="space-y-2 text-gray-300 text-sm">
              <div>• Use specific keywords related to your topic</div>
              <div>• Search for user names to find their posts</div>
              <div>• Use quotes for exact phrases: "capture the flag"</div>
              <div>• Choose between searching threads only, posts only, or both</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 