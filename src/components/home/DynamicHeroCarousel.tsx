'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  accentColor: string;
  glowColor: string;
}

const heroSlides: HeroSlide[] = [
  {
    id: 'infantry',
    title: 'FREE INFANTRY',
    subtitle: 'The Ultimate Gaming Community Hub',
    buttonText: 'Join Now',
    buttonLink: '/auth/login',
    accentColor: 'from-cyan-400 to-blue-500',
    glowColor: 'rgba(34, 211, 238, 0.5)',
  },
  {
    id: 'usl-dueling',
    title: 'USL STATS',
    subtitle: 'Best of 9 Competitive Match Analytics',
    buttonText: 'View Stats',
    buttonLink: '/dueling/bo9-stats',
    accentColor: 'from-green-400 to-emerald-500',
    glowColor: 'rgba(34, 197, 94, 0.5)',
  },
  {
    id: 'triple-threat',
    title: 'TRIPLE THREAT',
    subtitle: '3v3 Fast-Paced Arena Combat',
    buttonText: 'Enter Arena',
    buttonLink: '/triple-threat',
    accentColor: 'from-orange-400 to-red-500',
    glowColor: 'rgba(251, 146, 60, 0.5)',
  },
  {
    id: 'ctfpl',
    title: 'CTFPL LEAGUE',
    subtitle: 'Squad-Based Capture The Flag Competition',
    buttonText: 'View League',
    buttonLink: '/league/ctfpl',
    accentColor: 'from-blue-400 to-purple-500',
    glowColor: 'rgba(59, 130, 246, 0.5)',
  },
];

// Generate stars once
const generateStars = (count: number, layer: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `star-${layer}-${i}`,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: layer === 1 ? Math.random() * 2 + 1 : layer === 2 ? Math.random() * 1.5 + 0.5 : Math.random() + 0.3,
    opacity: layer === 1 ? Math.random() * 0.5 + 0.5 : layer === 2 ? Math.random() * 0.4 + 0.3 : Math.random() * 0.3 + 0.2,
    animationDuration: `${Math.random() * 3 + 2}s`,
    animationDelay: `${Math.random() * 2}s`,
  }));
};

interface DynamicHeroCarouselProps {
  compact?: boolean;
}

