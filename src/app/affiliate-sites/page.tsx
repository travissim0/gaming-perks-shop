'use client';

import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

const affiliateSites = [
  {
    name: 'Free Infantry',
    url: 'https://www.freeinfantry.com',
    image: '/images/sites/freeinfantrydotcom.png',
          description: 'The main Free Infantry community hub featuring news, forums, downloads, and everything you need to get started playing Free Infantry.',
    tags: ['Community', 'Downloads', 'News']
  },
  {
    name: 'USL Zone',
    url: 'https://www.uslzone.com',
    image: '/images/sites/uslzone.png',
          description: 'The United Squad League - Home of competitive Free Infantry leagues, tournaments, and organized team-based gameplay.',
    tags: ['Competitive', 'Leagues', 'Teams']
  },
  {
    name: 'Infantry Archive',
    url: 'https://www.infantryarchive.com',
    image: '/images/sites/infantryarchive.png',
          description: 'Preserving Free Infantry history with archived maps, mods, documentation, and memories from the game\'s rich past.',
    tags: ['Archive', 'History', 'Maps']
  }
];

export default function AffiliateSitesPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <Navbar user={user} />
      
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Infantry Community Sites
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Explore the broader Free Infantry community through these essential websites that keep our game alive and thriving.
          </p>
        </div>

        {/* Sites Grid */}
        <div className="grid md:grid-cols-1 lg:grid-cols-1 gap-8 max-w-4xl mx-auto">
          {affiliateSites.map((site, index) => (
            <div 
              key={site.name}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
            >
              <div className="md:flex">
                {/* Image Section */}
                <div className="md:w-1/2 relative">
                  <div className="aspect-video md:aspect-square relative overflow-hidden">
                    <Image
                      src={site.image}
                      alt={`${site.name} website screenshot`}
                      fill
                      className="object-cover object-top hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </div>
                </div>

                {/* Content Section */}
                <div className="md:w-1/2 p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-2xl font-bold text-white">
                      {site.name}
                    </h2>
                    <ExternalLink className="w-5 h-5 text-blue-400" />
                  </div>

                  <p className="text-gray-300 mb-6 leading-relaxed">
                    {site.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {site.tags.map((tag) => (
                      <span 
                        key={tag}
                        className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Visit Button */}
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 self-start"
                  >
                    Visit {site.name}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-16 p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <h3 className="text-2xl font-bold text-white mb-4">
            Join the Infantry Community
          </h3>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            These sites work together to keep Free Infantry alive and growing. Each serves a unique purpose in our community ecosystem.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <span className="px-4 py-2 bg-green-500/20 text-green-300 rounded-full text-sm">
              🎮 Active Community
            </span>
            <span className="px-4 py-2 bg-orange-500/20 text-orange-300 rounded-full text-sm">
              🏆 Competitive Play
            </span>
            <span className="px-4 py-2 bg-purple-500/20 text-purple-300 rounded-full text-sm">
              📚 Rich History
            </span>
          </div>
        </div>
      </div>
    </div>
  );
} 