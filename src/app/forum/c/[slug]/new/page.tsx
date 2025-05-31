w'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForum } from '@/hooks/useForum';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import type { ForumCategory } from '@/types/forum';

export default function NewThreadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { getCategoryBySlug, createThread, loading, error } = useForum();
  
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const slug = params.slug as string;

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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login?redirect=' + encodeURIComponent(`/forum/c/${slug}/new`));
    }
  }, [user, authLoading, router, slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !title.trim() || !content.trim()) return;
    
    setSubmitting(true);
    setSubmitError(null);
    
    try {
      const thread = await createThread({
        category_id: category.id,
        title: title.trim(),
        content: content.trim()
      });
      
      if (thread) {
        // Redirect to the new thread
        router.push(`/forum/c/${category.slug}/${thread.slug}`);
      } else {
        setSubmitError('Failed to create thread. Please try again.');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/forum/c/${slug}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6 w-64"></div>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg border border-gray-600 p-8">
              <div className="h-8 bg-gray-700 rounded mb-6 w-48"></div>
              <div className="h-12 bg-gray-700 rounded mb-6"></div>
              <div className="h-32 bg-gray-700 rounded mb-6"></div>
              <div className="h-10 bg-gray-700 rounded w-32"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
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
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center space-x-4 mb-4">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg border border-gray-600/50"
              style={{ 
                backgroundColor: category.color,
                boxShadow: `0 0 10px ${category.color}40, inset 0 0 10px ${category.color}20`
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
              <h1 className="text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                New Thread
              </h1>
              <p className="text-lg text-gray-300">
                Create a new discussion in {category.name}
              </p>
            </div>
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <Link href={`/forum/c/${category.slug}`} className="text-cyan-400 hover:text-cyan-300 transition-colors">
              {category.name}
            </Link>
            <span className="mx-2">→</span>
            <span>New Thread</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {(error || submitError) && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error || submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
          <div className="mb-6">
            <label htmlFor="title" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wider">
              📝 Thread Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a descriptive title for your thread..."
              className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300"
              maxLength={200}
              required
            />
            <div className="text-sm text-gray-400 mt-2">
              {title.length}/200 characters
            </div>
          </div>

          <div className="mb-8">
            <label htmlFor="content" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wider">
              💬 Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your message here..."
              rows={12}
              className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-all duration-300 resize-vertical"
              required
            />
            <div className="text-sm text-gray-400 mt-2">
              {content.length} characters
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105"
            >
              ❌ Cancel
            </button>
            
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
            >
              {submitting ? '🔄 Creating...' : '🚀 Create Thread'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 