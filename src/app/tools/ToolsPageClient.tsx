'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';
import { Download, ExternalLink, Monitor, FileText, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'react-hot-toast';

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

interface LatestBuild {
  id: string;
  version: string;
  changelog: string | null;
  filename: string;
  file_size: number;
  file_path: string;
  download_url: string;
  uploaded_at: string;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ToolsPageClient({ releases, latestBuild }: { releases: Release[]; latestBuild: LatestBuild | null }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentBuild, setCurrentBuild] = useState<LatestBuild | null>(latestBuild);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const [activeNoteVersion, setActiveNoteVersion] = useState<string | null>(null);
  const noteSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadChangelog, setUploadChangelog] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin, site_admin')
        .eq('id', user.id)
        .single();
      setIsAdmin(data?.is_admin || data?.site_admin || false);
    };
    checkAdmin();
  }, [user]);

  const handleBuildUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { toast.error('Please select a file'); return; }
    if (!uploadVersion.trim()) { toast.error('Please enter a version'); return; }

    const validExts = ['.exe', '.msi', '.zip'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(ext)) {
      toast.error('File must be .exe, .msi, or .zip');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress('Uploading file to storage...');

      // 1. Upload file directly to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('builds')
        .upload(`latest/${file.name}`, file, { upsert: true });

      if (uploadError) {
        if (uploadError.message?.includes('policy')) {
          toast.error('Upload permission denied. Admin access required.');
        } else {
          toast.error(`Upload failed: ${uploadError.message}`);
        }
        return;
      }

      // 2. Save metadata via API
      setUploadProgress('Saving build metadata...');
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch('/api/builds/metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          version: uploadVersion.trim(),
          changelog: uploadChangelog.trim() || null,
          filename: file.name,
          file_size: file.size,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save metadata');
      }

      const newBuild = await res.json();
      setCurrentBuild(newBuild);
      setUploadVersion('');
      setUploadChangelog('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(`Build ${uploadVersion.trim()} uploaded successfully!`);
    } catch (error: any) {
      console.error('Build upload error:', error);
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-cyan-500/60 hover:text-cyan-400 transition-colors font-mono mb-4 inline-block">
            &larr; Back to Home
          </Link>
          <h1 className={`text-4xl md:text-5xl font-black tracking-wide text-gray-200 ${orbitron.className}`}>
            Dev Tools
          </h1>
          <div className="mt-2 h-0.5 w-32 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full" />
          <p className="text-gray-400 mt-4 max-w-2xl">
            Desktop tools and utilities for Infantry Online development, mapping, and asset creation.
          </p>
        </div>

        {/* ─── CFS Studio Featured Section ───────────────────────────────── */}
        <section className="mb-12">
          <div className="relative rounded-lg border border-cyan-500/30 bg-gray-950/90 overflow-hidden">
            {/* Scan line overlay */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.02]"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
              }}
            />

            {/* Top bar */}
            <div className="relative z-20 flex items-center justify-between px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/30">
              <div className="flex items-center gap-3">
                <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-[0.2em]">Desktop Application</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-500/60 tracking-wider">
                Windows x64
              </span>
            </div>

            <div className="relative z-20 p-6 sm:p-8">
              <div className="flex-1">
                <h2 className={`text-2xl md:text-3xl font-black text-white mb-2 ${orbitron.className}`}>
                  Infantry CFS Studio
                </h2>
                <p className="text-gray-400 mb-4 leading-relaxed">
                  Full-featured desktop toolkit for Infantry Online modding and asset management.
                  Map editor with visual tile/object placement, CFS/BLO sprite viewer and converter,
                  PNG-to-CFS pipeline, seamless texture blending, batch processing, and LIO editing.
                </p>

                {/* Feature highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-6">
                  {[
                    'Map editor with play-test mode',
                    'CFS/BLO asset browser & exporter',
                    'PNG to CFS conversion pipeline',
                    'LIO door/switch/flag editing',
                    'Seamless texture blending',
                    'Batch processing & multi-map',
                  ].map(feat => (
                    <div key={feat} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0" />
                      {feat}
                    </div>
                  ))}
                </div>

                {/* Download button — permanent link to latest build */}
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={DOWNLOAD_URL}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white text-sm transition-all hover:scale-[1.02] shadow-lg shadow-cyan-500/20"
                  >
                    <Download className="w-4 h-4" />
                    Download {manifest ? `v${manifest.version}` : 'Latest'}
                  </a>
                  <a
                    href={`https://github.com/${GITHUB_REPO}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-cyan-400/70 hover:text-cyan-300 text-sm transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    GitHub
                  </a>
                </div>

                {/* Latest patch notes from manifest */}
                {manifest?.notes && (
                  <div className="mt-5">
                    <div className="relative rounded border border-cyan-500/15 overflow-hidden"
                      style={{
                        background: `
                          linear-gradient(180deg, rgba(8,15,25,0.95) 0%, rgba(5,10,20,0.98) 100%),
                          radial-gradient(ellipse at 20% 50%, rgba(34,211,238,0.04) 0%, transparent 50%)
                        `,
                      }}
                    >
                      <div
                        className="absolute inset-0 pointer-events-none opacity-[0.025]"
                        style={{
                          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
                        }}
                      />
                      <div className="relative px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="w-3.5 h-3.5 text-cyan-400/60" />
                          <span className="text-xs font-mono font-bold text-cyan-400/70 uppercase tracking-wider">Latest — v{manifest.version}</span>
                          {manifest.pub_date && (
                            <span className="text-xs text-gray-500 font-mono ml-auto">
                              {formatDate(manifest.pub_date)}
                            </span>
                          )}
                        </div>
                        <div
                          className="patch-notes-content"
                          dangerouslySetInnerHTML={{ __html: manifest.notes }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

            {/* ─── Admin Build Upload ──────────────────────────────── */}
            {isAdmin && (
              <div className="relative z-20 px-6 py-5 sm:px-8 bg-gray-900/60 border-t border-cyan-500/20">
                <h3 className="text-sm font-mono font-bold text-cyan-400/80 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  Upload New Build
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">Version *</label>
                    <input
                      type="text"
                      value={uploadVersion}
                      onChange={e => setUploadVersion(e.target.value)}
                      placeholder="e.g. v1.5.0"
                      disabled={uploading}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-gray-600/40 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">File (.exe, .msi, .zip) *</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".exe,.msi,.zip"
                      disabled={uploading}
                      className="w-full px-3 py-1.5 bg-gray-800/80 border border-gray-600/40 rounded-lg text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-mono file:bg-cyan-600/20 file:text-cyan-300 hover:file:bg-cyan-600/30 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 font-mono mb-1">Changelog (optional)</label>
                  <textarea
                    value={uploadChangelog}
                    onChange={e => setUploadChangelog(e.target.value)}
                    placeholder="What's new in this version..."
                    rows={3}
                    disabled={uploading}
                    className="w-full px-3 py-2 bg-gray-800/80 border border-gray-600/40 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-cyan-500/50 focus:outline-none resize-none disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={handleBuildUpload}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg text-cyan-300 hover:text-cyan-200 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploadProgress}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Build
                    </>
                  )}
                </button>
                {currentBuild && (
                  <p className="mt-3 text-xs text-gray-500 font-mono">
                    Current: {currentBuild.version} &mdash; {currentBuild.filename} ({formatBytes(currentBuild.file_size)})
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ─── Patch Note History ──────────────────────────────────────────── */}
        {releaseNotes.length > 0 && (
          <section className="mb-12">
            <h2 className={`text-xl font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
              Patch Note History
            </h2>

            <div className="relative rounded-lg border border-cyan-500/20 overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(8,15,25,0.95) 0%, rgba(5,10,20,0.98) 100%)',
              }}
            >
              {/* Scan line overlay */}
              <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.02]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)',
                }}
              />

              <div className="relative z-20 flex flex-col md:flex-row">
                {/* Navigation sidebar */}
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
                          {new Date(note.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Patch notes content area */}
                <div className="flex-1 overflow-y-auto max-h-[600px] custom-scrollbar">
                  <div className="divide-y divide-cyan-500/10">
                    {releaseNotes.map((note) => (
                      <div
                        key={note.version}
                        ref={(el) => { noteSectionRefs.current[note.version] = el; }}
                        className="px-5 py-5 sm:px-8"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-cyan-400 font-mono text-sm font-bold">v{note.version}</span>
                          <span className="text-[10px] text-gray-600 font-mono">
                            {new Date(note.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <div
                          className="patch-notes-content"
                          dangerouslySetInnerHTML={{ __html: note.notes_html }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── Other Tools ────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className={`text-xl font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
            Web Tools
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Blob Viewer */}
            <Link
              href="/tools/blob-viewer/index.html"
              className="group relative rounded-lg border border-gray-600/20 hover:border-cyan-500/30 bg-gray-900/50 p-5 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-green-400" />
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

            {/* Placeholder */}
            <div className="relative rounded-lg border border-gray-700/15 bg-gray-900/30 p-5 opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-700/20 border border-gray-600/20 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-gray-600" />
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
        <div className="text-center pt-6 border-t border-gray-800/50">
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
