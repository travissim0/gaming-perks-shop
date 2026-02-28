// System user ID used for anonymous/official operations (historical squad imports, anonymous ratings, etc.)
export const SYSTEM_USER_ID = '7066f090-a1a1-4f5f-bf1a-374d0e06130c';

// SVG placeholder for video thumbnails when YouTube thumbnail fails to load
export const VIDEO_THUMBNAIL_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
    <rect width="480" height="360" fill="#1f2937"/>
    <g transform="translate(240,180)">
      <circle r="40" fill="none" stroke="#4b5563" stroke-width="3"/>
      <polygon points="-12,-20 -12,20 20,0" fill="#4b5563"/>
    </g>
    <text x="240" y="240" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="14">Video Thumbnail Unavailable</text>
  </svg>`
)}`;
