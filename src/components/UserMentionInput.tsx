'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/lib/supabase';
import UserAvatar from './UserAvatar';

interface User {
  id: string;
  in_game_alias: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface UserMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export interface UserMentionInputRef {
  focus: () => void;
}

const UserMentionInput = forwardRef<UserMentionInputRef, UserMentionInputProps>(({
  value,
  onChange,
  placeholder = "Type @ to mention a user...",
  rows = 4,
  className = "",
  disabled = false,
  required = false,
  id
}, ref) => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus()
  }));

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email, avatar_url')
        .not('in_game_alias', 'is', null)
        .order('in_game_alias');
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    onChange(newValue);
    
    // Check for @ mentions
    const beforeCursor = newValue.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const afterAt = beforeCursor.slice(atIndex + 1);
      const spaceAfterAt = afterAt.indexOf(' ');
      const newlineAfterAt = afterAt.indexOf('\n');
      
      // Check if we're still in a mention (no space or newline after @)
      if (spaceAfterAt === -1 && newlineAfterAt === -1) {
        const query = afterAt.toLowerCase();
        setMentionQuery(query);
        setMentionStart(atIndex);
        
        // Filter users based on query
        const filtered = users.filter(user => 
          user.in_game_alias?.toLowerCase().includes(query) ||
          user.email?.toLowerCase().includes(query)
        ).slice(0, 5); // Limit to 5 suggestions
        
        setFilteredUsers(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const insertMention = (user: User) => {
    if (mentionStart === -1) return;
    
    const beforeMention = value.slice(0, mentionStart);
    const afterMention = value.slice(mentionStart + mentionQuery.length + 1);
    const mentionText = `@${user.in_game_alias || user.email}`;
    
    const newValue = beforeMention + mentionText + ' ' + afterMention;
    onChange(newValue);
    
    setShowSuggestions(false);
    setMentionStart(-1);
    setMentionQuery('');
    
    // Focus back to textarea and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStart + mentionText.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredUsers.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          insertMention(filteredUsers[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  const getSuggestionPosition = () => {
    if (!textareaRef.current || mentionStart === -1) {
      return { top: 0, left: 0 };
    }
    
    const textarea = textareaRef.current;
    const style = getComputedStyle(textarea);
    const lineHeight = parseInt(style.lineHeight) || 20;
    
    // Create a hidden div to measure text
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.font = style.font;
    div.style.width = style.width;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.textContent = value.slice(0, mentionStart + 1);
    
    document.body.appendChild(div);
    const rect = div.getBoundingClientRect();
    document.body.removeChild(div);
    
    const textareaRect = textarea.getBoundingClientRect();
    
    return {
      top: rect.height + 5,
      left: 0
    };
  };

  const position = getSuggestionPosition();

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
        disabled={disabled}
        required={required}
      />
      
      {showSuggestions && filteredUsers.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"
          style={{
            top: position.top,
            left: position.left,
            minWidth: '250px'
          }}
        >
          {filteredUsers.map((user, index) => (
            <div
              key={user.id}
              onClick={() => insertMention(user)}
              className={`flex items-center space-x-3 p-3 cursor-pointer transition-colors ${
                index === selectedIndex 
                  ? 'bg-cyan-600/30 border-l-2 border-cyan-400' 
                  : 'hover:bg-gray-700'
              }`}
            >
              <UserAvatar user={user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-cyan-400 font-medium truncate">
                  {user.in_game_alias || user.email}
                </div>
                {user.in_game_alias && user.email && (
                  <div className="text-gray-500 text-xs truncate">
                    {user.email}
                  </div>
                )}
              </div>
              <div className="text-gray-500 text-xs">
                @
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

UserMentionInput.displayName = 'UserMentionInput';

export default UserMentionInput; 