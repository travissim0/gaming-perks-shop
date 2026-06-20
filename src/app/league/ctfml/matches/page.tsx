'use client';

import React from 'react';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';

export default function CtfmlMatchesPage() {
  return (
    <CtfmlBackground opacity={0.16}>
      <CtfmlHeader currentPage="matches" />

      <div className="relative pt-32 pb-20 z-10 max-w-5xl mx-auto px-6">
        <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent drop-shadow-lg mb-8">
          Matches
        </h1>

        <div className="bg-amber-400/5 border border-amber-300/30 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">⚔️</div>
          <h2 className="text-2xl font-bold text-amber-200 mb-2">Coming soon</h2>
          <p className="text-white/70 max-w-xl mx-auto">
            Fixtures and results will show here once match recording is wired up.
            Each match is two squads per side — results apply to all four squads.
          </p>
        </div>
      </div>
    </CtfmlBackground>
  );
}
