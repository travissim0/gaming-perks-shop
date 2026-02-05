'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import ImageExt from '@tiptap/extension-image';
import LinkExt from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import FontSize from '@/lib/tiptap-fontsize';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import {
  X, Save, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, Heading1, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, ImageIcon, Undo2, Redo2, Type, Link as LinkIcon,
  Eye, Edit3, Loader2, ChevronDown
} from 'lucide-react';

interface InlinePostEditorProps {
  post: {
    id: string;
    title: string;
    subtitle: string;
    content: any;
    tags: string[];
    featured_image_url: string;
    metadata: any;
  };
  onSave: () => void;
  onClose: () => void;
}

// ─── Font Config ────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Sans (Default)', value: '', css: '' },
  { label: 'Mono / Terminal', value: 'monospace', css: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace' },
  { label: 'Serif / Classic', value: 'serif', css: 'Georgia, Cambria, "Times New Roman", Times, serif' },
  { label: 'Orbitron / Display', value: 'Orbitron', css: '"Orbitron", sans-serif' },
];

const FONT_SIZES = [
  { label: 'Tiny', value: '12px' },
  { label: 'Small', value: '14px' },
  { label: 'Normal', value: '' },
  { label: 'Large', value: '20px' },
  { label: 'XL', value: '24px' },
  { label: '2XL', value: '30px' },
];

// ─── Font CSS mapping for preview ───────────────────────────────────────────

function getFontFamilyCSS(family: string): string {
  const f = FONT_FAMILIES.find(ff => ff.value === family);
  return f?.css || '';
}

// ─── ProseMirror Preview Rendering ──────────────────────────────────────────

