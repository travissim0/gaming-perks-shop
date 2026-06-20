'use client';

import React, { useEffect, useState } from 'react';

interface CtfmlBackgroundProps {
  opacity?: number;
  children?: React.ReactNode;
}

/**
 * Branded backdrop for the CTFML (Capture the Flag Mix League) section.
 * Emerald/teal/sky palette to distinguish it from Triple Threat (cyan/purple)
 * and the main CTFPL theme. Gradient-only (no image dependency).
 */
export default function CtfmlBackground({
  opacity = 0.18,
  children,
}: CtfmlBackgroundProps) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden bg-gray-950">
      {/* Parallax glow layer */}
      <div
        className="fixed inset-0 w-full h-full"
        style={{ transform: `translateY(${scrollY * 0.4}px)`, willChange: 'transform' }}
      >
        <div
          className="absolute inset-0 w-full h-[120vh] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 20%, rgba(16,185,129,0.35), transparent 45%), radial-gradient(circle at 80% 60%, rgba(45,212,191,0.30), transparent 50%), radial-gradient(circle at 50% 100%, rgba(56,189,248,0.25), transparent 55%)',
            opacity,
          }}
        />
      </div>

      {/* Gradient + dark overlays for text contrast */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-teal-600/15 to-sky-500/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/45" />
        <div className="absolute inset-0 bg-black/20" />

        {/* Floating particles */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-emerald-400 rounded-full animate-pulse"
               style={{ animationDelay: '0s', animationDuration: '3s' }} />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-teal-400 rounded-full animate-pulse"
               style={{ animationDelay: '1s', animationDuration: '4s' }} />
          <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse"
               style={{ animationDelay: '2s', animationDuration: '3.5s' }} />
          <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-emerald-300 rounded-full animate-pulse"
               style={{ animationDelay: '0.5s', animationDuration: '4.5s' }} />
        </div>
      </div>

      <div className="relative z-10">{children}</div>
    </div>
  );
}
