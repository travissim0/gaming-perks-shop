'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface HeroSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  gradient: string;
  icon: string;
}

const heroSlides: HeroSlide[] = [
  {
    id: 'infantry',
    title: 'FREE INFANTRY',
    subtitle: 'Community Gaming Hub',
    description: 'Join the ultimate Infantry community - compete, connect, and conquer',
    buttonText: 'Get Started',
    buttonLink: '/squads',
    gradient: 'from-cyan-600/20 via-blue-600/20 to-purple-600/20',
    icon: '🎮',
  },
  {
    id: 'ctfpl',
    title: 'CTFPL LEAGUE',
    subtitle: 'Capture The Flag Competition',
    description: 'Squad-based competitive league with seasons, standings, and glory',
    buttonText: 'View League',
    buttonLink: '/league/ctfpl',
    gradient: 'from-blue-600/20 via-cyan-600/20 to-blue-600/20',
    icon: '🏆',
  },
  {
    id: 'triple-threat',
    title: 'TRIPLE THREAT',
    subtitle: '3v3 Competitive Arena',
    description: 'Fast-paced 3v3 matches - form a team, challenge rivals, climb the ranks',
    buttonText: 'Enter Arena',
    buttonLink: '/triple-threat',
    gradient: 'from-orange-600/20 via-red-600/20 to-orange-600/20',
    icon: '⚡',
  },
  {
    id: 'community',
    title: 'JOIN THE COMMUNITY',
    subtitle: 'Squads, Stats & More',
    description: 'Create or join a squad, track your stats, and become a legend',
    buttonText: 'Explore',
    buttonLink: '/squads',
    gradient: 'from-purple-600/20 via-pink-600/20 to-purple-600/20',
    icon: '🛡️',
  },
];

export default function DynamicHeroCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  // Auto-advance slides
  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(nextSlide, 6000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const slide = heroSlides[currentSlide];

  return (
    <div className="relative overflow-hidden">
      {/* Background Gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-r ${slide.gradient} transition-all duration-1000`}
      />

      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center">
          {/* Icon */}
          <div className="text-6xl md:text-8xl mb-4 animate-bounce">
            {slide.icon}
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 tracking-tight">
            {slide.title}
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-gray-300 mb-4">
            {slide.subtitle}
          </p>

          {/* Description */}
          <p className="text-gray-400 max-w-2xl mx-auto mb-8">
            {slide.description}
          </p>

          {/* CTA Button */}
          <Link
            href={slide.buttonLink}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/30 rounded-full text-white font-semibold transition-all duration-300 hover:scale-105"
          >
            {slide.buttonText}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* Navigation Dots */}
        <div className="flex justify-center gap-2 mt-12">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? 'bg-white w-8'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Slide Indicators */}
        <div className="flex justify-center gap-4 mt-4">
          {heroSlides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className={`text-xs px-3 py-1 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? 'bg-white/20 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s.id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
