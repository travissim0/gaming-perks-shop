'use client';

import React from 'react';
import Link from 'next/link';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';

const CARDS = [
  {
    href: '/league/ctfml/rules',
    emoji: '📋',
    title: 'RULES',
    blurb: 'Format, roster limits, and how mix teams are built.',
    accent: 'from-emerald-400/10 to-emerald-600/20 border-emerald-300/50 hover:border-emerald-200/70 hover:shadow-emerald-400/30',
    title_color: 'text-emerald-200',
    body_color: 'text-emerald-100/90',
  },
  {
    href: '/league/ctfml/squads',
    emoji: '🛡️',
    title: 'SQUADS',
    blurb: 'View, create, or join a 5-7 player squad.',
    accent: 'from-teal-400/10 to-teal-600/20 border-teal-300/50 hover:border-teal-200/70 hover:shadow-teal-400/30',
    title_color: 'text-teal-200',
    body_color: 'text-teal-100/90',
  },
  {
    href: '/league/ctfml/standings',
    emoji: '📊',
    title: 'STANDINGS',
    blurb: 'Season records and playoff seeding.',
    accent: 'from-sky-400/10 to-sky-600/20 border-sky-300/50 hover:border-sky-200/70 hover:shadow-sky-400/30',
    title_color: 'text-sky-200',
    body_color: 'text-sky-100/90',
  },
  {
    href: '/league/ctfml/matches',
    emoji: '⚔️',
    title: 'MATCHES',
    blurb: 'Upcoming fixtures and results — two squads per side.',
    accent: 'from-amber-400/10 to-orange-600/20 border-amber-300/50 hover:border-amber-200/70 hover:shadow-amber-400/30',
    title_color: 'text-amber-200',
    body_color: 'text-amber-100/90',
  },
];

export default function CtfmlPage() {
  return (
    <CtfmlBackground opacity={0.22}>
      <CtfmlHeader currentPage="home" />

      {/* Hero */}
      <div className="relative pt-32 pb-16 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/8 to-transparent" />
        <div className="relative max-w-5xl mx-auto px-6 text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent drop-shadow-lg">
            Capture the Flag Mix League
          </h1>
          <p className="text-lg md:text-xl text-white/90 leading-relaxed max-w-3xl mx-auto">
            <strong className="text-emerald-300">CTFML</strong> is a{' '}
            <span className="text-teal-300 font-semibold">10v10</span> twist on CTF:
            two <span className="text-sky-300 font-semibold">5-player</span> squads
            ally to form one team and battle another pair of squads. Rosters run up
            to <span className="text-emerald-300 font-semibold">7</span>, pairings
            shift week to week, and every squad climbs its own ladder.
          </p>
        </div>
      </div>

      {/* Mission control cards */}
      <div className="max-w-6xl mx-auto px-6 -mt-4 relative z-10 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {CARDS.map((c) => (
            <Link key={c.href} href={c.href} className="group relative">
              <div className={`bg-gradient-to-br ${c.accent} backdrop-blur-sm border rounded-2xl p-8 hover:scale-105 transition-all duration-500 hover:shadow-2xl h-full`}>
                <div className="relative text-center">
                  <div className="text-5xl mb-6 filter drop-shadow-lg">{c.emoji}</div>
                  <h3 className={`text-2xl font-bold mb-4 ${c.title_color}`}>{c.title}</h3>
                  <p className={c.body_color}>{c.blurb}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </CtfmlBackground>
  );
}
