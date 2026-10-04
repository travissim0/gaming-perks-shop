'use client';

import React from 'react';

// Renders author-supplied HTML (news posts) and leaves it alone across parent re-renders.
// React 19 re-assigns innerHTML whenever the dangerouslySetInnerHTML object changes
// identity, even if the HTML is identical, so an inline `{ __html: content }` rebuilt the
// post's DOM on every parent render: CSS animations replayed and embedded players reloaded
// (the home page re-renders every 10s for online users, /league every 1s for its clock).
// Memoizing on the string avoids it.
export const HtmlContent = React.memo(function HtmlContent({
  html,
  className,
  as: Tag = 'div',
}: {
  html: string;
  className?: string;
  as?: 'div' | 'p';
}) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
