'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useCallback, useEffect, useState } from 'react';

interface RichTextEditorProps {
  content: string | object;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

const RichTextEditor = ({ content, onChange, placeholder = 'Start writing...', className = '' }: RichTextEditorProps) => {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const parseContent = (content: string | object) => {
    try {
      // Handle empty content
      if (!content || (typeof content === 'string' && content.trim() === '')) {
        return '';
      }
      
      // If it's already an object, return it directly
      if (typeof content === 'object') {
        return content;
      }
      
      // If it's a string, try to parse as JSON
      if (typeof content === 'string') {
        try {
          return JSON.parse(content);
        } catch {
          // If not JSON, treat as plain text
          return content;
        }
      }
      
      return content;
    } catch (error) {
      console.error('Error parsing content:', error);
      return '';
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
    ],
    content: parseContent(content),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(JSON.stringify(json));
    },
  });

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== undefined) {
      try {
        const parsedContent = parseContent(content);
        
        // Only update if content actually changed to avoid cursor jumping
        const currentContent = JSON.stringify(editor.getJSON());
        const newContent = JSON.stringify(parsedContent);
        
        if (currentContent !== newContent) {
          editor.commands.setContent(parsedContent);
        }
      } catch (error) {
        console.error('Error setting content:', error);
      }
    }
  }, [content, editor]);

  const handleButtonClick = useCallback((e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  }, []);

  if (!editor) {
    return null;
  }

  const shortcuts = [
    { keys: ['Ctrl', 'B'], action: 'Bold' },
    { keys: ['Ctrl', 'I'], action: 'Italic' },
    { keys: ['Ctrl', 'U'], action: 'Underline' },
    { keys: ['Ctrl', 'Shift', 'S'], action: 'Strikethrough' },
    { keys: ['Ctrl', 'E'], action: 'Inline Code' },
    { keys: ['Ctrl', 'Alt', '1'], action: 'Heading 1' },
    { keys: ['Ctrl', 'Alt', '2'], action: 'Heading 2' },
    { keys: ['Ctrl', 'Alt', '3'], action: 'Heading 3' },
    { keys: ['Ctrl', 'Shift', '8'], action: 'Bullet List' },
    { keys: ['Ctrl', 'Shift', '7'], action: 'Numbered List' },
    { keys: ['Ctrl', 'Shift', 'B'], action: 'Blockquote' },
    { keys: ['Ctrl', 'Alt', 'C'], action: 'Code Block' },
    { keys: ['Ctrl', 'Z'], action: 'Undo' },
    { keys: ['Ctrl', 'Y'], action: 'Redo' },
  ];

  return (
    <div className={`border border-gray-600 rounded-lg overflow-hidden bg-gray-700 ${className}`}>
      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-600 p-2 flex flex-wrap items-center gap-1">
        {/* Text Formatting */}
        <div className="flex items-center gap-1 border-r border-gray-600 pr-2 mr-2">
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBold().run())}
            className={`p-2 rounded text-sm font-bold transition-colors ${
              editor.isActive('bold') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Bold (Ctrl+B)"
          >
            B
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleItalic().run())}
            className={`p-2 rounded text-sm italic transition-colors ${
              editor.isActive('italic') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Italic (Ctrl+I)"
          >
            I
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleUnderline().run())}
            className={`p-2 rounded text-sm underline transition-colors ${
              editor.isActive('underline') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Underline (Ctrl+U)"
          >
            U
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleStrike().run())}
            className={`p-2 rounded text-sm line-through transition-colors ${
              editor.isActive('strike') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Strikethrough (Ctrl+Shift+S)"
          >
            S
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleCode().run())}
            className={`px-2 py-1 rounded text-sm font-mono transition-colors ${
              editor.isActive('code') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Inline Code (Ctrl+E)"
          >
            {'<>'}
          </button>
        </div>

        {/* Headings */}
        <div className="flex items-center gap-1 border-r border-gray-600 pr-2 mr-2">
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => {
              // Check if there's a selection
              const { from, to } = editor.state.selection;
              if (from === to) {
                // No selection - convert current block
                editor.chain().focus().setHeading({ level: 1 }).run();
              } else {
                // Has selection - only affect selected text by wrapping in heading
                editor.chain().focus().toggleHeading({ level: 1 }).run();
              }
            })}
            className={`px-2 py-1 rounded text-sm font-bold transition-colors ${
              editor.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Heading 1 (Ctrl+Alt+1)"
          >
            H1
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => {
              const { from, to } = editor.state.selection;
              if (from === to) {
                editor.chain().focus().setHeading({ level: 2 }).run();
              } else {
                editor.chain().focus().toggleHeading({ level: 2 }).run();
              }
            })}
            className={`px-2 py-1 rounded text-sm font-bold transition-colors ${
              editor.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Heading 2 (Ctrl+Alt+2)"
          >
            H2
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => {
              const { from, to } = editor.state.selection;
              if (from === to) {
                editor.chain().focus().setHeading({ level: 3 }).run();
              } else {
                editor.chain().focus().toggleHeading({ level: 3 }).run();
              }
            })}
            className={`px-2 py-1 rounded text-sm font-bold transition-colors ${
              editor.isActive('heading', { level: 3 }) ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Heading 3 (Ctrl+Alt+3)"
          >
            H3
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => {
              const { from, to } = editor.state.selection;
              if (from === to) {
                editor.chain().focus().setParagraph().run();
              } else {
                // For paragraph, we want to clear any heading formatting
                editor.chain().focus().clearNodes().run();
              }
            })}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              editor.isActive('paragraph') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Paragraph"
          >
            P
          </button>
        </div>

        {/* Lists */}
        <div className="flex items-center gap-1 border-r border-gray-600 pr-2 mr-2">
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBulletList().run())}
            className={`p-2 rounded text-sm transition-colors ${
              editor.isActive('bulletList') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Bullet List (Ctrl+Shift+8)"
          >
            •
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleOrderedList().run())}
            className={`p-2 rounded text-sm transition-colors ${
              editor.isActive('orderedList') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Numbered List (Ctrl+Shift+7)"
          >
            1.
          </button>
        </div>

        {/* Other Formatting */}
        <div className="flex items-center gap-1 border-r border-gray-600 pr-2 mr-2">
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleBlockquote().run())}
            className={`p-2 rounded text-sm transition-colors ${
              editor.isActive('blockquote') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Blockquote (Ctrl+Shift+B)"
          >
            "
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().toggleCodeBlock().run())}
            className={`px-2 py-1 rounded text-sm font-mono transition-colors ${
              editor.isActive('codeBlock') ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
            }`}
            title="Code Block (Ctrl+Alt+C)"
          >
            {'</>'}
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().setHorizontalRule().run())}
            className="p-2 rounded text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            title="Horizontal Rule"
          >
            ―
          </button>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-1 border-r border-gray-600 pr-2 mr-2">
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().undo().run())}
            disabled={!editor.can().undo()}
            className="p-2 rounded text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={(e) => handleButtonClick(e, () => editor.chain().focus().redo().run())}
            disabled={!editor.can().redo()}
            className="p-2 rounded text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
        </div>

        {/* Shortcuts Help */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowShortcuts(!showShortcuts);
            }}
            className="p-2 rounded text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            title="Keyboard Shortcuts"
          >
            ⌨️
          </button>
          
          {showShortcuts && (
            <div className="absolute top-full right-0 mt-2 bg-gray-900 border border-gray-600 rounded-lg shadow-xl z-50 w-64">
              <div className="p-3">
                <h3 className="text-sm font-bold text-white mb-2">Keyboard Shortcuts</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex justify-between items-center text-xs">
                      <span className="text-gray-300">{shortcut.action}</span>
                      <div className="flex gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="bg-gray-700 px-1 py-0.5 rounded text-gray-200 font-mono">
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowShortcuts(false);
                  }}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Content */}
      <div className="bg-gray-700 text-white min-h-[200px] max-h-[500px] overflow-y-auto relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && (
          <div className="absolute top-4 left-4 text-gray-500 pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
};

export default RichTextEditor; 