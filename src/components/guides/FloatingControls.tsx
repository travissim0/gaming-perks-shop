'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface FloatingControlsProps {
  sections: Array<{ id: string; name: string; icon: string }>;
  currentSection: number;
}

export default function FloatingControls({ sections, currentSection }: FloatingControlsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (scrollTop / docHeight) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', updateScrollProgress);
    return () => window.removeEventListener('scroll', updateScrollProgress);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Progress Circle */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative mb-4"
      >
        <svg width="60" height="60" className="transform -rotate-90">
          <circle
            cx="30"
            cy="30"
            r="25"
            stroke="rgba(59, 130, 246, 0.2)"
            strokeWidth="3"
            fill="transparent"
          />
          <motion.circle
            cx="30"
            cy="30"
            r="25"
            stroke="url(#gradient)"
            strokeWidth="3"
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 25}`}
            strokeDashoffset={`${2 * Math.PI * 25 * (1 - scrollProgress / 100)}`}
            transition={{ duration: 0.2 }}
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#EAB308" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-amber-400 text-sm font-bold">
            {Math.round(scrollProgress)}%
          </span>
        </div>
      </motion.div>

      {/* Quick Navigation Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full right-0 mb-4 bg-gray-900/90 backdrop-blur-sm border border-amber-500/30 rounded-lg p-3 min-w-[200px]"
          >
            <div className="space-y-2">
              {sections.map((section, index) => (
                <motion.button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center space-x-3 p-2 rounded transition-all duration-200 ${
                    currentSection === index
                      ? 'bg-amber-600/30 text-amber-300'
                      : 'text-gray-300 hover:text-amber-300 hover:bg-amber-600/10'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-lg">{section.icon}</span>
                  <span className="text-sm font-medium">{section.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Buttons */}
      <div className="space-y-3">
        {/* Navigation Menu Toggle */}
        <motion.button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-14 h-14 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all duration-300"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          animate={{ rotate: isMenuOpen ? 45 : 0 }}
        >
          {isMenuOpen ? '✕' : '☰'}
        </motion.button>

        {/* Scroll to Top */}
        <motion.button
          onClick={scrollToTop}
          className="w-14 h-14 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all duration-300"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: scrollProgress > 10 ? 1 : 0 }}
        >
          ↑
        </motion.button>
      </div>
    </div>
  );
} 