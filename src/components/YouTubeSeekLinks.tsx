'use client';

import { useEffect } from 'react';
import { installYouTubeSeekLinks } from '@/lib/youtubeSeekLinks';

// Mounted once in the root layout; see src/lib/youtubeSeekLinks.ts.
export function YouTubeSeekLinks() {
  useEffect(() => installYouTubeSeekLinks(), []);
  return null;
}
