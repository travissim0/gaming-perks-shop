'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Orbitron } from 'next/font/google';
import {
  Download, ExternalLink, Monitor, FileText, Play, ChevronDown,
  ChevronRight, Gamepad2, Eye, Palette, Wrench, MousePointerClick,
  ZoomIn, Shirt, Layout, Camera, Accessibility, Hammer, Sparkles,
  Image as ImageIcon, Film,
} from 'lucide-react';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
});

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  body: string;
  assets: ReleaseAsset[];
  html_url: string;
}

const GITHUB_REPO = 'travissim0/infantry-cfs-studio';
const MANIFEST_URL = 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/public/app-updates/latest.json';
const DOWNLOAD_URL = 'https://nkinpmqnbcjaftqduujf.supabase.co/storage/v1/object/public/app-updates/infantry-cfs-studio_latest_x64-setup.nsis.zip';
const RELEASE_NOTES_URL = 'https://nkinpmqnbcjaftqduujf.supabase.co/rest/v1/release_notes?select=version,notes_html,published_at&order=published_at.desc&limit=50';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMjA0NzYsImV4cCI6MjA2MzY5NjQ3Nn0.83gXbk6MVOI341RBW7h_SXeSZcIIgI9BOBUX5e0ivv8';

interface AppManifest {
  version: string;
  notes: string;
  pub_date: string;
}

interface ReleaseNote {
  version: string;
  notes_html: string;
  published_at: string;
}

// ── Feature showcase data ────────────────────────────────────────────
// To add media: place GIFs/screenshots in /public/images/game-features/
// and videos in /public/videos/game-features/, then update the media fields below.
//
// Supported media types:
//   'image'   - png/jpg/gif from /public/images/game-features/
//   'video'   - mp4/webm from /public/videos/game-features/
//   'youtube' - YouTube video ID (the part after v= in the URL)
//
// Examples:
//   { type: 'image', src: '/images/game-features/zoom.gif', alt: 'Zoom demo' }
//   { type: 'video', src: '/videos/game-features/zoom.mp4' }
//   { type: 'youtube', src: 'dQw4w9WgXcQ' }  // just the video ID

interface FeatureMedia {
  type: 'image' | 'video' | 'youtube';
  src: string;
  alt?: string;
  poster?: string; // for local videos
}

interface Feature {
  id: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  media?: FeatureMedia[];  // array of screenshots/gifs/videos
  isNew?: boolean;
}

