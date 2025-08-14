'use client';

import React, { useEffect, useState } from 'react';

interface TripleThreatBackgroundProps {
  opacity?: number;
  children?: React.ReactNode;
}

export default function TripleThreatBackground({ 
  opacity = 0.15,
  children 
}: TripleThreatBackgroundProps) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Parallax Background Image */}
      <div 
        className="fixed inset-0 w-full h-full"
        style={{
          transform: `translateY(${scrollY * 0.5}px)`,
          willChange: 'transform'
        }}
      >
        <div 
          className="absolute inset-0 w-full h-[120vh] bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(/images/triple-threat/tripleThreatImage.png)',
            opacity: opacity
          }}
        />
      </div>

      {/* Enhanced gradient overlays for better text contrast */}
      <div className="fixed inset-0">
        {/* Primary gradient overlay matching the image's cyan-to-pink flow */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-600/15 to-pink-500/10" />
        
        {/* Stronger dark overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-black/40" />
        
        {/* Additional overlay to reduce color bleeding into text areas */}
        <div className="absolute inset-0 bg-black/20" />
        
        {/* Animated floating particles for extra effect */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" 
               style={{ animationDelay: '0s', animationDuration: '3s' }} />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-purple-400 rounded-full animate-pulse" 
               style={{ animationDelay: '1s', animationDuration: '4s' }} />
          <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse" 
               style={{ animationDelay: '2s', animationDuration: '3.5s' }} />
          <div className="absolute top-1/2 right-1/4 w-1 h-1 bg-cyan-300 rounded-full animate-pulse" 
               style={{ animationDelay: '0.5s', animationDuration: '4.5s' }} />
        </div>
      </div>

      {/* Content wrapper */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
