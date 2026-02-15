'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { AccentColor } from '@/types/zone-explorer';
import { colorClasses } from '@/types/zone-explorer';

interface ZoneNotifyButtonProps {
  zoneTitle: string;
  accentColor: AccentColor;
  isSubscribed: boolean;
  currentThreshold?: number;
  isLoggedIn: boolean;
  onSubscribe: (zoneTitle: string, threshold: number) => Promise<void>;
  onUnsubscribe: (zoneTitle: string) => Promise<void>;
}

export default function ZoneNotifyButton({
  zoneTitle,
  accentColor,
  isSubscribed,
  currentThreshold = 5,
  isLoggedIn,
  onSubscribe,
  onUnsubscribe,
}: ZoneNotifyButtonProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [threshold, setThreshold] = useState(currentThreshold);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const colors = colorClasses[accentColor] || colorClasses.cyan;

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  const handleClick = () => {
    if (!isLoggedIn) return;
    if (isSubscribed) {
      // Quick unsubscribe on click
      setSaving(true);
      onUnsubscribe(zoneTitle).finally(() => setSaving(false));
    } else {
      setShowPopover(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSubscribe(zoneTitle, threshold);
      setShowPopover(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={handleClick}
        disabled={saving || !isLoggedIn}
        title={
          !isLoggedIn
            ? 'Sign in to set notifications'
            : isSubscribed
            ? 'Click to unsubscribe'
            : 'Notify me when players are online'
        }
        className={`p-1.5 rounded-lg transition-all ${
          isSubscribed
            ? `${colors.button} ring-1 ring-current/30`
            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'
        } ${!isLoggedIn ? 'opacity-40 cursor-not-allowed' : ''} ${
          saving ? 'animate-pulse' : ''
        }`}
      >
        {isSubscribed ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 002-2H8a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
        )}
      </button>

      {/* Threshold popover */}
      {showPopover && (
        <div className="absolute right-0 top-full mt-2 z-30 w-56 p-3 rounded-xl bg-gray-800 border border-gray-600/50 shadow-xl shadow-black/40">
          <p className="text-xs text-gray-400 mb-2">
            Notify me when at least:
          </p>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="range"
              min={1}
              max={30}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 accent-cyan-400 h-1.5"
            />
            <span className="text-sm font-bold text-white tabular-nums w-8 text-right">
              {threshold}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            {threshold} player{threshold !== 1 ? 's' : ''} online in this zone
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPopover(false)}
              className="flex-1 text-xs py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 text-xs py-1.5 rounded-lg ${colors.button} font-medium transition-colors`}
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
