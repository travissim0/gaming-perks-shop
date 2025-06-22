'use client';

import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import FloatingControls from '@/components/guides/FloatingControls';
import TrainingSimulator from '@/components/guides/TrainingSimulator';

// Section component with scroll-triggered animations
const Section = ({ children, className = '', delay = 0, id }: { children: React.ReactNode, className?: string, delay?: number, id?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 100 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 100 }}
      transition={{ duration: 0.8, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Parallax background component
const ParallaxBackground = () => {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, -100]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <motion.div
        style={{ y: y1 }}
        className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-yellow-900/10 to-orange-900/20"
      />
      <motion.div
        style={{ y: y2 }}
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-600/5 via-transparent to-transparent"
      />
      {/* Animated particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-amber-400/30 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
        />
      ))}
    </div>
  );
};

// Progress indicator
const ProgressIndicator = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-500 origin-left z-50"
      style={{ scaleX }}
    />
  );
};

// Navigation sidebar
const NavigationSidebar = () => {
  const [activeSection, setActiveSection] = useState(0);
  
  const sections = [
    { id: 'intro', name: 'Introduction', icon: '🎯' },
    { id: 'mining', name: 'Mining 101', icon: '⛏️' },
    { id: 'repairing', name: 'Repairing 101', icon: '🔧' },
    { id: 'defense', name: 'Flag Room Defense', icon: '🛡️' },
    { id: 'combat', name: 'Combat vs Mining', icon: '⚔️' },
    { id: 'hoverboard', name: 'Hoverboard Mechanics', icon: '🛹' },
    { id: 'macros', name: 'Drop Macros', icon: '📋' },
    { id: 'paths', name: 'Mining Paths', icon: '🗺️' }
  ];

  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 1 }}
      className="fixed left-4 top-1/2 transform -translate-y-1/2 z-40 hidden lg:block"
    >
      <div className="bg-gray-900/80 backdrop-blur-sm border border-amber-500/30 rounded-lg p-4 shadow-2xl">
        <h3 className="text-amber-400 font-bold text-sm mb-4 text-center">GUIDE SECTIONS</h3>
        <div className="space-y-2">
          {sections.map((section, index) => (
            <motion.a
              key={section.id}
              href={`#${section.id}`}
              className={`flex items-center space-x-3 p-2 rounded transition-all duration-300 ${
                activeSection === index 
                  ? 'bg-amber-600/30 text-amber-300' 
                  : 'text-gray-400 hover:text-amber-300 hover:bg-amber-600/10'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="text-lg">{section.icon}</span>
              <span className="text-xs font-medium">{section.name}</span>
            </motion.a>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default function CombatEngineerGuide() {
  const { user, loading } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentSection, setCurrentSection] = useState(0);

  const sections = [
    { id: 'intro', name: 'Introduction', icon: '🎯' },
    { id: 'mining', name: 'Mining 101', icon: '⛏️' },
    { id: 'repairing', name: 'Repairing 101', icon: '🔧' },
    { id: 'defense', name: 'Flag Room Defense', icon: '🛡️' },
    { id: 'combat', name: 'Combat vs Mining', icon: '⚔️' },
    { id: 'hoverboard', name: 'Hoverboard Mechanics', icon: '🛹' },
    { id: 'macros', name: 'Drop Macros', icon: '📋' },
    { id: 'paths', name: 'Mining Paths', icon: '🗺️' }
  ];

  // Track current section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 2;
      
      sections.forEach((section, index) => {
        const element = document.getElementById(section.id);
        if (element) {
          const elementTop = element.offsetTop;
          const elementBottom = elementTop + element.offsetHeight;
          
          if (scrollPosition >= elementTop && scrollPosition <= elementBottom) {
            setCurrentSection(index);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 text-white">
      <ParallaxBackground />
      <ProgressIndicator />
      <FloatingControls sections={sections} currentSection={currentSection} />
      <Navbar user={user} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <Section id="intro" className="min-h-screen flex items-center justify-center text-center relative">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="text-8xl mb-8"
            >
              ⛏️
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-7xl font-bold mb-6 bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent"
            >
              COMBAT ENGINEER
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-2xl text-amber-200 mb-8 leading-relaxed"
            >
              Master the art of strategic support, mining excellence, and battlefield engineering
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="bg-amber-600/20 backdrop-blur-sm border border-amber-500/30 rounded-lg p-6 mb-12"
            >
              <h2 className="text-amber-400 font-bold mb-4">🎒 THE BACKBONE OF VICTORY</h2>
              <p className="text-amber-100 leading-relaxed">
                The Combat Engineer is the unsung hero of Free Infantry. While others focus on kills, 
                you focus on victory. Your brown backpack carries the tools that can turn the tide of any battle.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.2 }}
              className="space-y-4"
            >
              <div className="text-amber-300 text-lg">Scroll down to begin your training ⬇️</div>
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-4xl"
              >
                ⬇️
              </motion.div>
            </motion.div>
          </div>
        </Section>

        {/* Mining 101 Section */}
        <Section id="mining" className="min-h-screen py-20" delay={0.2}>
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -100 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-6xl font-bold mb-6 bg-gradient-to-r from-cyan-400 via-blue-500 to-teal-500 bg-clip-text text-transparent">⛏️ MINING 101</h2>
              <p className="text-xl text-cyan-200 max-w-3xl mx-auto mb-4">
                Master the extraction of scattered titanium oxide crystals across Titan's terraformed landscape.
              </p>
              <div className="inline-flex items-center space-x-2 bg-slate-800/50 border border-cyan-500/30 rounded-lg px-4 py-2">
                <span className="text-blue-300">📍</span>
                <span className="text-sm text-blue-200">Titan's Hills • Methane Lakes Region • Scattered Crystal Deposits</span>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
                className="space-y-8"
              >
                <div className="bg-slate-900/30 border border-cyan-500/30 rounded-lg p-6 relative overflow-hidden">
                  {/* Atmospheric background effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/10 via-blue-900/5 to-teal-900/10"></div>
                  
                  <h3 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center relative z-10">
                    <span className="mr-3">💎</span>
                    Crystal Priority on Titan
                  </h3>
                  <div className="space-y-4 text-cyan-100 relative z-10">
                    <div className="flex items-center space-x-3">
                      <span className="text-cyan-400 font-bold">1.</span>
                      <span><strong>Titanium Oxide</strong> - Essential for turret repairs and advanced systems</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-blue-400 font-bold">2.</span>
                      <span><strong>Standard Crystals</strong> - Energy/ammo for immediate combat needs</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-teal-400 font-bold">3.</span>
                      <span><strong>Iron Deposits</strong> - Base construction and general repairs</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-slate-400 font-bold">4.</span>
                      <span><strong>Gold Veins</strong> - Valuable but lower tactical priority</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/20 rounded relative z-10">
                    <div className="text-xs text-blue-200">
                      <strong>Titan Advantage:</strong> The moon's unique atmosphere allows for enhanced crystal formation, 
                      making titanium oxide deposits more abundant near methane lakes.
                    </div>
                  </div>
                </div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="bg-gradient-to-br from-slate-800/40 to-blue-800/40 border border-cyan-500/20 rounded-lg p-6"
                >
                  <h3 className="text-xl font-bold text-cyan-400 mb-3">⚡ Titan Mining Technique</h3>
                  <p className="text-cyan-200 mb-4">
                    Titanium oxide crystals are scattered across the terraformed hills. Use sustained extraction pressure 
                    and watch for the distinctive cyan gleam that indicates optimal extraction timing.
                  </p>
                  <div className="space-y-2 text-sm text-blue-200">
                    <div><strong>• Terrain:</strong> Focus on elevated areas near methane deposits</div>
                    <div><strong>• Detection:</strong> Look for faint blue-cyan shimmer in rock formations</div>
                    <div><strong>• Extraction:</strong> Hold until the titanium gleam appears for maximum yield</div>
                  </div>
                </motion.div>

                {/* Interactive Training Simulator */}
                <TrainingSimulator
                  type="mining"
                  title="🎯 Titan Crystal Extractor"
                  description="Master titanium oxide extraction in Titan's unique environment!"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
                className="space-y-8"
              >
                <div className="bg-gradient-to-br from-slate-600/30 to-cyan-600/30 rounded-lg p-8 border border-cyan-500/30 relative overflow-hidden">
                  {/* Animated methane lake effect */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 rounded-full blur-xl"></div>
                  
                  <h3 className="text-2xl font-bold text-cyan-400 mb-6 text-center">Extraction Efficiency on Titan</h3>
                  <div className="space-y-4">
                    <div className="bg-slate-900/30 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-cyan-200">Perfect Timing (Titanium Gleam)</span>
                        <span className="text-emerald-400 font-bold">2-4 Crystals</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: "100%" }}
                          transition={{ duration: 1, delay: 0.5 }}
                          className="bg-gradient-to-r from-cyan-400 to-emerald-500 h-2 rounded-full"
                        />
                      </div>
                    </div>
                    <div className="bg-slate-900/30 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-cyan-200">Good Timing</span>
                        <span className="text-blue-400 font-bold">1-2 Crystals</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: "75%" }}
                          transition={{ duration: 1, delay: 0.7 }}
                          className="bg-gradient-to-r from-blue-400 to-cyan-500 h-2 rounded-full"
                        />
                      </div>
                    </div>
                    <div className="bg-slate-900/30 rounded p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-cyan-200">Poor Timing</span>
                        <span className="text-slate-400 font-bold">0-1 Crystal</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: "35%" }}
                          transition={{ duration: 1, delay: 0.9 }}
                          className="bg-gradient-to-r from-slate-400 to-slate-500 h-2 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Mining Tips */}
                <div className="bg-gradient-to-br from-blue-900/20 to-teal-800/20 rounded-lg p-6 border border-blue-500/20">
                  <h3 className="text-xl font-bold text-cyan-400 mb-4">🏆 Advanced Titan Techniques</h3>
                  <div className="space-y-3 text-cyan-200 text-sm">
                    <div className="flex items-start space-x-3">
                      <span className="text-cyan-400 font-bold mt-1">•</span>
                      <span><strong>Methane Proximity:</strong> Crystals near methane lakes have 25% higher yield rates</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="text-cyan-400 font-bold mt-1">•</span>
                      <span><strong>Hill Scanning:</strong> Higher elevations contain denser titanium oxide concentrations</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="text-cyan-400 font-bold mt-1">•</span>
                      <span><strong>Atmospheric Advantage:</strong> Titan's atmosphere reduces tool wear by 15%</span>
                    </div>
                    <div className="flex items-start space-x-3">
                      <span className="text-cyan-400 font-bold mt-1">•</span>
                      <span><strong>Pattern Recognition:</strong> Crystal deposits follow geological fault lines</span>
                    </div>
                  </div>
                </div>

                {/* Titan Environment Info */}
                <div className="bg-gradient-to-br from-slate-700/20 to-blue-700/20 rounded-lg p-6 border border-slate-500/20">
                  <h3 className="text-xl font-bold text-blue-400 mb-4">🌙 Titan Environment</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-blue-300 font-semibold mb-2">Terrain Features</div>
                      <div className="space-y-1 text-slate-300">
                        <div>• Terraformed hills</div>
                        <div>• Methane lakes</div>
                        <div>• Scattered deposits</div>
                        <div>• Enhanced atmosphere</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-cyan-300 font-semibold mb-2">Mining Advantages</div>
                      <div className="space-y-1 text-slate-300">
                        <div>• Reduced tool wear</div>
                        <div>• Higher crystal density</div>
                        <div>• Improved visibility</div>
                        <div>• Stable extraction</div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </Section>

        {/* Repairing 101 Section */}
        <Section id="repairing" className="min-h-screen py-20" delay={0.4}>
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-6xl font-bold mb-6 text-amber-400">🔧 REPAIRING 101</h2>
              <p className="text-xl text-amber-200 max-w-3xl mx-auto">
                Your repair tool is a lifeline. Master its use to keep your team fighting and your base standing.
              </p>
            </motion.div>

            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    title: "Vehicles",
                    icon: "🚗",
                    priority: "HIGH",
                    description: "Tanks and APCs are expensive. Always prioritize vehicle repairs.",
                    color: "red",
                    tips: ["Check engine first", "Repair tracks if damaged", "Don't forget the gun turret"]
                  },
                  {
                    title: "Base Structures",
                    icon: "🏗️",
                    priority: "MEDIUM",
                    description: "Repair damaged walls, doors, and defensive structures.",
                    color: "yellow",
                    tips: ["Focus on main entrances", "Repair generators first", "Check all defensive turrets"]
                  },
                  {
                    title: "Equipment",
                    icon: "⚙️",
                    priority: "LOW",
                    description: "Fix damaged weapons and equipment when time permits.",
                    color: "green",
                    tips: ["Repair heavy weapons first", "Don't ignore small items", "Check ammunition boxes"]
                  }
                ].map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.2 }}
                    viewport={{ once: true }}
                    whileHover={{ scale: 1.05, rotateY: 5 }}
                    className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-6 text-center group"
                  >
                    <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">{item.icon}</div>
                    <h3 className="text-xl font-bold text-amber-400 mb-2">{item.title}</h3>
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-4 ${
                      item.color === 'red' ? 'bg-red-600/30 text-red-300' :
                      item.color === 'yellow' ? 'bg-yellow-600/30 text-yellow-300' :
                      'bg-green-600/30 text-green-300'
                    }`}>
                      {item.priority} PRIORITY
                    </div>
                    <p className="text-amber-200 text-sm mb-4">{item.description}</p>
                    <div className="space-y-1">
                      {item.tips.map((tip, tipIndex) => (
                        <div key={tipIndex} className="text-xs text-amber-300 opacity-80">
                          • {tip}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8 }}
                  viewport={{ once: true }}
                  className="bg-gradient-to-r from-amber-800/30 to-yellow-800/30 rounded-lg p-8 border border-amber-500/30"
                >
                  <h3 className="text-2xl font-bold text-amber-400 mb-6 text-center">🛠️ Repair Efficiency Matrix</h3>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-lg font-bold text-amber-300 mb-4">Damage Assessment</h4>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                          <span className="text-amber-200">Light Damage (80-100%): Quick fixes</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                          <span className="text-amber-200">Moderate Damage (50-79%): Standard repair</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                          <span className="text-amber-200">Heavy Damage (0-49%): Major reconstruction</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-amber-300 mb-4">Resource Requirements</h4>
                      <div className="space-y-3 text-amber-200">
                        <div>🔩 <strong>Iron:</strong> Primary repair material</div>
                        <div>💎 <strong>Crystals:</strong> For energy-based systems</div>
                        <div>⏱️ <strong>Time:</strong> More damage = longer repair time</div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Repair Training Simulator */}
                <TrainingSimulator
                  type="repairing"
                  title="🔧 Repair Trainer"
                  description="Master the repair timing for maximum efficiency!"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Flag Room Defense Section */}
        <Section id="defense" className="min-h-screen py-20" delay={0.6}>
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-6xl font-bold mb-6 text-amber-400">🛡️ FLAG ROOM RUSH DEFENSE</h2>
              <p className="text-xl text-amber-200 max-w-3xl mx-auto">
                When enemies rush your flag room, your engineering skills become crucial for survival and victory.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                viewport={{ once: true }}
                className="space-y-8"
              >
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
                  <h3 className="text-2xl font-bold text-red-400 mb-4 flex items-center">
                    <span className="mr-3">🚨</span>
                    Emergency Priorities
                  </h3>
                  <div className="space-y-4 text-red-100">
                    <div className="flex items-center space-x-3">
                      <span className="text-red-400 font-bold">1.</span>
                      <span><strong>Repair the flag pole</strong> - Your #1 priority</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-orange-400 font-bold">2.</span>
                      <span><strong>Fix entrance doors</strong> - Slow enemy advance</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-yellow-400 font-bold">3.</span>
                      <span><strong>Repair defensive turrets</strong> - Automated defense</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-green-400 font-bold">4.</span>
                      <span><strong>Build barriers</strong> - Create cover points</span>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-800/20 border border-amber-500/20 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-amber-400 mb-3">⚡ Quick Defense Setup</h3>
                  <div className="space-y-3 text-amber-200 text-sm">
                    <div><strong>Step 1:</strong> Immediately repair any flag damage</div>
                    <div><strong>Step 2:</strong> Block main entrances with barriers</div>
                    <div><strong>Step 3:</strong> Create repair stations near the flag</div>
                    <div><strong>Step 4:</strong> Set up ammunition resupply points</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                viewport={{ once: true }}
                className="space-y-8"
              >
                <div className="bg-gradient-to-br from-red-600/30 to-orange-600/30 rounded-lg p-8 border border-red-500/30">
                  <h3 className="text-2xl font-bold text-red-400 mb-6 text-center">🏰 Defense Layout</h3>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-gray-700 p-2 rounded">Entrance</div>
                    <div className="bg-amber-600 p-2 rounded">Barrier</div>
                    <div className="bg-gray-700 p-2 rounded">Entrance</div>
                    <div className="bg-red-600 p-2 rounded">Turret</div>
                    <div className="bg-amber-600 p-2 rounded">Cover</div>
                    <div className="bg-red-600 p-2 rounded">Turret</div>
                    <div className="bg-amber-600 p-2 rounded">Repair</div>
                    <div className="bg-yellow-400 text-black p-2 rounded font-bold">FLAG</div>
                    <div className="bg-amber-600 p-2 rounded">Ammo</div>
                  </div>
                  <div className="mt-4 text-xs text-red-200">
                    <strong>Legend:</strong> Position yourself near the flag with clear lines to repair damaged defenses
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-700/20 to-yellow-700/20 rounded-lg p-6 border border-amber-500/20">
                  <h3 className="text-xl font-bold text-amber-400 mb-4">💡 Pro Defense Tips</h3>
                  <div className="space-y-3 text-amber-200 text-sm">
                    <div><strong>Communication:</strong> Call out repair needs to teammates</div>
                    <div><strong>Resource Management:</strong> Always keep iron for emergency repairs</div>
                    <div><strong>Positioning:</strong> Stay mobile but always near critical structures</div>
                    <div><strong>Timing:</strong> Repair during enemy reload/retreat moments</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </Section>

        {/* Continue with more sections placeholder */}
        <Section className="text-center py-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1 }}
            viewport={{ once: true }}
            className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-12 max-w-4xl mx-auto"
          >
            <h2 className="text-4xl font-bold text-amber-400 mb-6">🚧 MORE SECTIONS COMING SOON</h2>
            <p className="text-xl text-amber-200 mb-8">
              This guide will continue to expand with the remaining sections including Combat vs Mining strategies, 
              Hoverboard mechanics, Drop macros, and Optimal mining paths.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { icon: '⚔️', name: 'Combat vs Mining' },
                { icon: '🛹', name: 'Hoverboard Mechanics' },
                { icon: '📋', name: 'Drop Macros' },
                { icon: '🗺️', name: 'Mining Paths' },
                { icon: '🎯', name: 'Training Exercises' },
                { icon: '🏆', name: 'Advanced Tactics' },
                { icon: '📊', name: 'Performance Metrics' },
                { icon: '🎮', name: 'Interactive Simulations' }
              ].map((section, index) => (
                <motion.div
                  key={section.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.05 }}
                  className="bg-amber-800/20 border border-amber-500/20 rounded p-3 cursor-pointer"
                >
                  <div className="text-2xl mb-2">{section.icon}</div>
                  <div className="text-amber-300 font-medium">{section.name}</div>
                </motion.div>
              ))}
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              viewport={{ once: true }}
              className="mt-8"
            >
              <div className="text-amber-300 mb-4">🎯 What's Coming Next:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-amber-200">
                <div>• Interactive hoverboard physics simulator</div>
                <div>• Advanced mining path optimization tools</div>
                <div>• Combat decision-making scenarios</div>
                <div>• Macro automation tutorials</div>
              </div>
            </motion.div>
          </motion.div>
        </Section>

        {/* Back to Guides */}
        <Section className="text-center py-20">
          <Link href="/guides">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-block bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-4 rounded-lg font-bold text-lg transition-all duration-300 shadow-lg"
            >
              ← Back to All Guides
            </motion.div>
          </Link>
        </Section>
      </main>
    </div>
  );
} 