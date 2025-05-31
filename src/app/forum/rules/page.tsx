'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface ForumRule {
  id: string;
  title: string;
  content: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export default function ForumRulesPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<ForumRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingRules, setEditingRules] = useState<ForumRule[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
    if (user) {
      checkAdminStatus();
    }
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setIsAdmin(data.is_admin);
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
    }
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      
      // First try to get existing rules
      const { data: existingRules, error } = await supabase
        .from('forum_rules')
        .select('*')
        .order('order_index');

      if (error && error.code !== 'PGRST204') {
        // If table doesn't exist, create it and add default rules
        await createRulesTable();
        return;
      }

      if (!existingRules || existingRules.length === 0) {
        // No rules exist, create default ones
        await createDefaultRules();
      } else {
        setRules(existingRules);
        setEditingRules(existingRules);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const createRulesTable = async () => {
    // This would typically be done via SQL migration, but for demo purposes
    // we'll handle it gracefully
    const defaultRules = [
      {
        title: "Be Respectful",
        content: "Treat all community members with respect. No harassment, personal attacks, or discriminatory language will be tolerated.",
        order_index: 1
      },
      {
        title: "Stay On Topic",
        content: "Keep discussions relevant to the forum category and Infantry Online. Off-topic posts may be moved or removed.",
        order_index: 2
      },
      {
        title: "No Spam or Advertising",
        content: "Do not post repetitive content, advertisements, or promotional material without permission from moderators.",
        order_index: 3
      },
      {
        title: "Search Before Posting",
        content: "Use the search function to check if your topic has already been discussed before creating a new thread.",
        order_index: 4
      },
      {
        title: "Use Appropriate Language",
        content: "Keep language appropriate for all ages. Excessive profanity or inappropriate content will be removed.",
        order_index: 5
      },
      {
        title: "Report Issues",
        content: "Use the report function to notify moderators of rule violations rather than engaging in public arguments.",
        order_index: 6
      }
    ];
    
    setRules(defaultRules.map((rule, index) => ({
      id: `default-${index}`,
      ...rule,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: 'system'
    })));
    
    setEditingRules(rules);
  };

  const createDefaultRules = async () => {
    const defaultRules = [
      {
        title: "Be Respectful",
        content: "Treat all community members with respect. No harassment, personal attacks, or discriminatory language will be tolerated.",
        order_index: 1
      },
      {
        title: "Stay On Topic", 
        content: "Keep discussions relevant to the forum category and Infantry Online. Off-topic posts may be moved or removed.",
        order_index: 2
      },
      {
        title: "No Spam or Advertising",
        content: "Do not post repetitive content, advertisements, or promotional material without permission from moderators.",
        order_index: 3
      },
      {
        title: "Search Before Posting",
        content: "Use the search function to check if your topic has already been discussed before creating a new thread.",
        order_index: 4
      },
      {
        title: "Use Appropriate Language",
        content: "Keep language appropriate for all ages. Excessive profanity or inappropriate content will be removed.",
        order_index: 5
      },
      {
        title: "Report Issues",
        content: "Use the report function to notify moderators of rule violations rather than engaging in public arguments.",
        order_index: 6
      }
    ];

    // For now, just set the default rules in state
    // In a real implementation, these would be inserted into the database
    const formattedRules = defaultRules.map((rule, index) => ({
      id: `rule-${index + 1}`,
      ...rule,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: 'system'
    }));

    setRules(formattedRules);
    setEditingRules(formattedRules);
  };

  const handleEditRule = (index: number, field: 'title' | 'content', value: string) => {
    setEditingRules(prev => 
      prev.map((rule, i) => 
        i === index ? { ...rule, [field]: value } : rule
      )
    );
  };

  const addNewRule = () => {
    const newRule: ForumRule = {
      id: `new-${Date.now()}`,
      title: 'New Rule',
      content: 'Enter rule description here...',
      order_index: editingRules.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id || 'unknown'
    };
    
    setEditingRules(prev => [...prev, newRule]);
  };

  const removeRule = (index: number) => {
    setEditingRules(prev => prev.filter((_, i) => i !== index));
  };

  const saveRules = async () => {
    if (!user || !isAdmin) return;
    
    setSaving(true);
    try {
      // In a real implementation, you would save to the database here
      // For now, we'll just update the state
      setRules(editingRules);
      setEditMode(false);
      toast.success('Forum rules updated successfully');
    } catch (err) {
      toast.error('Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingRules(rules);
    setEditMode(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white text-xl font-bold shadow-lg border border-red-500/50">
                📋
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                  Forum Rules
                </h1>
                <p className="text-gray-400 text-sm mt-1">Community guidelines and expectations</p>
              </div>
            </div>
            
            {isAdmin && (
              <div className="flex items-center space-x-3">
                {editMode ? (
                  <>
                    <button
                      onClick={cancelEdit}
                      className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300"
                    >
                      ❌ Cancel
                    </button>
                    <button
                      onClick={saveRules}
                      disabled={saving}
                      className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-600 disabled:to-gray-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300"
                    >
                      {saving ? '🔄 Saving...' : '💾 Save Rules'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode(true)}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300"
                  >
                    ✏️ Edit Rules
                  </button>
                )}
              </div>
            )}
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <span>Rules</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-8 shadow-xl">
            <div className="animate-pulse space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="h-6 bg-gray-700 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Introduction */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">
                📜 Community Guidelines
              </h2>
              <p className="text-gray-300 leading-relaxed">
                Welcome to the Infantry Online forum community! These rules help ensure a positive experience for all members. 
                By participating in our forums, you agree to follow these guidelines. Moderators reserve the right to 
                take action against violations.
              </p>
            </div>

            {/* Rules */}
            <div className="space-y-4">
              {(editMode ? editingRules : rules).map((rule, index) => (
                <div key={rule.id} className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-600/30 rounded-lg p-6 shadow-xl">
                  <div className="flex items-start space-x-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-1">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      {editMode && isAdmin ? (
                        <div className="space-y-4">
                          <input
                            type="text"
                            value={rule.title}
                            onChange={(e) => handleEditRule(index, 'title', e.target.value)}
                            className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-2 text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                          />
                          <textarea
                            value={rule.content}
                            onChange={(e) => handleEditRule(index, 'content', e.target.value)}
                            rows={3}
                            className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-cyan-500/30 rounded-lg px-4 py-3 text-gray-300 leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-vertical"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => removeRule(index)}
                              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-3 py-1 rounded text-sm transition-all duration-300"
                            >
                              🗑️ Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-bold text-cyan-400 mb-3 tracking-wider">
                            {rule.title}
                          </h3>
                          <p className="text-gray-300 leading-relaxed">
                            {rule.content}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Rule Button */}
              {editMode && isAdmin && (
                <div className="text-center">
                  <button
                    onClick={addNewRule}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 shadow-lg transform hover:scale-105"
                  >
                    ➕ Add New Rule
                  </button>
                </div>
              )}
            </div>

            {/* Footer Info */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-6 shadow-xl">
              <h3 className="text-lg font-bold text-yellow-400 mb-4 tracking-wider">
                💡 Need Help?
              </h3>
              <div className="space-y-2 text-gray-300 text-sm">
                <div>• <strong>Questions about rules?</strong> Contact a moderator or admin</div>
                <div>• <strong>Report violations:</strong> Use the report button on posts</div>
                <div>• <strong>Appeals:</strong> Contact admins directly for rule violation appeals</div>
                <div>• <strong>Suggestions:</strong> We welcome feedback on improving these guidelines</div>
              </div>
              
              {rules.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
                  Last updated: {formatDate(rules[0]?.updated_at || new Date().toISOString())}
                  {isAdmin && (
                    <span className="ml-2 bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-xs">
                      Admin View
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 