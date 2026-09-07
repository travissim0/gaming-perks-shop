'use client';

import { useEffect, useState } from 'react';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { toDoc } from '@/lib/rules';

/**
 * Renders a TipTap document (as produced by RichTextEditor) to HTML.
 * generateHTML needs a DOM, so it runs after mount — SSR renders nothing,
 * which avoids a server-side crash and any hydration mismatch.
 */
export default function RulesBody({ body, className = '' }: { body: unknown; className?: string }) {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    try {
      const doc = toDoc(body) as any;
      setHtml(generateHTML(doc, [StarterKit, Underline]));
    } catch (err) {
      console.error('Failed to render rules body:', err);
      setHtml('');
    }
  }, [body]);

  return <div className={`rules-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