function renderPreviewNode(node: any, key: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className="mb-4 text-gray-200 text-base sm:text-lg leading-relaxed">
          {node.content?.map((child: any, i: number) => renderPreviewInline(child, i))}
        </p>
      );
    case 'heading': {
      const level = node.attrs?.level || 2;
      const classes: Record<number, string> = {
        1: 'text-2xl sm:text-3xl font-bold text-cyan-300 mb-3',
        2: 'text-xl sm:text-2xl font-bold text-cyan-300/90 mb-2',
        3: 'text-lg sm:text-xl font-semibold text-cyan-300/80 mb-2',
        4: 'text-base sm:text-lg font-semibold text-cyan-300/70 mb-2',
      };
      const cls = classes[level] || classes[2];
      const content = node.content?.map((child: any, i: number) => renderPreviewInline(child, i));
      const Tag = `h${Math.min(level, 6)}` as keyof React.JSX.IntrinsicElements;
      return <Tag key={key} className={cls}>{content}</Tag>;
    }
    case 'bulletList':
      return (
        <ul key={key} className="mb-4 text-gray-200 ml-2 list-none space-y-1.5 text-base sm:text-lg leading-relaxed">
          {node.content?.map((item: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2.5">
              <span className="text-cyan-500/60 flex-shrink-0">&#x203A;</span>
              <span>{renderListItemContent(item)}</span>
            </li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mb-4 text-gray-200 ml-2 list-none space-y-1.5 text-base sm:text-lg leading-relaxed">
          {node.content?.map((item: any, i: number) => (
            <li key={i} className="flex items-baseline gap-2.5">
              <span className="text-cyan-500/60 flex-shrink-0 font-mono text-sm">{i + 1}.</span>
              <span>{renderListItemContent(item)}</span>
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-2 border-cyan-400/40 pl-4 mb-3 italic text-gray-300 text-base sm:text-lg leading-relaxed">
          {node.content?.map((child: any, i: number) => renderPreviewNode(child, i))}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="bg-gray-900/80 rounded-lg p-3 mb-3 overflow-x-auto text-sm text-green-400 font-mono">
          <code>{node.content?.map((c: any) => c.text).join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} className="border-gray-700/50 my-4" />;
    case 'image':
      return (
        <div key={key} className="my-4">
          <img src={node.attrs?.src} alt={node.attrs?.alt || ''} className="max-w-full rounded-lg border border-cyan-500/20" />
        </div>
      );
    case 'listItem':
      return node.content?.map((child: any, i: number) => renderPreviewNode(child, i));
    default:
      return null;
  }
}

function renderPreviewInline(node: any, key: number): React.ReactNode {
  if (node.type === 'text') {
    let result: React.ReactNode = node.text;
    if (node.marks && node.marks.length > 0) {
      result = node.marks.reduce((acc: React.ReactNode, mark: any, i: number) => {
        switch (mark.type) {
          case 'bold':
            return <strong key={`${key}-b-${i}`}>{acc}</strong>;
          case 'italic':
            return <em key={`${key}-i-${i}`}>{acc}</em>;
          case 'underline':
            return <u key={`${key}-u-${i}`}>{acc}</u>;
          case 'strike':
            return <del key={`${key}-s-${i}`}>{acc}</del>;
          case 'code':
            return <code key={`${key}-c-${i}`} className="bg-gray-700/60 px-1 rounded text-sm text-cyan-300">{acc}</code>;
          case 'link':
            return <a key={`${key}-l-${i}`} href={mark.attrs?.href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">{acc}</a>;
          case 'textStyle': {
            const style: React.CSSProperties = {};
            if (mark.attrs?.fontSize) style.fontSize = mark.attrs.fontSize;
            if (mark.attrs?.fontFamily) style.fontFamily = getFontFamilyCSS(mark.attrs.fontFamily) || mark.attrs.fontFamily;
            return <span key={`${key}-ts-${i}`} style={style}>{acc}</span>;
          }
          default:
            return acc;
        }
      }, node.text);
    }
    return result;
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  if (node.type === 'image') {
    return (
      <img key={key} src={node.attrs?.src} alt={node.attrs?.alt || ''} className="max-w-full rounded-lg border border-cyan-500/20 my-2 inline-block" />
    );
  }
  return null;
}

function renderListItemContent(item: any): React.ReactNode {
  if (!item.content) return null;
  return item.content.map((child: any, ci: number) => {
    if (child.type === 'paragraph') {
      return <React.Fragment key={ci}>{child.content?.map((inline: any, ii: number) => renderPreviewInline(inline, ii))}</React.Fragment>;
    }
    return renderPreviewNode(child, ci);
  });
}

function renderPreviewContent(content: any): React.ReactNode {
  if (!content) return <p className="text-gray-500 italic">Start typing to see preview...</p>;
  if (content.type === 'doc' && content.content) {
    return content.content.map((node: any, i: number) => renderPreviewNode(node, i));
  }
  return null;
}

// ─── Dropdown Component ─────────────────────────────────────────────────────

function ToolbarDropdown({ label, options, value, onChange, width = 'w-36' }: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(!open); }}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${open ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'} ${width}`}
        title={label}
      >
        <span className="truncate">{current?.label || label}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 min-w-[160px] py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${opt.value === value ? 'bg-cyan-600/20 text-cyan-300' : 'text-gray-300 hover:bg-gray-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function InlinePostEditor({ post, onSave, onClose }: InlinePostEditorProps) {
  const [title, setTitle] = useState(post.title);
  const [subtitle, setSubtitle] = useState(post.subtitle || '');
  const [tags, setTags] = useState(post.tags?.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview'>('split');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseContent = (content: any) => {
    if (!content) return '';
    if (typeof content === 'object') return content;
    if (typeof content === 'string') {
      try { return JSON.parse(content); } catch { return content; }
    }
    return content;
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your post content...' }),
    ],
    content: parseContent(post.content),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      setPreviewContent(json);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[300px] p-4 focus:outline-none text-white',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(files[i]);
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor) setPreviewContent(editor.getJSON());
  }, [editor]);

  const handleImageUpload = useCallback(async (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid image type. Use JPG, PNG, GIF, or WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `news-content/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      if (editor) editor.chain().focus().setImage({ src: data.publicUrl }).run();
      toast.success('Image inserted!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  }, [editor]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const content = editor?.getJSON();
      const { error } = await supabase
        .from('news_posts')
        .update({ title: title.trim(), subtitle: subtitle.trim(), content, tags: tags.split(',').map(t => t.trim()).filter(Boolean) })
        .eq('id', post.id);
      if (error) throw error;
      toast.success('Post updated!');
      onSave();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  const handleButtonClick = useCallback((e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  }, []);

  const addLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  // Get current font size/family from editor state
  const currentFontSize = editor?.getAttributes('textStyle')?.fontSize || '';
  const currentFontFamily = editor?.getAttributes('textStyle')?.fontFamily || '';

  if (!editor) return null;

  const ToolbarButton = ({ active, onClick, title, children }: { active?: boolean; onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/30 bg-gray-900/90">
        <div className="flex items-center gap-3">
          <Edit3 className="w-5 h-5 text-cyan-400" />
          <span className="text-sm font-mono text-cyan-400 uppercase tracking-wider">Editing Post</span>
          {uploading && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-700 overflow-hidden mr-2">
            <button onClick={() => setViewMode('editor')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'editor' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Edit3 className="w-3.5 h-3.5 inline mr-1" />Editor
            </button>
            <button onClick={() => setViewMode('split')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'split' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              Split
            </button>
            <button onClick={() => setViewMode('preview')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'preview' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}>
              <Eye className="w-3.5 h-3.5 inline mr-1" />Preview
            </button>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Title / Subtitle / Tags bar */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/60 space-y-2">
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-transparent text-xl font-bold text-white placeholder-gray-600 focus:outline-none border-b border-transparent focus:border-cyan-500/40 pb-1" placeholder="Post title..." />
        <div className="flex gap-4">
          <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)} className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none border-b border-transparent focus:border-cyan-500/30 pb-1" placeholder="Subtitle (optional)..." />
          <input type="text" value={tags} onChange={e => setTags(e.target.value)} className="w-64 bg-transparent text-sm text-cyan-300 placeholder-gray-600 focus:outline-none border-b border-transparent focus:border-cyan-500/30 pb-1 font-mono" placeholder="Tags: update, news..." />
        </div>
      </div>

      {/* Toolbar */}
      {viewMode !== 'preview' && (
        <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/40 flex flex-wrap items-center gap-0.5">
          {/* Font Family */}
          <div className="border-r border-gray-700 pr-2 mr-2">
            <ToolbarDropdown
              label="Font"
              width="w-40"
              options={FONT_FAMILIES.map(f => ({ label: f.label, value: f.value }))}
              value={currentFontFamily}
              onChange={(val) => {
                if (val) {
                  editor.chain().focus().setFontFamily(val).run();
                } else {
                  editor.chain().focus().unsetFontFamily().run();
                }
              }}
            />
          </div>
          {/* Font Size */}
          <div className="border-r border-gray-700 pr-2 mr-2">
            <ToolbarDropdown
              label="Size"
              width="w-24"
              options={FONT_SIZES}
              value={currentFontSize}
              onChange={(val) => {
                if (val) {
                  editor.chain().focus().setFontSize(val).run();
                } else {
                  editor.chain().focus().unsetFontSize().run();
                }
              }}
            />
          </div>
          {/* Text formatting */}
          <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
            <ToolbarButton active={editor.isActive('bold')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBold().run())} title="Bold (Ctrl+B)">
              <Bold className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('italic')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleItalic().run())} title="Italic (Ctrl+I)">
              <Italic className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('underline')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleUnderline().run())} title="Underline (Ctrl+U)">
              <UnderlineIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('strike')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleStrike().run())} title="Strikethrough">
              <Strikethrough className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('code')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleCode().run())} title="Inline Code">
              <Code className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* Headings */}
          <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
            <ToolbarButton active={editor.isActive('heading', { level: 1 })} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleHeading({ level: 1 }).run())} title="Heading 1">
              <Heading1 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleHeading({ level: 2 }).run())} title="Heading 2">
              <Heading2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleHeading({ level: 3 }).run())} title="Heading 3">
              <Heading3 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('paragraph')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setParagraph().run())} title="Paragraph">
              <Type className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* Lists */}
          <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
            <ToolbarButton active={editor.isActive('bulletList')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBulletList().run())} title="Bullet List">
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('orderedList')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleOrderedList().run())} title="Numbered List">
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* Block */}
          <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
            <ToolbarButton active={editor.isActive('blockquote')} onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBlockquote().run())} title="Blockquote">
              <Quote className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setHorizontalRule().run())} title="Horizontal Rule">
              <Minus className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton active={editor.isActive('link')} onClick={(e) => { e.preventDefault(); addLink(); }} title="Insert Link">
              <LinkIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* Media */}
          <div className="flex items-center gap-0.5 border-r border-gray-700 pr-2 mr-2">
            <ToolbarButton onClick={(e) => { e.preventDefault(); fileInputRef.current?.click(); }} title="Insert Image (or paste from clipboard)">
              <ImageIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
          {/* History */}
          <div className="flex items-center gap-0.5">
            <ToolbarButton onClick={(e) => handleButtonClick(e, () => editor.chain().focus().undo().run())} title="Undo">
              <Undo2 className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={(e) => handleButtonClick(e, () => editor.chain().focus().redo().run())} title="Redo">
              <Redo2 className="w-4 h-4" />
            </ToolbarButton>
          </div>
          <span className="ml-auto text-[10px] text-gray-600 font-mono">Paste images directly into editor</span>
        </div>
      )}

      {/* Editor + Preview */}
      <div className="flex-1 flex overflow-hidden">
        {viewMode !== 'preview' && (
          <div className={`${viewMode === 'split' ? 'w-1/2 border-r border-gray-800' : 'w-full'} overflow-y-auto bg-gray-900/50`}>
            <div className="tiptap-editor-inline">
              <EditorContent editor={editor} />
            </div>
          </div>
        )}
        {viewMode !== 'editor' && (
          <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} overflow-y-auto bg-gray-950/80`}>
            <div className="p-2">
              <div className="text-[10px] font-mono text-cyan-500/40 uppercase tracking-widest mb-3 px-4">Live Preview</div>
              <div className="relative rounded-lg border border-cyan-500/30 bg-gray-950/90 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none z-10 opacity-[0.03]"
                  style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.4) 2px, rgba(34,211,238,0.4) 3px)' }}
                />
                <div className="relative z-20 p-6">
                  {tags && (
                    <div className="flex gap-2 mb-4 flex-wrap">
                      {tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="px-2.5 py-0.5 bg-cyan-400/10 border border-cyan-400/40 text-[11px] text-cyan-300 font-mono font-bold uppercase tracking-[0.15em]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <h3 className="text-2xl md:text-3xl font-black mb-2 leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-cyan-200">
                    {title || 'Untitled Post'}
                  </h3>
                  {subtitle && <p className="text-cyan-100/50 text-base mb-5 font-medium italic">{subtitle}</p>}
                  <div className="relative rounded border border-cyan-500/15 overflow-hidden bg-gray-950/80">
                    <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-cyan-500/[0.02] to-transparent pointer-events-none" />
                    <div className="relative px-8 py-6">
                      <div className="max-w-none text-base leading-relaxed">
                        {renderPreviewContent(previewContent)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
              </div>
            </div>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleFileSelect} className="hidden" />
    </div>
  );
}