export default function DynamicHeroCarousel({ compact = false }: DynamicHeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Generate star layers (memoized to prevent regeneration) - only for full mode
  const stars = useMemo(() => compact ? null : ({
    layer1: generateStars(50, 1),
    layer2: generateStars(100, 2),
    layer3: generateStars(150, 3),
  }), [compact]);

  // Compact mode starfield - dense, multi-parallax
  const compactStars = useMemo(() => !compact ? null : ({
    far: generateStars(60, 3),
    mid: generateStars(35, 2),
    close: generateStars(18, 1),
  }), [compact]);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  // Auto-advance slides
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  // Parallax effect on mouse move - only for full mode
  useEffect(() => {
    if (compact) return;
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [compact]);

  const slide = heroSlides[currentSlide];

  // ─── Compact Mode ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-white/10">
        {/* Own deep space background */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #050510 0%, #0a0e1a 50%, #050510 100%)',
        }} />

        {/* Far star layer - slowest drift */}
        <div className="absolute inset-0 compact-drift-far">
          {compactStars?.far.map((star) => (
            <div key={star.id} className="absolute rounded-full bg-white" style={{
              left: star.left, top: star.top,
              width: star.size, height: star.size,
              opacity: star.opacity,
            }} />
          ))}
        </div>

        {/* Mid star layer - medium drift + twinkle */}
        <div className="absolute inset-0 compact-drift-mid">
          {compactStars?.mid.map((star) => (
            <div key={star.id} className="absolute rounded-full bg-white animate-pulse" style={{
              left: star.left, top: star.top,
              width: star.size, height: star.size,
              opacity: star.opacity,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
          ))}
        </div>

        {/* Close star layer - fastest drift + bright glow */}
        <div className="absolute inset-0 compact-drift-close">
          {compactStars?.close.map((star) => (
            <div key={star.id} className="absolute rounded-full bg-white animate-pulse" style={{
              left: star.left, top: star.top,
              width: star.size, height: star.size,
              opacity: star.opacity,
              boxShadow: `0 0 ${star.size * 3}px rgba(255,255,255,0.5)`,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
          ))}
        </div>

        {/* Nebula glow - follows slide color */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${slide.glowColor} 0%, transparent 60%)`,
            transition: 'background 0.5s ease-out',
          }}
        />

        {/* Animated accent line at top */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${slide.glowColor}, transparent)`,
            transition: 'background 0.5s ease-out',
          }}
        />

        {/* Internal shooting star */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="compact-shoot-1" />
          <div className="compact-shoot-2" />
        </div>

        {/* Content */}
        <div className="relative flex flex-col items-center justify-center px-6 py-10 min-h-[500px] text-center">
          <h2 className="text-3xl md:text-4xl font-black tracking-wider mb-3">
            <span
              className={`text-transparent bg-clip-text bg-gradient-to-r ${slide.accentColor}`}
              style={{ filter: 'drop-shadow(0 0 15px currentColor)' }}
            >
              {slide.title}
            </span>
          </h2>

          <p className="text-gray-300 text-sm md:text-base mb-7 max-w-sm">
            {slide.subtitle}
          </p>

          <Link
            href={slide.buttonLink}
            className={`group relative px-6 py-3 bg-gradient-to-r ${slide.accentColor} rounded-lg font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105`}
            style={{
              boxShadow: `0 0 20px ${slide.glowColor}, 0 0 40px ${slide.glowColor}`,
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              {slide.buttonText}
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </Link>

          {/* Navigation Dots */}
          <div className="flex items-center gap-3 mt-7">
            {heroSlides.map((s, index) => (
              <button
                key={s.id}
                onClick={() => goToSlide(index)}
                className={`transition-all duration-300 ${index === currentSlide ? 'scale-110' : 'hover:scale-105'}`}
                aria-label={`Go to ${s.id} slide`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? `bg-gradient-to-r ${s.accentColor} shadow-lg`
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}
                  style={index === currentSlide ? { boxShadow: `0 0 10px ${s.glowColor}` } : {}}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Compact carousel animations */}
        <style jsx>{`
          .compact-drift-far {
            animation: cDriftFar 20s ease-in-out infinite;
          }
          .compact-drift-mid {
            animation: cDriftMid 12s ease-in-out infinite;
          }
          .compact-drift-close {
            animation: cDriftClose 8s ease-in-out infinite;
          }
          @keyframes cDriftFar {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(3px, -2px); }
            66% { transform: translate(-2px, 2px); }
          }
          @keyframes cDriftMid {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-5px, 4px); }
            66% { transform: translate(4px, -3px); }
          }
          @keyframes cDriftClose {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(8px, -5px); }
            66% { transform: translate(-6px, 4px); }
          }
          .compact-shoot-1, .compact-shoot-2 {
            position: absolute;
            height: 1px;
            border-radius: 999px;
            opacity: 0;
          }
          .compact-shoot-1 {
            top: 25%; left: -40px; width: 40px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
            box-shadow: 0 0 4px rgba(255,255,255,0.3);
            animation: cShoot 7s ease-in-out infinite 2s;
          }
          .compact-shoot-2 {
            top: 60%; left: -30px; width: 30px;
            background: linear-gradient(90deg, transparent, rgba(100,200,255,0.5), transparent);
            box-shadow: 0 0 3px rgba(100,200,255,0.2);
            animation: cShoot 10s ease-in-out infinite 6s;
          }
          @keyframes cShoot {
            0% { transform: translateX(0) rotate(-20deg); opacity: 0; }
            5% { opacity: 1; }
            25% { transform: translateX(700px) rotate(-20deg); opacity: 0; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ─── Full Mode (original) ────────────────────────────────────────────────
  return (
    <div className="relative h-64 md:h-80 overflow-hidden bg-gray-950">

      {/* Deep Space Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950" />

      {/* Nebula Effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(ellipse at ${50 + mousePosition.x * 0.5}% ${50 + mousePosition.y * 0.5}%, ${slide.glowColor} 0%, transparent 50%)`,
          transition: 'background 0.3s ease-out',
        }}
      />

      {/* Star Layer 3 - Distant (slowest parallax) */}
      {stars && (
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${mousePosition.x * 0.1}px, ${mousePosition.y * 0.1}px)`,
            transition: 'transform 0.5s ease-out',
          }}
        >
          {stars.layer3.map((star) => (
            <div
              key={star.id}
              className="absolute rounded-full bg-white"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
              }}
            />
          ))}
        </div>
      )}

      {/* Star Layer 2 - Mid distance */}
      {stars && (
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${mousePosition.x * 0.3}px, ${mousePosition.y * 0.3}px)`,
            transition: 'transform 0.4s ease-out',
          }}
        >
          {stars.layer2.map((star) => (
            <div
              key={star.id}
              className="absolute rounded-full bg-white animate-pulse"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                animationDuration: star.animationDuration,
                animationDelay: star.animationDelay,
              }}
            />
          ))}
        </div>
      )}

      {/* Star Layer 1 - Close (fastest parallax) */}
      {stars && (
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${mousePosition.x * 0.6}px, ${mousePosition.y * 0.6}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {stars.layer1.map((star) => (
            <div
              key={star.id}
              className="absolute rounded-full bg-white animate-pulse"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, 0.5)`,
                animationDuration: star.animationDuration,
                animationDelay: star.animationDelay,
              }}
            />
          ))}
        </div>
      )}

      {/* Shooting Stars */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="shooting-star absolute w-1 h-1 bg-white rounded-full opacity-0"
          style={{
            animation: 'shooting-star 3s ease-in-out infinite',
            animationDelay: '0s',
            top: '20%',
            left: '-10%',
          }}
        />
        <div className="shooting-star absolute w-0.5 h-0.5 bg-cyan-300 rounded-full opacity-0"
          style={{
            animation: 'shooting-star 4s ease-in-out infinite',
            animationDelay: '2s',
            top: '40%',
            left: '-10%',
          }}
        />
      </div>

      {/* Content Container */}
      <div className="relative h-full flex flex-col items-center justify-center px-4 text-center">

        {/* Title */}
        <h1 className="text-3xl md:text-5xl font-black tracking-wider mb-2">
          <span
            className={`text-transparent bg-clip-text bg-gradient-to-r ${slide.accentColor}`}
            style={{
              textShadow: `0 0 30px ${slide.glowColor}`,
              filter: 'drop-shadow(0 0 10px currentColor)',
            }}
          >
            {slide.title}
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-gray-300 text-sm md:text-lg mb-6 max-w-md">
          {slide.subtitle}
        </p>

        {/* CTA Button */}
        <Link
          href={slide.buttonLink}
          className={`group relative px-6 py-3 bg-gradient-to-r ${slide.accentColor} rounded-lg font-bold text-white overflow-hidden transition-all duration-300 hover:scale-105`}
          style={{
            boxShadow: `0 0 20px ${slide.glowColor}, 0 0 40px ${slide.glowColor}`,
          }}
        >
          <span className="relative z-10 flex items-center gap-2">
            {slide.buttonText}
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>

          {/* Button glow effect */}
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
        </Link>

        {/* Navigation Dots */}
        <div className="flex items-center gap-3 mt-6">
          {heroSlides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className={`relative transition-all duration-300 ${
                index === currentSlide ? 'scale-110' : 'hover:scale-105'
              }`}
              aria-label={`Go to ${s.id} slide`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  index === currentSlide
                    ? `bg-gradient-to-r ${s.accentColor} shadow-lg`
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
                style={index === currentSlide ? { boxShadow: `0 0 10px ${s.glowColor}` } : {}}
              />
            </button>
          ))}
        </div>
      </div>

      {/* CSS for shooting star animation */}
      <style jsx>{`
        @keyframes shooting-star {
          0% {
            transform: translateX(0) translateY(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateX(calc(100vw + 200px)) translateY(100px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
