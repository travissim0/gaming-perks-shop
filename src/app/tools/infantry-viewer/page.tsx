'use client';

import Link from 'next/link';

export default function InfantryViewerPage() {
  return (
    <div className="w-full h-screen">
      <iframe
        src="/tools/infantry-viewer/index.html"
        className="w-full h-full border-0"
        title="Infantry Blob Viewer"
      />
    </div>
  );
} 