'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Orbitron } from 'next/font/google';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
  Download, ExternalLink, Monitor, FileText, Play, ChevronDown,
  ChevronRight, Gamepad2, Eye, Palette, Wrench, MousePointerClick,
  ZoomIn, Shirt, Layout, Camera, Accessibility, Hammer, Sparkles,
  Image as ImageIcon, Film, Pencil, Plus, Trash2, Link as LinkIcon,
  Upload, X, GripVertical,
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

// ── Feature & media types ────────────────────────────────────────────

interface FeatureMedia {
  id?: string;
  type: 'image' | 'video' | 'youtube';
  src: string;
  alt?: string;
  poster?: string;
}

interface DbFeatureMedia {
  id: string;
  feature_id: string;
  media_type: 'image' | 'video' | 'youtube';
  src: string;
  alt: string | null;
  sort_order: number;
}

interface Feature {
  id: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  description: string;
  bullets: string[];
  media?: FeatureMedia[];
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
  },
];

// ── Star field generator ─────────────────────────────────────────────

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

function parseYoutubeId(input: string): string | null {
  // Accept raw ID, full URL, or short URL
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const match = input.match(p);
    if (match) return match[1];
  }
  return null;
}

// ── Admin media editor ───────────────────────────────────────────────

function AdminMediaEditor({
  featureId,
  media,
  onUpdate,
}: {
  featureId: string;
  media: FeatureMedia[];
  onUpdate: () => void;
}) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  };

  const addYoutube = async () => {
    const videoId = parseYoutubeId(youtubeInput.trim());
    if (!videoId) {
      toast.error('Invalid YouTube URL or video ID');
      return;
    }

    const token = await getToken();
    if (!token) { toast.error('Not logged in'); return; }

    const res = await fetch('/api/feature-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        feature_id: featureId,
        media_type: 'youtube',
        src: videoId,
        sort_order: media.length,
      }),
    });

    if (res.ok) {
      toast.success('YouTube video added');
      setYoutubeInput('');
      setShowAddPanel(false);
      onUpdate();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to add video');
    }
  };

  const uploadImage = async (file: File) => {
    const token = await getToken();
    if (!token) { toast.error('Not logged in'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('feature_id', featureId);

      const uploadRes = await fetch('/api/feature-media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        toast.error(err.error || 'Upload failed');
        return;
      }

      const { url } = await uploadRes.json();

      // Save to DB
      const res = await fetch('/api/feature-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          feature_id: featureId,
          media_type: 'image',
          src: url,
          alt: file.name.replace(/\.[^.]+$/, ''),
          sort_order: media.length,
        }),
      });

      if (res.ok) {
        toast.success('Image uploaded');
        setShowAddPanel(false);
        onUpdate();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save');
      }
    } finally {
      setUploading(false);
    }
  };

  const deleteMedia = async (mediaItem: FeatureMedia) => {
    if (!mediaItem.id) return;
    const token = await getToken();
    if (!token) { toast.error('Not logged in'); return; }

    const res = await fetch(`/api/feature-media?id=${mediaItem.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      toast.success('Media removed');
      onUpdate();
    } else {
      toast.error('Failed to delete');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadImage(file);
    } else {
      toast.error('Only image files supported for drag & drop');
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Existing media with delete buttons */}
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div key={m.id || i} className="relative group/thumb">
              <div className="w-20 h-14 rounded bg-gray-800 border border-gray-700/50 overflow-hidden flex items-center justify-center">
                {m.type === 'youtube' ? (
                  <div className="text-center">
                    <Play className="w-4 h-4 text-red-400 mx-auto" />
                    <span className="text-[8px] text-gray-500 font-mono">{m.src.slice(0, 6)}...</span>
                  </div>
                ) : (
                  <img src={m.src} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              {m.id && (
                <button
                  onClick={() => deleteMedia(m)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add media button / panel */}
      {!showAddPanel ? (
        <button
          onClick={() => setShowAddPanel(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-cyan-400/70 hover:text-cyan-300 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 rounded-lg transition-all"
        >
          <Plus className="w-3 h-3" />
          Add Media
        </button>
      ) : (
        <div className="rounded-lg border border-cyan-500/20 bg-gray-900/80 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-cyan-400/70 uppercase tracking-wider">Add Media</span>
            <button onClick={() => setShowAddPanel(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* YouTube input */}
          <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 block">YouTube URL or Video ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addYoutube()}
                placeholder="https://youtube.com/watch?v=... or video ID"
                className="flex-1 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700/50 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
              />
              <button
                onClick={addYoutube}
                disabled={!youtubeInput.trim()}
                className="px-3 py-1.5 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-30"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Image upload / drag & drop */}
          <div>
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1 block">Upload Screenshot / GIF</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                dragOver
                  ? 'border-cyan-400 bg-cyan-500/10'
                  : 'border-gray-700/50 hover:border-gray-600 bg-gray-800/30'
              }`}
            >
              {uploading ? (
                <span className="text-xs text-cyan-400 font-mono animate-pulse">Uploading...</span>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-gray-500" />
                  <span className="text-xs text-gray-500">Drop image here or click to browse</span>
                  <span className="text-[10px] text-gray-600">PNG, JPG, GIF, WebP - Max 10MB</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Media renderer ───────────────────────────────────────────────────

function FeatureMediaDisplay({ media, autoplay }: { media: FeatureMedia[]; autoplay?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!media || media.length === 0) return null;

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
              key={m.id || i}
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

function FeatureCard({
  feature,
  isAdmin,
  dbMedia,
  onMediaUpdate,
}: {
  feature: Feature;
  isAdmin: boolean;
  dbMedia: FeatureMedia[];
  onMediaUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allMedia = dbMedia.length > 0 ? dbMedia : (feature.media || []);
  const hasMedia = allMedia.length > 0;

  return (
    <div className="group relative rounded-xl border border-cyan-500/20 hover:border-cyan-500/40 bg-gray-900/60 overflow-hidden transition-all duration-300">
      {/* Header */}
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
            {/* Subtle media count badge */}
            {hasMedia && !expanded && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono text-gray-500 bg-gray-800/50 rounded">
                {allMedia.length} media
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{feature.tagline}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {/* Admin edit indicator */}
          {isAdmin && (
            <span className="text-amber-500/40 hover:text-amber-400 transition-colors" title="Admin: click to manage media">
              <Pencil className="w-3.5 h-3.5" />
            </span>
          )}
          <div className={`text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-cyan-500/10">
          <div className={`mt-4 ${hasMedia ? 'grid grid-cols-1 lg:grid-cols-2 gap-5' : ''}`}>
            {/* Text */}
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

            {/* Media display */}
            {hasMedia && (
              <div>
                <FeatureMediaDisplay media={allMedia} autoplay />
              </div>
            )}
          </div>

          {/* No media placeholder (non-admin) */}
          {!hasMedia && !isAdmin && (
            <div className="mt-4 w-full aspect-[21/9] rounded-lg bg-gray-800/30 border border-dashed border-gray-700/40 flex flex-col items-center justify-center gap-2 text-gray-600">
              <div className="flex gap-3">
                <ImageIcon className="w-5 h-5" />
                <Film className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono">Screenshots & videos coming soon</span>
            </div>
          )}

          {/* Admin media editor */}
          {isAdmin && (
            <AdminMediaEditor
              featureId={feature.id}
              media={allMedia}
              onUpdate={onMediaUpdate}
            />
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [featureMediaMap, setFeatureMediaMap] = useState<Record<string, FeatureMedia[]>>({});
  const noteSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      setIsAdmin(!!profile?.is_admin);
    };
    checkAdmin();
  }, []);

  // Fetch feature media from DB
  const loadFeatureMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/feature-media');
      if (!res.ok) return;
      const data: DbFeatureMedia[] = await res.json();

      const map: Record<string, FeatureMedia[]> = {};
      for (const item of data) {
        if (!map[item.feature_id]) map[item.feature_id] = [];
        map[item.feature_id].push({
          id: item.id,
          type: item.media_type,
          src: item.src,
          alt: item.alt || undefined,
        });
      }
      setFeatureMediaMap(map);
    } catch {
      // Silent fail — hardcoded media will be used as fallback
    }
  }, []);

  useEffect(() => {
    loadFeatureMedia();
  }, [loadFeatureMedia]);

  // Fetch manifest & release notes
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
        // Default to second note (previous version) since latest is shown above
        if (notes.length > 1) setActiveNoteVersion(notes[1].version);
        else if (notes.length > 0) setActiveNoteVersion(notes[0].version);
      })
      .catch(() => {});
  }, []);

  // Star field (memoized to prevent regeneration)
  const heroStars = useMemo(() => ({
    far: generateStars(60, 3),
    mid: generateStars(35, 2),
    close: generateStars(18, 1),
  }), []);

  // Auto-scrolling feature carousel
  const [activeFeatureIdx, setActiveFeatureIdx] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);

  useEffect(() => {
    if (carouselPaused) return;
    const timer = setInterval(() => {
      setActiveFeatureIdx(prev => (prev + 1) % FEATURES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [carouselPaused]);

  // Track which feature is expanded in the right panel
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  // Reset playing video when carousel advances
  useEffect(() => {
    setPlayingVideoId(null);
  }, [activeFeatureIdx]);

  return (
    <div className="min-h-screen text-white relative">
      {/* Page-wide deep space background */}
      <div className="fixed inset-0 -z-10" style={{
        background: 'linear-gradient(180deg, #050510 0%, #0a0e1a 40%, #080d18 70%, #050510 100%)',
      }} />
      <div className="fixed inset-0 -z-10">
        {heroStars.far.map((star) => (
          <div key={`bg-${star.id}`} className="absolute rounded-full bg-white" style={{
            left: star.left, top: star.top,
            width: star.size * 0.7, height: star.size * 0.7,
            opacity: star.opacity * 0.4,
          }} />
        ))}
      </div>

      {/* ─── Hero Carousel (starfield style) ────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b border-cyan-500/20"
        onMouseEnter={() => setCarouselPaused(true)}
        onMouseLeave={() => setCarouselPaused(false)}
      >
        {/* Deep space background */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, #050510 0%, #0a0e1a 50%, #050510 100%)',
        }} />

        {/* Star layers */}
        <div className="absolute inset-0 hero-drift-far">
          {heroStars.far.map((star) => (
            <div key={star.id} className="absolute rounded-full bg-white" style={{
              left: star.left, top: star.top,
              width: star.size, height: star.size,
              opacity: star.opacity,
            }} />
          ))}
        </div>
        <div className="absolute inset-0 hero-drift-mid">
          {heroStars.mid.map((star) => (
            <div key={star.id} className="absolute rounded-full bg-white animate-pulse" style={{
              left: star.left, top: star.top,
              width: star.size, height: star.size,
              opacity: star.opacity,
              animationDuration: star.animationDuration,
              animationDelay: star.animationDelay,
            }} />
          ))}
        </div>
        <div className="absolute inset-0 hero-drift-close">
          {heroStars.close.map((star) => (
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

        {/* Nebula glow */}
        <div
          className="absolute inset-0 opacity-30 transition-all duration-500"
          style={{
            background: `radial-gradient(ellipse at 50% 60%, rgba(34,211,238,0.5) 0%, transparent 60%)`,
          }}
        />

        {/* Shooting stars */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-shoot-1" />
          <div className="hero-shoot-2" />
        </div>

        {/* Accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)',
          }}
        />

        {/* Content */}
        <div className="relative container mx-auto px-4 max-w-7xl">
          {/* Top bar: back link + download */}
          <div className="flex items-center justify-between pt-4 pb-2">
            <Link href="/" className="text-xs text-cyan-500/50 hover:text-cyan-400 transition-colors font-mono">
              &larr; Back to Home
            </Link>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-500 font-mono">
                <span>Windows x64</span>
                {manifest?.pub_date && <span>{formatDate(manifest.pub_date)}</span>}
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

          {/* Carousel slide — 16:9 aspect ratio */}
          <div className="relative w-full aspect-video max-h-[450px]">
            {/* Media layer */}
            {(() => {
              const activeFeature = FEATURES[activeFeatureIdx];
              const activeMedia = featureMediaMap[activeFeature.id]?.[0];

              if (activeMedia?.type === 'youtube') {
                const isPlaying = playingVideoId === activeMedia.src;
                return (
                  <>
                    {isPlaying ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${activeMedia.src}?autoplay=1&mute=1&loop=1&playlist=${activeMedia.src}&controls=1&rel=0&modestbranding=1&playsinline=1`}
                        title={activeMedia.alt || 'Feature video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full z-20"
                        style={{ border: 'none' }}
                      />
                    ) : (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${activeMedia.src}/maxresdefault.jpg`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050510]/90 via-[#050510]/40 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050510]/80 via-transparent to-[#050510]/30" />
                        {/* Play button - centered */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlayingVideoId(activeMedia.src);
                            setCarouselPaused(true);
                          }}
                          className="absolute inset-0 z-20 flex items-center justify-center group/play"
                        >
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-600/90 group-hover/play:bg-red-500 flex items-center justify-center transition-all group-hover/play:scale-110 shadow-lg shadow-red-500/30">
                            <Play className="w-7 h-7 md:w-8 md:h-8 text-white ml-1" />
                          </div>
                        </button>
                      </>
                    )}
                  </>
                );
              }
              if (activeMedia?.type === 'image') {
                return (
                  <>
                    <img src={activeMedia.src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#050510]/90 via-[#050510]/40 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050510]/80 via-transparent to-[#050510]/30" />
                  </>
                );
              }
              // No media — stars show through
              return null;
            })()}

            {/* Content overlay — left-aligned to leave space for media */}
            <div className="absolute inset-0 flex items-center z-10 px-6 md:px-12">
              <div className="max-w-md">
                <div className="flex items-center gap-2 mb-2">
                  <Gamepad2 className="w-4 h-4 text-cyan-400/60" />
                  <span className="text-[10px] font-mono font-bold text-cyan-400/50 uppercase tracking-[0.2em]">
                    Infantry Online Reimagined
                  </span>
                </div>

                <h1 className={`text-3xl md:text-5xl font-black tracking-wider mb-1 ${orbitron.className}`}>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
                    style={{ filter: 'drop-shadow(0 0 15px currentColor)' }}
                  >
                    INFANTRY v2
                  </span>
                </h1>

                {/* Active feature title & tagline */}
                <p className="text-gray-200 text-sm md:text-lg mb-1 mt-3 font-semibold">
                  {FEATURES[activeFeatureIdx].title}
                  {FEATURES[activeFeatureIdx].isNew && (
                    <span className="ml-2 px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-400 rounded-full align-middle">
                      New
                    </span>
                  )}
                </p>
                <p className="text-gray-400 text-xs md:text-sm mb-5">
                  {FEATURES[activeFeatureIdx].tagline}
                </p>

                {/* Download CTA */}
                <a
                  href={DOWNLOAD_URL}
                  className="group relative inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg font-bold text-white text-sm overflow-hidden transition-all duration-300 hover:scale-105"
                  style={{
                    boxShadow: '0 0 20px rgba(34,211,238,0.4), 0 0 40px rgba(34,211,238,0.2)',
                  }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download {manifest ? `v${manifest.version}` : 'Latest'}
                  </span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </a>

                {/* Navigation dots */}
                <div className="flex items-center gap-2.5 mt-5">
                {FEATURES.map((feature, idx) => (
                  <button
                    key={feature.id}
                    onClick={() => {
                      setActiveFeatureIdx(idx);
                      setCarouselPaused(true);
                      setTimeout(() => setCarouselPaused(false), 10000);
                    }}
                    className={`transition-all duration-300 ${idx === activeFeatureIdx ? 'scale-110' : 'hover:scale-105'}`}
                    aria-label={`Go to ${feature.title}`}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                        idx === activeFeatureIdx
                          ? 'bg-gradient-to-r from-cyan-400 to-blue-500 shadow-lg'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                      style={idx === activeFeatureIdx ? { boxShadow: '0 0 10px rgba(34,211,238,0.5)' } : {}}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Hero carousel animations */}
        <style dangerouslySetInnerHTML={{ __html: `
          .hero-drift-far { animation: hDriftFar 20s ease-in-out infinite; }
          .hero-drift-mid { animation: hDriftMid 12s ease-in-out infinite; }
          .hero-drift-close { animation: hDriftClose 8s ease-in-out infinite; }
          @keyframes hDriftFar {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(3px, -2px); }
            66% { transform: translate(-2px, 2px); }
          }
          @keyframes hDriftMid {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(-5px, 4px); }
            66% { transform: translate(4px, -3px); }
          }
          @keyframes hDriftClose {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(8px, -5px); }
            66% { transform: translate(-6px, 4px); }
          }
          .hero-shoot-1, .hero-shoot-2 {
            position: absolute;
            height: 1px;
            border-radius: 999px;
            opacity: 0;
          }
          .hero-shoot-1 {
            top: 25%; left: -40px; width: 40px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
            box-shadow: 0 0 4px rgba(255,255,255,0.3);
            animation: hShoot 7s ease-in-out infinite 2s;
          }
          .hero-shoot-2 {
            top: 60%; left: -30px; width: 30px;
            background: linear-gradient(90deg, transparent, rgba(100,200,255,0.5), transparent);
            box-shadow: 0 0 3px rgba(100,200,255,0.2);
            animation: hShoot 10s ease-in-out infinite 6s;
          }
          @keyframes hShoot {
            0% { transform: translateX(0) rotate(-20deg); opacity: 0; }
            5% { opacity: 1; }
            25% { transform: translateX(700px) rotate(-20deg); opacity: 0; }
            100% { opacity: 0; }
          }
        ` }} />
      </section>

      {/* ─── Main Content: Patch Notes (left) + Features (right) ─────────── */}
      <div className="container mx-auto px-4 max-w-7xl py-8">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ─── Left: Patch Notes ──────────────────────────────────────── */}
          <div className="lg:w-1/2 space-y-6">
            {/* Latest Update */}
            {manifest?.notes && (
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
                <div className="relative px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <FileText className="w-3.5 h-3.5 text-cyan-400/60" />
                    <span className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                      Latest &mdash; v{manifest.version}
                    </span>
                    {manifest.pub_date && (
                      <span className="text-[10px] text-gray-500 font-mono">
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
            )}

            {/* Patch Note History (exclude current version since it's shown above) */}
            {(() => {
              const historyNotes = manifest
                ? releaseNotes.filter(n => n.version !== manifest.version)
                : releaseNotes;
              return historyNotes.length > 0 && (
              <div>
                <h2 className={`text-lg font-black tracking-wide text-gray-300 mb-3 ${orbitron.className}`}>
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
                    <div className="md:w-36 lg:w-44 shrink-0 border-b md:border-b-0 md:border-r border-cyan-500/15 bg-gray-950/50">
                      <div className="px-3 py-2 border-b border-cyan-500/15">
                        <span className="text-[10px] font-mono font-bold text-cyan-400/60 uppercase tracking-[0.15em]">Versions</span>
                      </div>
                      <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:max-h-[500px] custom-scrollbar">
                        {historyNotes.map((note) => (
                          <button
                            key={note.version}
                            onClick={() => {
                              setActiveNoteVersion(note.version);
                              noteSectionRefs.current[note.version]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className={`shrink-0 w-full text-left px-3 py-2 transition-all border-b border-cyan-500/5 ${
                              activeNoteVersion === note.version
                                ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400'
                                : 'hover:bg-cyan-500/5 border-l-2 border-l-transparent'
                            }`}
                          >
                            <div className={`text-xs font-mono font-bold ${activeNoteVersion === note.version ? 'text-cyan-300' : 'text-gray-400'}`}>
                              v{note.version}
                            </div>
                            <div className="text-[10px] text-gray-600 font-mono">
                              {formatDate(note.published_at)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
                      <div className="divide-y divide-cyan-500/10">
                        {historyNotes.map((note) => {
                          const stats = extractStats(note.notes_html);
                          return (
                            <div
                              key={note.version}
                              ref={(el) => { noteSectionRefs.current[note.version] = el; }}
                              className="px-4 py-4 sm:px-6"
                            >
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-cyan-400 font-mono text-xs font-bold">v{note.version}</span>
                                <span className="text-[10px] text-gray-600 font-mono">
                                  {formatDate(note.published_at)}
                                </span>
                                {stats.length > 0 && (
                                  <div className="flex items-center gap-2 ml-auto">
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
              </div>
            );
            })()}
          </div>

          {/* ─── Right: What's New Features ────────────────────────────── */}
          <div className="lg:w-1/2">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className={`text-lg font-black tracking-wide text-gray-300 ${orbitron.className}`}>
                What&apos;s New
              </h2>
              {isAdmin && (
                <span className="px-2 py-0.5 text-[10px] font-mono text-amber-400/60 bg-amber-500/10 border border-amber-500/20 rounded-full">
                  Admin
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Click any feature to see details and visuals.
            </p>

            <div className="space-y-2">
              {FEATURES.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  isAdmin={isAdmin}
                  dbMedia={featureMediaMap[feature.id] || []}
                  onMediaUpdate={loadFeatureMedia}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ─── Web Tools ──────────────────────────────────────────────────── */}
        <section className="pt-8 pb-12">
          <h2 className={`text-lg font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
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