const FEATURES: Feature[] = [
  {
    id: 'dynamic-zoom',
    icon: <ZoomIn className="w-5 h-5" />,
    title: 'Dynamic Zoom',
    tagline: 'See more of the battlefield',
    description: 'Smoothly zoom in and out during gameplay for a wider tactical view or a closer look at the action. A completely new feature not available in the original client.',
    bullets: [
      'Mouse wheel zoom with smooth interpolation',
      'Configurable zoom range and speed',
      'Maintains UI scaling at all zoom levels',
    ],
    media: [
      // Add your media here, e.g.:
      // { type: 'image', src: '/images/game-features/dynamic-zoom.gif', alt: 'Dynamic zoom demonstration' },
      // { type: 'video', src: '/videos/game-features/dynamic-zoom.mp4', poster: '/images/game-features/dynamic-zoom-poster.jpg' },
    ],
    isNew: true,
  },
  {
    id: 'right-click-commands',
    icon: <MousePointerClick className="w-5 h-5" />,
    title: 'Right Click Move Commands',
    tagline: 'RTS-style unit control',
    description: 'Issue move commands with a simple right-click, bringing modern RTS-style controls to Infantry. Command bots and navigate with precision.',
    bullets: [
      'Right-click to set move destinations',
      'Visual waypoint indicators',
      'RTS-inspired command interface',
    ],
    media: [],
    isNew: true,
  },
  {
    id: 'uniform-previewer',
    icon: <Shirt className="w-5 h-5" />,
    title: 'Uniform Previewer',
    tagline: 'Preview before you commit',
    description: 'Browse and preview character uniforms and skins before selecting them. See exactly how your character will look in-game.',
    bullets: [
      'Full sprite preview with animations',
      'Browse all available uniforms',
      'Real-time preview in the UI',
    ],
    media: [],
    isNew: true,
  },
  {
    id: 'improved-ui',
    icon: <Layout className="w-5 h-5" />,
    title: 'Improved UI',
    tagline: 'Modern HUD, classic feel',
    description: 'A completely redesigned heads-up display with modern amenities while preserving the Infantry experience you know and love.',
    bullets: [
      'Animated ammo clip reloading indicator',
      'Redesigned health and energy bars',
      'Modern, readable fonts throughout',
      'Floating chat window with transparency',
      'Repositioned radar with better visibility',
    ],
    media: [],
    isNew: true,
  },
  {
    id: 'spectator-camera',
    icon: <Camera className="w-5 h-5" />,
    title: 'Enhanced Spectator Camera',
    tagline: 'Watch the action unfold',
    description: 'Improved spectator mode with independent camera controls, fog-of-war bypass, and smooth panning for a better viewing experience.',
    bullets: [
      'Independent camera movement',
      'Bypasses fog of war for full visibility',
      'Smooth pan and zoom controls',
      'Follow-player mode',
    ],
    media: [],
    isNew: true,
  },
  {
    id: 'colorblind-mode',
    icon: <Accessibility className="w-5 h-5" />,
    title: 'Better Colorblind Support',
    tagline: 'Accessible to everyone',
    description: 'Expanded colorblind mode with more options and better visual differentiation, making the game accessible to all players.',
    bullets: [
      'Multiple colorblind mode presets',
      'Enhanced team color differentiation',
      'Customizable color profiles',
    ],
    media: [],
    isNew: true,
  },
  {
    id: 'dev-tools',
    icon: <Hammer className="w-5 h-5" />,
    title: 'Modern Dev Tools',
    tagline: 'Built for today\'s OS',
    description: 'A complete suite of developer tools rebuilt from the ground up for modern operating systems. Create and edit maps, sprites, and game assets with ease.',
    bullets: [
      'Visual map editor with GPU-powered rendering',
      'CFS/BLO sprite browser and converter',
      'PNG-to-CFS conversion pipeline',
      'Seamless texture blending tools',
      'Batch processing for bulk operations',
      'LIO editor for doors, switches, and portals',
    ],
    media: [],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function extractStats(html: string): { value: string; label: string }[] {
  const stats: { value: string; label: string }[] = [];
  const statRegex = /<div class="stat"><span class="value">(\d+)<\/span><span class="label">([^<]+)<\/span><\/div>/g;
  let match;
  while ((match = statRegex.exec(html)) !== null) {
    stats.push({ value: match[1], label: match[2] });
  }
  return stats;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Media renderer ───────────────────────────────────────────────────

function FeatureMediaDisplay({ media, autoplay }: { media: FeatureMedia[]; autoplay?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!media || media.length === 0) {
    return (
      <div className="w-full aspect-video rounded-lg bg-gray-800/50 border border-gray-700/30 flex flex-col items-center justify-center gap-2 text-gray-600">
        <ImageIcon className="w-8 h-8" />
        <span className="text-xs font-mono">Media coming soon</span>
      </div>
    );
  }

  const current = media[activeIndex];

  return (
    <div className="space-y-2">
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-900 border border-cyan-500/20">
        {current.type === 'youtube' ? (
          <iframe
            src={`https://www.youtube.com/embed/${current.src}?${autoplay ? 'autoplay=1&' : ''}mute=1&rel=0&modestbranding=1`}
            title={current.alt || 'Feature video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : current.type === 'video' ? (
          <video
            src={current.src}
            poster={current.poster}
            controls
            loop
            muted
            autoPlay={autoplay}
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <Image
            src={current.src}
            alt={current.alt || 'Feature screenshot'}
            fill
            className="object-contain"
            unoptimized={current.src.endsWith('.gif')}
          />
        )}
      </div>
      {media.length > 1 && (
        <div className="flex gap-1.5 justify-center">
          {media.map((m, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`flex items-center justify-center w-6 h-6 rounded-full transition-all ${
                i === activeIndex
                  ? 'bg-cyan-500/20 ring-1 ring-cyan-400'
                  : 'bg-gray-700/30 hover:bg-gray-600/40'
              }`}
              aria-label={`View media ${i + 1}`}
            >
              {m.type === 'youtube' ? (
                <Play className="w-2.5 h-2.5 text-red-400" />
              ) : m.type === 'video' ? (
                <Film className="w-2.5 h-2.5 text-cyan-400" />
              ) : (
                <ImageIcon className="w-2.5 h-2.5 text-cyan-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────────────

function FeatureCard({ feature }: { feature: Feature }) {
  const [expanded, setExpanded] = useState(false);
  const hasMedia = feature.media && feature.media.length > 0;

  return (
    <div
      className="group relative rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 bg-gray-900/60 overflow-hidden transition-all duration-300"
    >
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5 flex items-start gap-4"
      >
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
          {feature.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-gray-200 group-hover:text-cyan-300 transition-colors">
              {feature.title}
            </h3>
            {feature.isNew && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
                New
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{feature.tagline}</p>
        </div>
        <div className={`text-gray-500 transition-transform duration-200 mt-1 ${expanded ? 'rotate-90' : ''}`}>
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-cyan-500/10">
          <div className={`mt-4 ${hasMedia ? 'grid grid-cols-1 lg:grid-cols-2 gap-5' : ''}`}>
            {/* Text content */}
            <div>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">
                {feature.description}
              </p>
              <ul className="space-y-1.5">
                {feature.bullets.map((bullet) => (
                  <li key={bullet} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0 mt-1.5" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            {/* Media */}
            {hasMedia && (
              <div>
                <FeatureMediaDisplay media={feature.media!} autoplay />
              </div>
            )}
          </div>

          {/* Media placeholder hint when no media */}
          {!hasMedia && (
            <div className="mt-4 w-full aspect-[21/9] rounded-lg bg-gray-800/30 border border-dashed border-gray-700/40 flex flex-col items-center justify-center gap-2 text-gray-600">
              <div className="flex gap-3">
                <ImageIcon className="w-5 h-5" />
                <Film className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono">Screenshots & videos coming soon</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function ToolsPageClient({ releases }: { releases: Release[] }) {
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const [activeNoteVersion, setActiveNoteVersion] = useState<string | null>(null);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const noteSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch(MANIFEST_URL)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setManifest(data); })
      .catch(() => {});

    fetch(RELEASE_NOTES_URL, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
      .then(r => r.ok ? r.json() : [])
      .then((notes: ReleaseNote[]) => {
        setReleaseNotes(notes);
        if (notes.length > 0) setActiveNoteVersion(notes[0].version);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ─── Hero Section ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-cyan-500/20">
        {/* Background effects */}
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 30% 20%, rgba(34,211,238,0.08) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.06) 0%, transparent 50%),
              linear-gradient(180deg, rgba(3,7,18,1) 0%, rgba(8,15,25,0.95) 100%)
            `,
          }}
        />
        {/* Scan lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
          }}
        />

        <div className="relative container mx-auto px-4 py-12 md:py-20 max-w-5xl">
          <Link href="/" className="text-sm text-cyan-500/60 hover:text-cyan-400 transition-colors font-mono mb-6 inline-block">
            &larr; Back to Home
          </Link>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-[0.2em]">
                  Infantry Online Reimagined
                </span>
              </div>
              <h1 className={`text-4xl md:text-5xl lg:text-6xl font-black tracking-wide text-white leading-tight ${orbitron.className}`}>
                Infantry
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"> CFS Studio</span>
              </h1>
              <p className="text-gray-400 mt-4 max-w-xl text-lg leading-relaxed">
                A modernized Infantry Online client and complete developer toolkit.
                New features, better visuals, and tools built for the modern era.
              </p>
            </div>

            {/* Download CTA */}
            <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
              <a
                href={DOWNLOAD_URL}
                className="inline-flex items-center gap-3 px-7 py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-xl font-bold text-white text-base transition-all hover:scale-[1.03] shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40"
              >
                <Download className="w-5 h-5" />
                Download {manifest ? `v${manifest.version}` : 'Latest'}
              </a>
              <div className="flex items-center gap-4 text-xs text-gray-500 font-mono">
                <span>Windows x64</span>
                {manifest?.pub_date && (
                  <span>{formatDate(manifest.pub_date)}</span>
                )}
                <a
                  href={`https://github.com/${GITHUB_REPO}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-500/50 hover:text-cyan-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-5xl">

        {/* ─── What's New / Features ──────────────────────────────────────── */}
        <section className="py-12">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className={`text-2xl md:text-3xl font-black tracking-wide text-gray-200 ${orbitron.className}`}>
              What&apos;s New
            </h2>
          </div>
          <p className="text-gray-500 mb-8 max-w-2xl">
            Major improvements over the original Infantry client. Click any feature to learn more and see visuals.
          </p>

          <div className="space-y-3">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </div>
        </section>

        {/* ─── Latest Update ──────────────────────────────────────────────── */}
        {manifest?.notes && (
          <section className="pb-12">
            <div className="relative rounded-xl border border-cyan-500/20 overflow-hidden"
              style={{
                background: `
                  linear-gradient(180deg, rgba(8,15,25,0.95) 0%, rgba(5,10,20,0.98) 100%),
                  radial-gradient(ellipse at 20% 50%, rgba(34,211,238,0.04) 0%, transparent 50%)
                `,
              }}
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
                }}
              />
              <div className="relative px-5 py-4 sm:px-8 sm:py-6">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <FileText className="w-4 h-4 text-cyan-400/60" />
                  <span className="text-sm font-mono font-bold text-cyan-400 uppercase tracking-wider">
                    Latest Update &mdash; v{manifest.version}
                  </span>
                  {manifest.pub_date && (
                    <span className="text-xs text-gray-500 font-mono">
                      {formatDate(manifest.pub_date)}
                    </span>
                  )}
                  {(() => {
                    const stats = extractStats(manifest.notes);
                    return stats.length > 0 ? (
                      <div className="flex items-center gap-3 ml-auto">
                        {stats.map((s) => (
                          <span key={s.label} className="text-[10px] font-mono text-gray-500">
                            <span className="text-cyan-400/70 font-bold">{s.value}</span> {s.label.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div
                  className="patch-notes-content"
                  dangerouslySetInnerHTML={{ __html: manifest.notes }}
                />
              </div>
            </div>
          </section>
        )}

        {/* ─── Patch Note History ────────────────────────────────────────── */}
        {releaseNotes.length > 0 && (
          <section className="pb-12">
            <h2 className={`text-xl font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
              Patch Note History
            </h2>

            <div className="relative rounded-xl border border-cyan-500/20 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(8,15,25,0.95) 0%, rgba(5,10,20,0.98) 100%)',
              }}
            >
              <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.02]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
                }}
              />

              <div className="relative z-20 flex flex-col md:flex-row">
                {/* Version sidebar */}
                <div className="md:w-48 lg:w-56 shrink-0 border-b md:border-b-0 md:border-r border-cyan-500/15 bg-gray-950/50">
                  <div className="px-4 py-3 border-b border-cyan-500/15">
                    <span className="text-[10px] font-mono font-bold text-cyan-400/60 uppercase tracking-[0.15em]">Versions</span>
                  </div>
                  <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:max-h-[500px] custom-scrollbar">
                    {releaseNotes.map((note) => (
                      <button
                        key={note.version}
                        onClick={() => {
                          setActiveNoteVersion(note.version);
                          noteSectionRefs.current[note.version]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={`shrink-0 w-full text-left px-4 py-2.5 transition-all border-b border-cyan-500/5 ${
                          activeNoteVersion === note.version
                            ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400'
                            : 'hover:bg-cyan-500/5 border-l-2 border-l-transparent'
                        }`}
                      >
                        <div className={`text-sm font-mono font-bold ${activeNoteVersion === note.version ? 'text-cyan-300' : 'text-gray-400'}`}>
                          v{note.version}
                        </div>
                        <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                          {formatDate(note.published_at)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Patch notes content */}
                <div className="flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
                  <div className="divide-y divide-cyan-500/10">
                    {releaseNotes.map((note) => {
                      const stats = extractStats(note.notes_html);
                      return (
                        <div
                          key={note.version}
                          ref={(el) => { noteSectionRefs.current[note.version] = el; }}
                          className="px-5 py-5 sm:px-8"
                        >
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <span className="text-cyan-400 font-mono text-sm font-bold">v{note.version}</span>
                            <span className="text-[10px] text-gray-600 font-mono">
                              {formatDate(note.published_at)}
                            </span>
                            {stats.length > 0 && (
                              <div className="flex items-center gap-3 ml-auto">
                                {stats.map((s) => (
                                  <span key={s.label} className="text-[10px] font-mono text-gray-500">
                                    <span className="text-cyan-400/70 font-bold">{s.value}</span> {s.label.toLowerCase()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            className="patch-notes-content"
                            dangerouslySetInnerHTML={{ __html: note.notes_html }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── Web Tools (secondary) ──────────────────────────────────────── */}
        <section className="pb-12">
          <h2 className={`text-xl font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
            Web Tools
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/tools/blob-viewer/index.html"
              className="group relative rounded-xl border border-gray-600/20 hover:border-cyan-500/30 bg-gray-900/50 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-200 group-hover:text-cyan-300 transition-colors mb-1">
                    Infantry Blob Viewer
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Browser-based BLO/CFS sprite and audio viewer with animation playback, zoom, and HSV adjustments.
                  </p>
                  <span className="inline-block mt-2 text-xs text-green-400/60 font-mono uppercase tracking-wider">
                    Browser &middot; No install required
                  </span>
                </div>
              </div>
            </Link>

            <div className="relative rounded-xl border border-gray-700/15 bg-gray-900/30 p-5 opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-700/20 border border-gray-600/20 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-500 mb-1">More Tools Coming</h3>
                  <p className="text-sm text-gray-600">
                    Config analyzers, zone tools, and more in development.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-8 border-t border-gray-800/50">
          <p className="text-gray-500 text-sm">
            Have suggestions?{' '}
            <Link href="/forum" className="text-cyan-400/70 hover:text-cyan-300 transition-colors">
              Let us know on the forum
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
