'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [inGameAlias, setInGameAlias] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [defaultAvatars, setDefaultAvatars] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userSquad, setUserSquad] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        try {
          // Fetch the user's profile
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            throw error;
          }

          if (data) {
            setInGameAlias(data.in_game_alias || '');
            setAvatarUrl(data.avatar_url || null);
          }
          
          // Get current email from user object
          setEmail(user.email || '');

          // Fetch user's squad information
          await loadUserSquad();

          // Fetch default avatars (skip if bucket doesn't exist yet)
          try {
            const { data: avatarData, error: avatarError } = await supabase
              .storage
              .from('avatars')
              .list('defaults');

            if (avatarError) {
              console.log('Avatars bucket not set up yet:', avatarError.message);
            } else if (avatarData) {
              const avatarUrls = avatarData.map(file => {
                return supabase.storage.from('avatars').getPublicUrl(`defaults/${file.name}`).data.publicUrl;
              });
              setDefaultAvatars(avatarUrls);
            }
          } catch (error) {
            console.log('Storage not configured yet');
          }
        } catch (error: any) {
          toast.error('Error loading profile: ' + error.message);
        } finally {
          setProfileLoading(false);
        }
      }
    };

    fetchProfile();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    setUpdateLoading(true);
    
    try {
      let newAvatarUrl = avatarUrl;
      
      // Get the user's access token for API calls
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again to update your profile');
        return;
      }
      
      // If there's a file to upload, upload it first
      if (avatarFile) {
        try {
          const fileExt = avatarFile.name.split('.').pop();
          const fileName = `${user.id}-${Date.now()}.${fileExt}`;
          const filePath = `user-uploads/${fileName}`;
          
          const { error: uploadError, data } = await supabase.storage
            .from('avatars')
            .upload(filePath, avatarFile, {
              upsert: true
            });
            
          if (uploadError) {
            throw uploadError;
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
            
          newAvatarUrl = publicUrl;
        } catch (uploadError: any) {
          if (uploadError.message?.includes('Bucket not found')) {
            toast.error('Avatar storage not set up yet. Please contact support.');
            return;
          } else {
            throw uploadError;
          }
        }
      }
      
      // Update the profile
      const { error } = await supabase
        .from('profiles')
        .update({
          in_game_alias: inGameAlias,
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
        
      if (error) {
        throw error;
      }
      
      // Update email if changed
      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        
        if (emailError) {
          throw emailError;
        }
        
        toast.success('Profile updated successfully! Please check your new email for a confirmation link.');
      } else {
        toast.success('Profile updated successfully!');
      }
      setAvatarFile(null);
      setUploadProgress(0);
    } catch (error: any) {
      toast.error('Error updating profile: ' + error.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const maxSize = 2 * 1024 * 1024; // 2MB
      
      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
        return;
      }
      
      if (file.size > maxSize) {
        toast.error('File is too large. Maximum size is 2MB.');
        return;
      }
      
      setAvatarFile(file);
      
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectDefaultAvatar = (url: string) => {
    setAvatarUrl(url);
    setAvatarFile(null);
  };

  const loadUserSquad = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id,
            name,
            tag,
            description
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user squad:', error);
        return;
      }

      if (data?.squads) {
        setUserSquad(data.squads);
      }
    } catch (error) {
      console.error('Error loading user squad:', error);
    }
  };

  // Show loading spinner only while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  // If not loading and no user, redirect will happen via useEffect
  // But we shouldn't render anything while redirect is happening
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-cyan-400 font-mono">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">👤 Account Details</h1>
          </div>

          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
          
            {profileLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-24 w-24 bg-gray-700 rounded-full mx-auto"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                <div className="text-center">
                  <div className="relative inline-block">
                    <div className="h-32 w-32 rounded-full overflow-hidden mx-auto bg-gray-700 border-4 border-cyan-500 shadow-lg shadow-cyan-500/25">
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt="Avatar" 
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-3xl text-cyan-400 font-bold">
                          {inGameAlias ? inGameAlias.charAt(0).toUpperCase() : 'S'}
                        </div>
                      )}
                    </div>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 rounded-full">
                        <div className="text-cyan-400 font-bold text-lg">{uploadProgress}%</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6">
                    <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      📸 UPLOAD PROFILE IMAGE
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className="inline-block bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 px-6 py-3 rounded-lg cursor-pointer text-white font-medium tracking-wide border border-gray-500 hover:border-cyan-500 transition-all duration-300"
                    >
                      CHOOSE FILE
                    </label>
                    {avatarFile && (
                      <p className="mt-3 text-sm text-cyan-300 font-mono">
                        📁 {avatarFile.name}
                      </p>
                    )}
                  </div>
                </div>
                
                {defaultAvatars.length > 0 && (
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label className="block text-lg font-bold text-cyan-400 mb-4 tracking-wide">
                      🎖️ SELECT DEFAULT AVATAR
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {defaultAvatars.map((url, index) => (
                        <div 
                          key={index}
                          onClick={() => selectDefaultAvatar(url)}
                          className={`cursor-pointer rounded-lg overflow-hidden border-4 h-20 w-20 transition-all duration-300 ${
                            avatarUrl === url 
                              ? 'border-cyan-400 shadow-lg shadow-cyan-400/50' 
                              : 'border-gray-600 hover:border-cyan-500/50'
                          }`}
                        >
                          <img 
                            src={url} 
                            alt={`Default avatar ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="email" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      📧 E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-2 font-mono">
                      ⚠️ Email verification required for changes
                    </p>
                  </div>
                  
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="inGameAlias" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      🎮 Alias
                    </label>
                    <input
                      id="inGameAlias"
                      type="text"
                      value={inGameAlias}
                      onChange={(e) => setInGameAlias(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                      placeholder="Enter your combat alias..."
                    />
                  </div>
                </div>
                
                {/* Squad Information */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                    🏆 Squad
                  </label>
                  {userSquad ? (
                    <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold text-cyan-400">
                          [{userSquad.tag}] {userSquad.name}
                        </h3>
                        <Link
                          href="/squads"
                          className="bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded text-sm font-medium transition-colors duration-300"
                        >
                          Manage Squad
                        </Link>
                      </div>
                      {userSquad.description && (
                        <p className="text-gray-300 text-sm">{userSquad.description}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 text-center">
                      <p className="text-gray-400 mb-3">You are not currently in a squad</p>
                      <Link
                        href="/squads"
                        className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium transition-colors duration-300"
                      >
                        Join or Create Squad
                      </Link>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center pt-6">
                  <button
                    type="submit"
                    disabled={updateLoading}
                    className={`px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold text-lg tracking-wider border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-2xl hover:shadow-cyan-500/25 ${
                      updateLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {updateLoading ? '🔄 UPDATING...' : '🚀 UPDATE'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 