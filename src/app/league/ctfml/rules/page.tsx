'use client';

import React from 'react';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';

const SECTIONS = [
  {
    icon: '🛡️',
    title: 'Squads & Rosters',
    points: [
      'A squad carries up to 7 players, with 5 starters fielded per match.',
      'The squad is your permanent home — it owns your name, logo, and standings record.',
      'Players belong to a squad; squad membership is managed by the squad owner/captain.',
    ],
  },
  {
    icon: '🤝',
    title: 'How Teams Are Built',
    points: [
      'Each match is 10v10: two squads ally to form one team versus another two-squad team.',
      'Pairings are not fixed — squads mix into new pairings throughout the season.',
      'Because pairings change weekly, there is no permanent "team" — only squads.',
    ],
  },
  {
    icon: '🏆',
    title: 'Scoring',
    points: [
      'A win is worth 3 points, a loss 1 point, and a no-show 0 points.',
      'A win is a win — overtime and regulation wins count the same.',
      'A match result applies to all four squads: both winners get a win, both losers a loss.',
    ],
  },
  {
    icon: '🥇',
    title: 'Playoffs',
    points: [
      'Playoff seeding is determined by regular-season record (best record seeds highest).',
      'Playoffs are single elimination.',
      'Playoff and finals matches do not affect regular-season standings.',
    ],
  },
];

export default function CtfmlRulesPage() {
  return (
    <CtfmlBackground opacity={0.16}>
      <CtfmlHeader currentPage="rules" />

      <div className="relative pt-32 pb-20 z-10 max-w-4xl mx-auto px-6">
        <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent drop-shadow-lg mb-3">
          CTFML Rules
        </h1>
        <p className="text-white/80 mb-10">
          Capture the Flag Mix League — format and competition guidelines.
        </p>

        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <div
              key={s.title}
              className="bg-gradient-to-br from-emerald-400/5 to-teal-600/10 backdrop-blur-sm border border-emerald-300/30 rounded-2xl p-6"
            >
              <h2 className="text-2xl font-bold text-emerald-200 mb-4 flex items-center gap-3">
                <span className="text-3xl">{s.icon}</span>
                {s.title}
              </h2>
              <ul className="space-y-2">
                {s.points.map((p, i) => (
                  <li key={i} className="text-white/90 flex items-start gap-3">
                    <span className="text-teal-400 mt-1.5 flex-shrink-0">▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </CtfmlBackground>
  );
}
