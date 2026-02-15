'use client';

import React, { useMemo } from 'react';

const STAR_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#cce0ff', '#ffe8d6', '#b4dcff', '#dcc8ff', '#c8ffff'];

const generateEnhancedStars = (count: number, type: 'dust' | 'medium' | 'bright' | 'feature') => {
  return Array.from({ length: count }, (_, i) => {
    const color = type === 'dust' ? '#ffffff' : STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    let size: number, opacity: number;
    switch (type) {
      case 'dust':
        size = Math.random() * 1 + 0.3;
        opacity = Math.random() * 0.25 + 0.05;
        break;
      case 'medium':
        size = Math.random() * 1.5 + 0.5;
        opacity = Math.random() * 0.4 + 0.15;
        break;
      case 'bright':
        size = Math.random() * 2 + 1;
        opacity = Math.random() * 0.5 + 0.3;
        break;
      case 'feature':
        size = Math.random() * 2.5 + 2;
        opacity = Math.random() * 0.4 + 0.5;
        break;
    }
    return {
      id: `${type}-${i}`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size,
      opacity,
      color,
      animationDuration: `${Math.random() * 5 + 3}s`,
      animationDelay: `${Math.random() * 5}s`,
    };
  });
};

const generateWarpStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 800 + Math.random() * 800;
    const originX = (Math.random() - 0.5) * 80;
    const originY = (Math.random() - 0.5) * 80;
    return {
      id: `warp-${i}`,
      originX,
      originY,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      size: Math.random() * 1.5 + 0.5,
      duration: Math.random() * 6 + 4,
      delay: Math.random() * 10,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
};

