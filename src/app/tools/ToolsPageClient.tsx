'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Orbitron } from 'next/font/google';
import { Download, ChevronRight, ExternalLink, Monitor, FileText, Tag } from 'lucide-react';

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

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-cyan-300 mt-4 mb-1.5 font-mono uppercase tracking-wider">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-cyan-200 mt-5 mb-2 font-mono">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold text-white mt-5 mb-2">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-cyan-100 font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-800/80 px-1.5 py-0.5 rounded text-cyan-300 text-xs font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-gray-300 text-sm leading-relaxed"><span class="text-cyan-500/60 mt-1 shrink-0">&rsaquo;</span><span>$1</span></li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-cyan-500/30 pl-3 text-gray-400 italic text-sm my-2">$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">$1</a>')
    .replace(/\n{2,}/g, '<div class="h-3"></div>')
    .replace(/\n/g, '<br/>');
}

export default function ToolsPageClient({ releases }: { releases: Release[] }) {
  const [expandedRelease, setExpandedRelease] = useState<string | null>(
    releases.length > 0 ? releases[0].tag_name : null
  );

  const latestStable = releases.find(r => !r.prerelease);
  const latestRelease = releases[0];

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

                {/* Download buttons */}
                {latestStable && (
                  <div className="flex flex-wrap items-center gap-3">
                    {latestStable.assets
                      .filter(a => a.name.endsWith('.exe'))
                      .map(asset => (
                        <a
                          key={asset.name}
                          href={asset.browser_download_url}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-bold text-white text-sm transition-all hover:scale-[1.02] shadow-lg shadow-cyan-500/20"
                        >
                          <Download className="w-4 h-4" />
                          Download {latestStable.tag_name}
                          <span className="text-white/60 text-xs font-normal">({formatBytes(asset.size)})</span>
                        </a>
                      ))}
                    {latestStable.assets
                      .filter(a => a.name.endsWith('.msi'))
                      .map(asset => (
                        <a
                          key={asset.name}
                          href={asset.browser_download_url}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600/40 hover:border-cyan-500/40 rounded-lg text-gray-300 hover:text-white text-sm transition-all"
                        >
                          <Download className="w-4 h-4" />
                          MSI Installer
                          <span className="text-gray-500 text-xs">({formatBytes(asset.size)})</span>
                        </a>
                      ))}
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
                )}

                {/* Pre-release notice */}
                {latestRelease && latestRelease.prerelease && latestRelease.tag_name !== latestStable?.tag_name && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400/70 font-mono">
                    <Tag className="w-3 h-3" />
                    Pre-release {latestRelease.tag_name} available below
                  </div>
                )}
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          </div>
        </section>

        {/* ─── All Releases / Changelogs ──────────────────────────────────── */}
        <section className="mb-12">
          <h2 className={`text-xl font-black tracking-wide text-gray-300 mb-4 ${orbitron.className}`}>
            Releases & Changelogs
          </h2>

          {releases.length === 0 ? (
            <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm">
              Could not load releases. <a href={`https://github.com/${GITHUB_REPO}/releases`} target="_blank" rel="noopener noreferrer" className="underline">View on GitHub</a>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-700/30 overflow-hidden">
              {releases.map((release, i) => {
                const isOpen = expandedRelease === release.tag_name;
                const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
                const msiAsset = release.assets.find(a => a.name.endsWith('.msi'));

                return (
                  <div key={release.tag_name} className={i < releases.length - 1 ? 'border-b border-gray-700/20' : ''}>
                    {/* Row header */}
                    <button
                      onClick={() => setExpandedRelease(isOpen ? null : release.tag_name)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-500/5 transition-all duration-200 text-left"
                    >
                      <ChevronRight className={`w-4 h-4 transition-all duration-300 shrink-0 ${isOpen ? 'rotate-90 text-cyan-400' : 'text-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-200 font-medium">
                          {release.name || release.tag_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {release.prerelease && (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 rounded">
                            Pre-release
                          </span>
                        )}
                        <span className="text-xs text-cyan-500/50 font-mono">
                          {release.tag_name}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {formatDate(release.published_at)}
                        </span>
                      </div>
                    </button>

                    {/* Expanded content */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                        transition: 'grid-template-rows 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    >
                      <div className="overflow-hidden">
                        <div
                          style={{
                            opacity: isOpen ? 1 : 0,
                            transition: 'opacity 300ms ease-in-out',
                            transitionDelay: isOpen ? '150ms' : '0ms',
                          }}
                        >
                          <div className="h-px bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />
                          <div className="px-5 py-5 sm:px-8 bg-gray-900/50">
                            {/* Download buttons for this release */}
                            <div className="flex flex-wrap gap-2 mb-5">
                              {exeAsset && (
                                <a
                                  href={exeAsset.browser_download_url}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg text-cyan-300 hover:text-cyan-200 text-sm font-medium transition-all"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  {exeAsset.name}
                                  <span className="text-cyan-500/50 text-xs">({formatBytes(exeAsset.size)})</span>
                                </a>
                              )}
                              {msiAsset && (
                                <a
                                  href={msiAsset.browser_download_url}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800/60 hover:bg-gray-800/80 border border-gray-600/30 hover:border-gray-500/40 rounded-lg text-gray-400 hover:text-gray-300 text-sm transition-all"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  MSI
                                  <span className="text-gray-600 text-xs">({formatBytes(msiAsset.size)})</span>
                                </a>
                              )}
                              <a
                                href={release.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-cyan-400 text-sm transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                GitHub
                              </a>
                            </div>

                            {/* Changelog body */}
                            {release.body && (
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
                                <div
                                  className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay"
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
                                  }}
                                />
                                <div className="relative px-5 py-4 font-mono text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(release.body) }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
