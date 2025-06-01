'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

interface TrainingSimulatorProps {
  type: 'mining' | 'repairing';
  title: string;
  description: string;
}

export default function TrainingSimulator({ type, title, description }: TrainingSimulatorProps) {
  const [isActive, setIsActive] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [holdDuration, setHoldDuration] = useState(0);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [showSparks, setShowSparks] = useState(false);
  const [crystalsFound, setCrystalsFound] = useState(0);
  
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  const startHold = () => {
    if (!isActive) return;
    
    setIsHolding(true);
    setHoldDuration(0);
    setShowSparks(false);
    
    progressTimer.current = setInterval(() => {
      setHoldDuration(prev => {
        const newDuration = prev + 50;
        if (newDuration >= 1500 && newDuration <= 2000 && !showSparks) {
          setShowSparks(true);
        }
        return newDuration;
      });
    }, 50);
  };

  const endHold = () => {
    if (!isHolding) return;
    
    setIsHolding(false);
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
    }
    
    setAttempts(prev => prev + 1);
    
    // Calculate score based on timing
    let points = 0;
    let feedbackText = '';
    let crystalsGained = 0;
    
    if (holdDuration >= 1500 && holdDuration <= 2000) {
      points = 100;
      crystalsGained = Math.floor(Math.random() * 3) + 2; // 2-4 crystals
      feedbackText = type === 'mining' 
        ? `🎯 Perfect extraction! Found ${crystalsGained} titanium oxide crystals!`
        : '🎯 Perfect timing! Maximum efficiency!';
    } else if (holdDuration >= 1200 && holdDuration <= 2300) {
      points = 75;
      crystalsGained = Math.floor(Math.random() * 2) + 1; // 1-2 crystals
      feedbackText = type === 'mining'
        ? `👍 Good extraction! Found ${crystalsGained} titanium oxide crystals!`
        : '👍 Good timing! Nice work!';
    } else if (holdDuration >= 800 && holdDuration <= 2600) {
      points = 50;
      crystalsGained = Math.random() > 0.5 ? 1 : 0; // 50% chance of 1 crystal
      feedbackText = type === 'mining'
        ? crystalsGained > 0 
          ? `⚠️ Weak extraction. Found ${crystalsGained} crystal. Wait for the titanium gleam!`
          : '⚠️ Poor extraction technique. No crystals found!'
        : '⚠️ Okay timing. Try to wait for the sparks!';
    } else {
      points = 25;
      crystalsGained = 0;
      feedbackText = type === 'mining'
        ? '❌ Failed extraction! Titanium oxide requires patience and precision!'
        : '❌ Poor timing. Hold until you see sparks!';
    }
    
    setScore(prev => prev + points);
    setCrystalsFound(prev => prev + crystalsGained);
    setFeedback(feedbackText);
    setHoldDuration(0);
    setShowSparks(false);
    
    // Clear feedback after 3 seconds
    setTimeout(() => setFeedback(''), 3000);
  };

  const resetSimulation = () => {
    setScore(0);
    setAttempts(0);
    setCrystalsFound(0);
    setFeedback('');
    setHoldDuration(0);
    setIsHolding(false);
    setShowSparks(false);
  };

  const getEfficiencyRating = () => {
    if (attempts === 0) return 'Not Started';
    const avgScore = score / attempts;
    if (avgScore >= 90) return 'Titan Mining Expert 🏆';
    if (avgScore >= 75) return 'Crystal Specialist 🌟';
    if (avgScore >= 60) return 'Competent Miner ⚡';
    if (avgScore >= 40) return 'Learning 📚';
    return 'Needs Practice 🔧';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="bg-gradient-to-br from-slate-900/40 to-blue-900/40 border border-cyan-500/30 rounded-lg p-6 max-w-md mx-auto relative overflow-hidden"
    >
      {/* Titan Environment Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-2 left-2 w-3 h-3 bg-cyan-400 rounded-full animate-pulse"></div>
        <div className="absolute top-8 right-4 w-2 h-2 bg-blue-300 rounded-full animate-pulse delay-300"></div>
        <div className="absolute bottom-6 left-6 w-2 h-2 bg-cyan-300 rounded-full animate-pulse delay-500"></div>
        <div className="absolute bottom-12 right-8 w-3 h-3 bg-blue-400 rounded-full animate-pulse delay-700"></div>
      </div>

      <div className="text-center mb-6 relative z-10">
        <h3 className="text-2xl font-bold text-cyan-400 mb-2">{title}</h3>
        <p className="text-cyan-200 text-sm">{description}</p>
        {type === 'mining' && (
          <p className="text-xs text-blue-300 mt-2 italic">
            📍 Location: Titan's terraformed hills • Target: Scattered titanium oxide crystals
          </p>
        )}
      </div>

      {/* Mining Tool Visual */}
      <div className="relative mx-auto w-32 h-32 mb-6">
        <motion.div
          className={`absolute inset-0 rounded-lg shadow-lg ${
            type === 'mining' 
              ? 'bg-gradient-to-b from-cyan-600 to-blue-800' 
              : 'bg-gradient-to-b from-amber-600 to-amber-800'
          }`}
          animate={{
            scale: isHolding ? 1.1 : 1,
            rotate: isHolding ? -5 : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          {/* Tool Icon */}
          <div className="flex items-center justify-center h-full text-4xl">
            {type === 'mining' ? '⛏️' : '🔧'}
          </div>
        </motion.div>

        {/* Progress Ring */}
        <svg className="absolute inset-0 w-32 h-32 transform -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r="60"
            stroke={type === 'mining' ? "rgba(34, 211, 238, 0.2)" : "rgba(251, 191, 36, 0.2)"}
            strokeWidth="4"
            fill="transparent"
          />
          <motion.circle
            cx="64"
            cy="64"
            r="60"
            stroke={type === 'mining' ? "#22D3EE" : "#F59E0B"}
            strokeWidth="4"
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 60}`}
            strokeDashoffset={`${2 * Math.PI * 60 * (1 - Math.min(holdDuration / 2000, 1))}`}
            transition={{ duration: 0.1 }}
          />
        </svg>

        {/* Crystal Sparks Effect for Mining */}
        <AnimatePresence>
          {showSparks && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    x: Math.cos((i * Math.PI * 2) / 8) * 30,
                    y: Math.sin((i * Math.PI * 2) / 8) * 30,
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    repeatType: 'loop',
                    delay: i * 0.1,
                  }}
                  className={`absolute w-2 h-2 rounded-full ${
                    type === 'mining' ? 'bg-cyan-400' : 'bg-yellow-400'
                  }`}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="space-y-4 relative z-10">
        {!isActive ? (
          <motion.button
            onClick={() => setIsActive(true)}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white py-3 px-6 rounded-lg font-bold transition-all duration-300"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            🎮 Start Training
          </motion.button>
        ) : (
          <motion.button
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            className={`w-full py-4 px-6 rounded-lg font-bold transition-all duration-300 ${
              isHolding
                ? type === 'mining'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white'
                : type === 'mining'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
                  : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isHolding 
              ? `⚡ ${type === 'mining' ? 'Extracting crystals' : 'Repairing'}... (${(holdDuration / 1000).toFixed(1)}s)` 
              : `🎯 Hold to ${type === 'mining' ? 'Mine Titanium Oxide' : 'Repair'}`
            }
          </motion.button>
        )}

        {isActive && (
          <motion.button
            onClick={resetSimulation}
            className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded transition-all duration-300"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            🔄 Reset
          </motion.button>
        )}
      </div>

      {/* Stats */}
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-3 relative z-10"
        >
          <div className={`grid ${type === 'mining' ? 'grid-cols-3' : 'grid-cols-2'} gap-3 text-center`}>
            <div className={`${type === 'mining' ? 'bg-cyan-800/30' : 'bg-amber-800/30'} rounded p-3`}>
              <div className={`text-2xl font-bold ${type === 'mining' ? 'text-cyan-400' : 'text-amber-400'}`}>{attempts}</div>
              <div className={`text-xs ${type === 'mining' ? 'text-cyan-200' : 'text-amber-200'}`}>Attempts</div>
            </div>
            <div className={`${type === 'mining' ? 'bg-cyan-800/30' : 'bg-amber-800/30'} rounded p-3`}>
              <div className={`text-2xl font-bold ${type === 'mining' ? 'text-cyan-400' : 'text-amber-400'}`}>{attempts > 0 ? Math.round(score / attempts) : 0}</div>
              <div className={`text-xs ${type === 'mining' ? 'text-cyan-200' : 'text-amber-200'}`}>Avg Score</div>
            </div>
            {type === 'mining' && (
              <div className="bg-blue-800/30 rounded p-3">
                <div className="text-2xl font-bold text-blue-400">{crystalsFound}</div>
                <div className="text-xs text-blue-200">Crystals</div>
              </div>
            )}
          </div>
          
          <div className="text-center">
            <div className={`text-sm font-bold mb-1 ${type === 'mining' ? 'text-cyan-300' : 'text-amber-300'}`}>Efficiency Rating</div>
            <div className={`font-bold ${type === 'mining' ? 'text-cyan-400' : 'text-amber-400'}`}>{getEfficiencyRating()}</div>
          </div>
        </motion.div>
      )}

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className={`mt-4 border rounded-lg p-3 text-center relative z-10 ${
              type === 'mining' 
                ? 'bg-slate-800/80 border-cyan-500/30' 
                : 'bg-gray-800/80 border-amber-500/30'
            }`}
          >
            <div className={`font-medium text-sm ${type === 'mining' ? 'text-cyan-300' : 'text-amber-300'}`}>{feedback}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`mt-4 text-xs text-center relative z-10 ${
        type === 'mining' ? 'text-cyan-200/70' : 'text-amber-200/70'
      }`}>
        💡 Tip: {type === 'mining' 
          ? 'Wait for the titanium gleam ✨ for maximum crystal yield!' 
          : 'Hold until you see sparks ✨ for maximum efficiency!'
        }
      </div>
    </motion.div>
  );
} 