'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';

const guides = [
  {
    id: 'combat-engineer',
    name: 'Combat Engineer',
    description: 'Master the art of mining, repairing, and strategic support',
    color: 'from-amber-600 to-yellow-600',
    borderColor: 'border-amber-500/30',
    icon: '⛏️',
    available: true
  },
  {
    id: 'heavy-weapons',
    name: 'Heavy Weapons',
    description: 'Dominate the battlefield with devastating firepower',
    color: 'from-red-600 to-orange-600',
    borderColor: 'border-red-500/30',
    icon: '🚀',
    available: false
  },
  {
    id: 'rifleman',
    name: 'Rifleman',
    description: 'Versatile combat tactics and weapon mastery',
    color: 'from-green-600 to-emerald-600',
    borderColor: 'border-green-500/30',
    icon: '🎯',
    available: false
  },
  {
    id: 'sniper',
    name: 'Sniper',
    description: 'Precision strikes and long-range elimination',
    color: 'from-purple-600 to-violet-600',
    borderColor: 'border-purple-500/30',
    icon: '🔭',
    available: false
  }
];

export default function GuidesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h1 className="text-6xl font-bold text-cyan-400 mb-6 tracking-wider">
            📚 CLASS GUIDES
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Master every class with our comprehensive interactive guides. Learn tactics, strategies, 
            and advanced techniques from experienced players.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {guides.map((guide, index) => (
            <motion.div
              key={guide.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              {guide.available ? (
                <Link href={`/guides/${guide.id}`}>
                  <div className={`bg-gradient-to-br ${guide.color} p-8 rounded-lg border ${guide.borderColor} shadow-2xl hover:shadow-cyan-500/20 transition-all duration-300 transform hover:-translate-y-2 hover:scale-105 cursor-pointer`}>
                    <div className="text-center">
                      <div className="text-6xl mb-4">{guide.icon}</div>
                      <h2 className="text-3xl font-bold text-white mb-4">{guide.name}</h2>
                      <p className="text-gray-100 text-lg leading-relaxed mb-6">{guide.description}</p>
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg py-3 px-6 inline-block">
                        <span className="text-white font-bold">📖 START GUIDE</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className={`bg-gradient-to-br from-gray-700 to-gray-800 p-8 rounded-lg border border-gray-600 shadow-2xl opacity-60`}>
                  <div className="text-center">
                    <div className="text-6xl mb-4 grayscale">{guide.icon}</div>
                    <h2 className="text-3xl font-bold text-gray-300 mb-4">{guide.name}</h2>
                    <p className="text-gray-400 text-lg leading-relaxed mb-6">{guide.description}</p>
                    <div className="bg-gray-600/50 backdrop-blur-sm rounded-lg py-3 px-6 inline-block">
                      <span className="text-gray-300 font-bold">🔒 COMING SOON</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-center mt-16"
        >
          <div className="bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-8 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-cyan-400 mb-4">🎮 Interactive Learning</h3>
            <p className="text-gray-300 leading-relaxed">
              Our guides feature scroll-triggered animations, interactive elements, and practical 
              training exercises. Experience a new way to learn Infantry Online tactics!
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
} 