export default function SpaceBackground() {
  const stars = useMemo(() => ({
    dust: generateEnhancedStars(150, 'dust'),
    medium: generateEnhancedStars(80, 'medium'),
    bright: generateEnhancedStars(40, 'bright'),
    feature: generateEnhancedStars(8, 'feature'),
    warp: generateWarpStars(70),
  }), []);

  return (
    <>
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Deep space gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #060610 0%, #0a0e1a 30%, #0d1020 50%, #0a0e1a 70%, #060610 100%)',
        }} />

        {/* Animated nebula layers */}
        <div className="absolute inset-0 nebula-drift-1" style={{
          background: 'radial-gradient(ellipse at 25% 15%, rgba(34, 211, 238, 0.07) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(34, 211, 238, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-2" style={{
          background: 'radial-gradient(ellipse at 75% 25%, rgba(139, 92, 246, 0.06) 0%, transparent 45%), radial-gradient(ellipse at 15% 75%, rgba(139, 92, 246, 0.04) 0%, transparent 40%)',
        }} />
        <div className="absolute inset-0 nebula-drift-3" style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(236, 72, 153, 0.04) 0%, transparent 35%), radial-gradient(ellipse at 30% 60%, rgba(59, 130, 246, 0.05) 0%, transparent 45%)',
        }} />

        {/* Star dust layer */}
        {stars.dust.map((star) => (
          <div key={star.id} className="absolute rounded-full" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
          }} />
        ))}

        {/* Medium twinkling stars */}
        {stars.medium.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}

        {/* Bright stars with bloom glow */}
        {stars.bright.map((star) => (
          <div key={star.id} className="absolute rounded-full animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            backgroundColor: star.color,
            opacity: star.opacity,
            boxShadow: `0 0 ${star.size * 3}px ${star.color}50, 0 0 ${star.size * 6}px ${star.color}25`,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}

        {/* Feature stars with diffraction cross-spikes */}
        {stars.feature.map((star) => (
          <div key={star.id} className="absolute" style={{ left: star.left, top: star.top }}>
            <div className="absolute rounded-full animate-pulse" style={{
              width: star.size, height: star.size,
              backgroundColor: star.color,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 4}px ${star.color}60, 0 0 ${star.size * 10}px ${star.color}30, 0 0 ${star.size * 20}px ${star.color}10`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
            <div className="absolute animate-pulse" style={{
              width: star.size * 8, height: 1,
              top: star.size / 2, left: -(star.size * 3.5),
              background: `linear-gradient(90deg, transparent, ${star.color}30, ${star.color}60, ${star.color}30, transparent)`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
            <div className="absolute animate-pulse" style={{
              width: 1, height: star.size * 8,
              left: star.size / 2, top: -(star.size * 3.5),
              background: `linear-gradient(180deg, transparent, ${star.color}30, ${star.color}60, ${star.color}30, transparent)`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
          </div>
        ))}

        {/* Warp stars */}
        {stars.warp.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `calc(50% + ${star.originX}px)`,
              top: `calc(50% + ${star.originY}px)`,
              width: star.size,
              height: star.size,
              backgroundColor: star.color,
              ['--warp-x' as string]: `${star.dx}px`,
              ['--warp-y' as string]: `${star.dy}px`,
              animation: `warpTravel ${star.duration}s linear infinite ${star.delay}s`,
            }}
          />
        ))}

        {/* Shooting stars */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="shooting-star-1" />
          <div className="shooting-star-2" />
          <div className="shooting-star-3" />
          <div className="shooting-star-4" />
        </div>
      </div>

      <style jsx>{`
        .nebula-drift-1 { animation: nebulaDrift1 30s ease-in-out infinite; }
        .nebula-drift-2 { animation: nebulaDrift2 25s ease-in-out infinite; }
        .nebula-drift-3 { animation: nebulaDrift3 35s ease-in-out infinite; }
        @keyframes nebulaDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.1); }
        }
        @keyframes nebulaDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-25px, 15px) scale(1.05); }
        }
        @keyframes nebulaDrift3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 25px); }
        }
        .shooting-star-1, .shooting-star-2, .shooting-star-3, .shooting-star-4 {
          position: absolute;
          height: 1px;
          border-radius: 999px;
          opacity: 0;
        }
        .shooting-star-1 {
          top: 12%; left: -100px; width: 80px;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(255,255,255,0.3);
          animation: shootStar1 8s ease-in-out infinite 2s;
        }
        .shooting-star-2 {
          top: 35%; left: -80px; width: 60px;
          background: linear-gradient(90deg, rgba(100,200,255,0) 0%, rgba(100,200,255,0.7) 50%, rgba(100,200,255,0) 100%);
          box-shadow: 0 0 6px 1px rgba(100,200,255,0.3);
          animation: shootStar2 12s ease-in-out infinite 6s;
        }
        .shooting-star-3 {
          top: 65%; left: -120px; width: 100px;
          background: linear-gradient(90deg, rgba(200,180,255,0) 0%, rgba(200,180,255,0.6) 50%, rgba(200,180,255,0) 100%);
          box-shadow: 0 0 8px 1px rgba(200,180,255,0.2);
          animation: shootStar1 15s ease-in-out infinite 10s;
        }
        .shooting-star-4 {
          top: 22%; left: -60px; width: 50px;
          background: linear-gradient(90deg, rgba(255,220,150,0) 0%, rgba(255,220,150,0.7) 50%, rgba(255,220,150,0) 100%);
          box-shadow: 0 0 4px 1px rgba(255,220,150,0.2);
          animation: shootStar2 10s ease-in-out infinite 15s;
        }
        @keyframes shootStar1 {
          0% { transform: translateX(0) translateY(0) rotate(-25deg); opacity: 0; }
          3% { opacity: 1; }
          12% { opacity: 0.8; }
          15% { transform: translateX(calc(100vw + 300px)) translateY(120px) rotate(-25deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes shootStar2 {
          0% { transform: translateX(0) translateY(0) rotate(-15deg); opacity: 0; }
          2% { opacity: 1; }
          8% { opacity: 0.8; }
          10% { transform: translateX(calc(100vw + 200px)) translateY(60px) rotate(-15deg); opacity: 0; }
          100% { opacity: 0; }
        }
        @keyframes warpTravel {
          0% { transform: translate(0, 0) scale(0.1); opacity: 0; }
          5% { opacity: 0.3; }
          40% { opacity: 0.7; }
          80% { opacity: 0.9; }
          100% { transform: translate(var(--warp-x), var(--warp-y)) scale(2.5); opacity: 0; }
        }
      `}</style>
    </>
  );
}
