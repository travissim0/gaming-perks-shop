'use client';

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZoneMedia, AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';

interface ZoneMediaPreviewProps {
  media: ZoneMedia | null;
  zoneName: string;
  zoneIcon?: string;
  accentColor: AccentColor;
}

export default function ZoneMediaPreview({
  media,
  zoneName,
  zoneIcon,
  accentColor,
}: ZoneMediaPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMobilePlaying, setIsMobilePlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const colors = colorClasses[accentColor] || colorClasses.cyan;

  const hasPreview = !!(media?.hover_preview_url);
  const hasThumbnail = !!(media?.thumbnail_url);
  const hasVod = !!(media?.vod_link);
  const icon = media?.icon_override || zoneIcon || '🎮';

  const isVideo = media?.hover_preview_url?.match(/\.(mp4|webm)(\?|$)/i);

  const handleHoverStart = useCallback(() => {
    setIsHovered(true);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [isVideo]);

  const handleHoverEnd = useCallback(() => {
    setIsHovered(false);
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isVideo]);

  const handleMobileToggle = useCallback(() => {
    if (!hasPreview) return;
    const next = !isMobilePlaying;
    setIsMobilePlaying(next);
    if (isVideo && videoRef.current) {
      if (next) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [hasPreview, isMobilePlaying, isVideo]);

  const showPreview = isHovered || isMobilePlaying;

  return (
    <div
      className="relative aspect-video overflow-hidden rounded-t-xl bg-gray-900/80"
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
    >
      {/* Layer 1: Thumbnail or gradient fallback */}
      <motion.div
        className="absolute inset-0"
        animate={{ x: showPreview && hasPreview ? '-100%' : '0%' }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        {hasThumbnail ? (
          <img
            src={media!.thumbnail_url!}
            alt={zoneName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center`}
          >
            <span className="text-5xl opacity-60 select-none">{icon}</span>
          </div>
        )}
      </motion.div>

      {/* Layer 2: Hover preview (GIF or video) */}
      {hasPreview && (
        <AnimatePresence>
          {showPreview && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={media!.hover_preview_url!}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  preload="none"
                />
              ) : (
                <img
                  src={media!.hover_preview_url!}
                  alt={`${zoneName} preview`}
                  className="w-full h-full object-cover"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* VOD play button (bottom-right corner) */}
      {hasVod && (
        <a
          href={media!.vod_link!}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg
            bg-gray-900/80 backdrop-blur-sm border border-gray-600/40
            text-gray-300 hover:text-white hover:bg-gray-800/90
            transition-all text-xs font-medium ${showPreview ? 'animate-pulse' : ''}`}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
          VOD
        </a>
      )}

      {/* Mobile play toggle (visible only on touch devices without hover) */}
      {hasPreview && (
        <button
          onClick={handleMobileToggle}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full
            bg-gray-900/70 backdrop-blur-sm border border-gray-600/40
            text-gray-300 hover:text-white transition-colors
            [@media(hover:hover)]:hidden"
          aria-label={isMobilePlaying ? 'Stop preview' : 'Play preview'}
        >
          {isMobilePlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zm7 0a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
