'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import UserAvatar from '@/components/UserAvatar';

interface PrivateMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  content: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    in_game_alias: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  recipient?: {
    id: string;
    in_game_alias: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

interface User {
  id: string;
  in_game_alias: string | null;
  email: string | null;
  avatar_url: string | null;
}

type ViewMode = 'inbox' | 'compose' | 'conversation';

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<PrivateMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [composeForm, setComposeForm] = useState({
    recipient_id: '',
    subject: '',
    content: ''
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (conversationMessages.length > 0) {
      scrollToBottom();
    }
  }, [conversationMessages]);

  useEffect(() => {
    if (user) {
      fetchMessages();
      fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = users.filter(u => 
        u.in_game_alias?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers([]);
    }
  }, [searchQuery, users]);

  const fetchMessages = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('private_messages')
        .select(`
          *,
          sender:profiles!private_messages_sender_id_fkey(id, in_game_alias, email, avatar_url),
          recipient:profiles!private_messages_recipient_id_fkey(id, in_game_alias, email, avatar_url)
        `)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, in_game_alias, email, avatar_url')
        .neq('id', user?.id)
        .order('in_game_alias');
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchConversation = async (otherUserId: string) => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('private_messages')
        .select(`
          *,
          sender:profiles!private_messages_sender_id_fkey(id, in_game_alias, email, avatar_url),
          recipient:profiles!private_messages_recipient_id_fkey(id, in_game_alias, email, avatar_url)
        `)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      setConversationMessages(data || []);
      
      // Mark messages as read
      const unreadMessages = data?.filter(msg => 
        msg.recipient_id === user.id && !msg.is_read
      ) || [];
      
      if (unreadMessages.length > 0) {
        await supabase
          .from('private_messages')
          .update({ is_read: true })
          .in('id', unreadMessages.map(msg => msg.id));
      }
      
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !composeForm.recipient_id || !composeForm.content.trim()) return;

