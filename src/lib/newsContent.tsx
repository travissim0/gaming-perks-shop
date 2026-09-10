import React from 'react';

/**
 * Renders a news post body regardless of how it was stored: a TipTap /
 * ProseMirror document, the legacy EditorJS block format, or an HTML string.
 * Output is unstyled semantic HTML so the surrounding `.rules-prose` (or any
 * prose wrapper) controls typography.
 */

function inline(node: any, key: number): React.ReactNode {
  if (node.type === 'text') {
    let out: React.ReactNode = node.text;
    for (const mark of node.marks || []) {
      switch (mark.type) {
        case 'bold': out = <strong key={key}>{out}</strong>; break;
        case 'italic': out = <em key={key}>{out}</em>; break;
        case 'strike': out = <del key={key}>{out}</del>; break;
        case 'underline': out = <u key={key}>{out}</u>; break;
        case 'code': out = <code key={key}>{out}</code>; break;
        case 'link':
          out = (
            <a key={key} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer">
              {out}
            </a>
          );
          break;
        default: break;
      }
    }
    return out;
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  return null;
}

function block(node: any, key: number): React.ReactNode {
  const kids = (n: any) => n.content?.map((c: any, i: number) => block(c, i));
  const inl = (n: any) => n.content?.map((c: any, i: number) => inline(c, i));
  switch (node.type) {
    case 'paragraph': return <p key={key}>{inl(node)}</p>;
    case 'heading': {
      const level = Math.min(Math.max(node.attrs?.level || 2, 1), 6);
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      return <Tag key={key}>{inl(node)}</Tag>;
    }
    case 'bulletList': return <ul key={key}>{kids(node)}</ul>;
    case 'orderedList': return <ol key={key}>{kids(node)}</ol>;
    case 'listItem': return <li key={key}>{kids(node)}</li>;
    case 'blockquote': return <blockquote key={key}>{kids(node)}</blockquote>;
    case 'horizontalRule': return <hr key={key} />;
    case 'codeBlock': return <pre key={key}><code>{inl(node)}</code></pre>;
    case 'hardBreak': return <br key={key} />;
    case 'text': return inline(node, key);
    default: return node.content ? <div key={key}>{kids(node)}</div> : null;
  }
}

export function renderNewsContent(content: any): React.ReactNode {
  if (!content) return null;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      try { return renderNewsContent(JSON.parse(trimmed)); } catch { /* fall through */ }
    }
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }
  if (content.type === 'doc' && Array.isArray(content.content)) {
    return content.content.map((n: any, i: number) => block(n, i));
  }
  if (Array.isArray(content.blocks)) {
    return content.blocks.map((b: any, i: number) => {
      switch (b.type) {
        case 'paragraph': return <p key={i} dangerouslySetInnerHTML={{ __html: b.data?.text || '' }} />;
        case 'header': {
          const Tag = `h${Math.min(Math.max(b.data?.level || 2, 1), 6)}` as keyof React.JSX.IntrinsicElements;
          return <Tag key={i}>{b.data?.text}</Tag>;
        }
        case 'list': {
          const Tag = b.data?.style === 'ordered' ? 'ol' : 'ul';
          return <Tag key={i}>{(b.data?.items || []).map((it: string, j: number) => <li key={j}>{it}</li>)}</Tag>;
        }
        default: return null;
      }
    });
  }
  return null;
}

/** Plain-text version (first ~N chars) for previews and meta descriptions. */
export function newsPlainText(content: any, max = 240): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (!n) return;
    if (typeof n === 'string') { parts.push(n); return; }
    if (n.type === 'text' && n.text) parts.push(n.text);
    if (Array.isArray(n)) n.forEach(walk);
    else if (Array.isArray(n.content)) n.content.forEach(walk);
    else if (Array.isArray(n.blocks)) n.blocks.forEach((b: any) => parts.push(String(b?.data?.text || '')));
  };
  if (typeof content === 'string') {
    const t = content.trim();
    if (t.startsWith('{')) { try { walk(JSON.parse(t)); } catch { parts.push(t); } }
    else parts.push(t.replace(/<[^>]+>/g, ' '));
  } else walk(content);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
