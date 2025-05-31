'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import type { ForumCategory, ForumThread } from '@/types/forum';

const ThreadRow = ({ thread }: { thread: ForumThread }) => {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 hover:border-cyan-400/50 hover:shadow-cyan-500/20 hover:shadow-lg transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3 mb-3">
            {thread.is_pinned && (
              <span className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white text-xs px-3 py-1 rounded-full font-bold tracking-wider">
                📌 PINNED
              </span>
            )}
            {thread.is_locked && (
              <span className="bg-gradient-to-r from-red-600 to-red-700 text-white text-xs px-3 py-1 rounded-full font-bold tracking-wider">
                🔒 LOCKED
              </span>
            )}
          </div>
          
          <Link 
            href={`/forum/c/${thread.category?.slug}/${thread.slug}`}
            className="text-xl font-bold text-cyan-400 hover:text-cyan-300 hover:text-shadow-glow transition-all duration-300 line-clamp-2 tracking-wide"
          >
            {thread.title}
          </Link>
          
          <div className="flex items-center text-sm text-gray-400 mt-3 space-x-6">
            <div className="flex items-center space-x-2">
              <span className="text-green-400">👤</span>
              <span>By {thread.author?.in_game_alias || thread.author?.email || 'Unknown'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-blue-400">🕒</span>
              <span>{formatTimeAgo(thread.created_at)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-purple-400">👁️</span>
              <span>{thread.view_count} views</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end text-sm text-gray-300 ml-6">
          <div className="font-bold text-yellow-400 text-lg">
            {thread.reply_count} replies
          </div>
          {thread.last_reply_user && (
            <div className="text-xs mt-2 text-cyan-400">
              Last by {thread.last_reply_user.in_game_alias || thread.last_reply_user.email}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {formatTimeAgo(thread.last_reply_at)}
          </div>
        </div>
      </div>
    </div>
  );
};

const SortSelect = ({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (value: 'latest' | 'oldest' | 'most_replies' | 'most_views') => void;
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as any)}
      className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg px-4 py-2 text-cyan-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 font-medium"
    >
      <option value="latest">Latest Activity</option>
      <option value="oldest">Oldest First</option>
      <option value="most_replies">Most Replies</option>
      <option value="most_views">Most Views</option>
    </select>
  );
};

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const showPages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
  let endPage = Math.min(totalPages, startPage + showPages - 1);

  if (endPage - startPage + 1 < showPages) {
    startPage = Math.max(1, endPage - showPages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const buttonClass = "px-4 py-2 text-sm border border-cyan-500/30 rounded-lg font-medium transition-all duration-300";
  const activeButtonClass = "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-cyan-500/25 shadow-lg";
  const inactiveButtonClass = "bg-gradient-to-b from-gray-800 to-gray-900 text-cyan-400 hover:border-cyan-400 hover:shadow-cyan-500/20 hover:shadow-md";
  const disabledButtonClass = "opacity-50 cursor-not-allowed";

  return (
    <div className="flex items-center justify-center space-x-3 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`${buttonClass} ${inactiveButtonClass} ${currentPage === 1 ? disabledButtonClass : ''}`}
      >
        ← Previous
      </button>
      
      {startPage > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className={`${buttonClass} ${inactiveButtonClass}`}
          >
            1
          </button>
          {startPage > 2 && <span className="text-gray-500">...</span>}
        </>
      )}
      
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`${buttonClass} ${
            page === currentPage ? activeButtonClass : inactiveButtonClass
          }`}
        >
          {page}
        </button>
      ))}
      
      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="text-gray-500">...</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className={`${buttonClass} ${inactiveButtonClass}`}
          >
            {totalPages}
          </button>
        </>
      )}
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`${buttonClass} ${inactiveButtonClass} ${currentPage === totalPages ? disabledButtonClass : ''}`}
      >
        Next →
      </button>
    </div>
  );
};

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { getCategoryBySlug, getThreads, loading, error } = useForum();
  
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'most_replies' | 'most_views'>('latest');
  
  const slug = params.slug as string;
  const threadsPerPage = 20;

  useEffect(() => {
    const loadCategory = async () => {
      if (!slug) return;
      
      const categoryData = await getCategoryBySlug(slug);
      if (!categoryData) {
        router.push('/forum');
        return;
      }
      setCategory(categoryData);
    };

    loadCategory();
  }, [slug, router]);

  useEffect(() => {
    const loadThreads = async () => {
      if (!category) return;
      
      const threadsData = await getThreads({
        category_id: category.id,
        page: currentPage,
        per_page: threadsPerPage,
        sort: sortBy
      });
      
      setThreads(threadsData.threads);
      setTotalPages(Math.ceil(threadsData.total / threadsPerPage));
    };

    loadThreads();
  }, [category, currentPage, sortBy]);

  const handleSortChange = (newSort: typeof sortBy) => {
    setSortBy(newSort);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-6">
                  <div className="h-6 bg-gray-700 rounded mb-3 w-3/4"></div>
                  <div className="h-4 bg-gray-700 rounded mb-2 w-1/2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-16 bg-gradient-to-b from-gray-800 to-gray-900 border border-red-500/30 rounded-lg shadow-2xl">
            <div className="text-6xl text-red-500 mb-6">🚫</div>
            <h1 className="text-2xl font-bold text-red-400 mb-4 tracking-wider">Category Not Found</h1>
            <p className="text-gray-300 mb-6">The requested category does not exist or has been removed.</p>
            <Link 
              href="/forum"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105"
            >
              🔙 Back to Forum
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-4 mb-4">
                <div 
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold shadow-lg border border-gray-600/50"
                  style={{ 
                    backgroundColor: category.color,
                    boxShadow: `0 0 15px ${category.color}40, inset 0 0 15px ${category.color}20`
                  }}
                >
                  {category.icon === 'chat' && '💬'}
                  {category.icon === 'shield' && '🛡️'}
                  {category.icon === 'users' && '👥'}
                  {category.icon === 'trophy' && '🏆'}
                  {category.icon === 'wrench' && '🔧'}
                  {category.icon === 'megaphone' && '📢'}
                  {!category.icon && '📁'}
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-cyan-400 mb-2 tracking-wider text-shadow-glow">
                    {category.name}
                  </h1>
                  <p className="text-xl text-gray-300 leading-relaxed">
                    {category.description}
                  </p>
                </div>
              </div>
              
              <nav className="text-sm text-gray-400">
                <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  🏠 Forum
                </Link>
                <span className="mx-2">→</span>
                <span>{category.name}</span>
              </nav>
            </div>
            
            {user && (
              <Link
                href={`/forum/c/${category.slug}/new`}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 hover:shadow-cyan-500/25"
              >
                📝 New Thread
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold text-cyan-400 tracking-wider">📝 Threads</h2>
            <span className="text-gray-400">({threads.length} threads)</span>
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-gray-300 font-medium">Sort by:</label>
            <SortSelect value={sortBy} onChange={handleSortChange} />
          </div>
        </div>

        {/* Threads */}
        {threads.length === 0 ? (
          <div className="text-center py-16 bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl">
            <div className="text-6xl text-gray-500 mb-6">📡</div>
            <h3 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">No Threads Yet</h3>
            <p className="text-gray-300 max-w-md mx-auto leading-relaxed mb-6">
              This category is currently empty. Be the first to start a discussion.
            </p>
            {user && (
              <Link
                href={`/forum/c/${category.slug}/new`}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105"
              >
                🚀 Start First Thread
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {threads.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} />
            ))}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
} 