    try {
      const { error } = await supabase
        .from('private_messages')
        .insert({
          sender_id: user.id,
          recipient_id: composeForm.recipient_id,
          subject: composeForm.subject.trim() || 'No Subject',
          content: composeForm.content.trim()
        });

      if (error) throw error;

      // Reset form
      setComposeForm({ recipient_id: '', subject: '', content: '' });
      setSearchQuery('');
      setFilteredUsers([]);
      
      // Refresh messages
      await fetchMessages();
      
      // Switch to inbox
      setViewMode('inbox');
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const replyToMessage = async (content: string) => {
    if (!user || !selectedConversation || !content.trim()) return;

    try {
      const { error } = await supabase
        .from('private_messages')
        .insert({
          sender_id: user.id,
          recipient_id: selectedConversation,
          subject: 'Re: Conversation',
          content: content.trim()
        });

      if (error) throw error;
      
      // Refresh conversation
      await fetchConversation(selectedConversation);
      
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  };

  const getConversations = () => {
    if (!user) return [];
    
    const conversationMap = new Map();
    
    messages.forEach(message => {
      const otherUserId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
      const otherUser = message.sender_id === user.id ? message.recipient : message.sender;
      
      if (!conversationMap.has(otherUserId) || 
          new Date(message.created_at) > new Date(conversationMap.get(otherUserId).lastMessage.created_at)) {
        conversationMap.set(otherUserId, {
          userId: otherUserId,
          user: otherUser,
          lastMessage: message,
          unreadCount: 0
        });
      }
    });
    
    // Count unread messages
    messages.forEach(message => {
      if (message.recipient_id === user.id && !message.is_read) {
        const conversation = conversationMap.get(message.sender_id);
        if (conversation) {
          conversation.unreadCount++;
        }
      }
    });
    
    return Array.from(conversationMap.values()).sort((a, b) => 
      new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-cyan-400 text-xl">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
        <Navbar user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
            <p className="text-gray-300">Please sign in to view your messages.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      <Navbar user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gray-700/50 px-6 py-4 border-b border-cyan-500/30">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-cyan-400 tracking-wider">✉️ Private Messages</h1>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setViewMode('inbox')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'inbox'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    📥 Inbox
                  </button>
                  <button
                    onClick={() => setViewMode('compose')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      viewMode === 'compose'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    ✏️ Compose
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {viewMode === 'inbox' && (
                <div>
                  {isLoading ? (
                    <div className="text-center py-12">
                      <div className="text-cyan-400 text-lg">Loading messages...</div>
                    </div>
                  ) : getConversations().length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📭</div>
                      <div className="text-gray-400 text-lg mb-2">No messages yet</div>
                      <div className="text-gray-500 text-sm">
                        Start a conversation by clicking the "Compose" button
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {getConversations().map((conversation) => (
                        <div
                          key={conversation.userId}
                          onClick={() => {
                            setSelectedConversation(conversation.userId);
                            setViewMode('conversation');
                            fetchConversation(conversation.userId);
                          }}
                          className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300 cursor-pointer"
                        >
                          <div className="flex items-center space-x-4">
                            <UserAvatar user={conversation.user || {}} size="md" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="font-bold text-cyan-400 truncate">
                                  {conversation.user?.in_game_alias || conversation.user?.email || 'Unknown User'}
                                </h3>
                                <div className="flex items-center space-x-2">
                                  {conversation.unreadCount > 0 && (
                                    <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                      {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                                    </span>
                                  )}
                                  <span className="text-gray-500 text-sm">
                                    {formatDate(conversation.lastMessage.created_at)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-gray-300 text-sm truncate">
                                {conversation.lastMessage.sender_id === user.id ? 'You: ' : ''}
                                {conversation.lastMessage.content}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'compose' && (
                <div className="max-w-2xl mx-auto">
                  <form onSubmit={sendMessage} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        To:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search for a player..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-300 focus:outline-none focus:border-cyan-500"
                        />
                        
                        {filteredUsers.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredUsers.map((user) => (
                              <div
                                key={user.id}
                                onClick={() => {
                                  setComposeForm(prev => ({ ...prev, recipient_id: user.id }));
                                  setSearchQuery(user.in_game_alias || user.email || '');
                                  setFilteredUsers([]);
                                }}
                                className="flex items-center space-x-3 p-3 hover:bg-gray-700 cursor-pointer"
                              >
                                <UserAvatar user={user} size="sm" />
                                <div>
                                  <div className="text-cyan-400 font-medium">
                                    {user.in_game_alias || user.email}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Subject:
                      </label>
                      <input
                        type="text"
                        value={composeForm.subject}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Message subject (optional)"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-300 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Message:
                      </label>
                      <textarea
                        value={composeForm.content}
                        onChange={(e) => setComposeForm(prev => ({ ...prev, content: e.target.value }))}
                        placeholder="Type your message here..."
                        rows={8}
                        required
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-300 focus:outline-none focus:border-cyan-500 resize-none"
                      />
                    </div>

                    <div className="flex space-x-4">
                      <button
                        type="submit"
                        disabled={!composeForm.recipient_id || !composeForm.content.trim()}
                        className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
                      >
                        Send Message
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setComposeForm({ recipient_id: '', subject: '', content: '' });
                          setSearchQuery('');
                          setFilteredUsers([]);
                        }}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {viewMode === 'conversation' && selectedConversation && (
                <ConversationView
                  messages={conversationMessages}
                  currentUserId={user.id}
                  otherUserId={selectedConversation}
                  onSendReply={replyToMessage}
                  onBack={() => setViewMode('inbox')}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversationView({ 
  messages, 
  currentUserId, 
  otherUserId, 
  onSendReply, 
  onBack 
}: {
  messages: PrivateMessage[];
  currentUserId: string;
  otherUserId: string;
  onSendReply: (content: string) => void;
  onBack: () => void;
}) {
  const [replyContent, setReplyContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyContent.trim()) {
      onSendReply(replyContent);
      setReplyContent('');
    }
  };

  const otherUser = messages.find(m => 
    m.sender_id === otherUserId || m.recipient_id === otherUserId
  )?.sender_id === otherUserId 
    ? messages.find(m => m.sender_id === otherUserId)?.sender
    : messages.find(m => m.recipient_id === otherUserId)?.recipient;

  return (
    <div className="flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center space-x-4 pb-4 border-b border-gray-700">
        <button
          onClick={onBack}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ← Back
        </button>
        <UserAvatar user={otherUser || {}} size="md" />
        <div>
          <h2 className="text-xl font-bold text-cyan-400">
            {otherUser?.in_game_alias || otherUser?.email || 'Unknown User'}
          </h2>
          <p className="text-gray-500 text-sm">{messages.length} messages</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.map((message) => {
          const isFromCurrentUser = message.sender_id === currentUserId;
          const sender = isFromCurrentUser ? message.sender : message.recipient;
          
          return (
            <div
              key={message.id}
              className={`flex ${isFromCurrentUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                isFromCurrentUser
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}>
                <div className="text-sm mb-1">
                  {message.content}
                </div>
                <div className={`text-xs ${
                  isFromCurrentUser ? 'text-cyan-200' : 'text-gray-500'
                }`}>
                  {new Date(message.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Form */}
      <form onSubmit={handleSendReply} className="pt-4 border-t border-gray-700">
        <div className="flex space-x-3">
          <input
            type="text"
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Type your reply..."
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-gray-300 focus:outline-none focus:border-cyan-500"
          />
          <button
            type="submit"
            disabled={!replyContent.trim()}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
} 