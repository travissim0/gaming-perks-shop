import Image from 'next/image';

interface UserAvatarProps {
  user: {
    avatar_url?: string | null;
    in_game_alias?: string | null;
    email?: string | null;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
}

export default function UserAvatar({ user, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    '2xl': 'w-24 h-24 text-2xl',
    '3xl': 'w-32 h-32 text-3xl'
  };

  // Get pixel dimensions for the Image component based on size
  const sizePixels = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
    '2xl': 96,
    '3xl': 128
  };

  const getInitials = () => {
    const name = user.in_game_alias || 'Anonymous'; // Never use email for privacy
    if (name === 'Anonymous') return '?';
    
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const avatarClasses = `
    ${sizeClasses[size]} 
    rounded-lg 
    border-2 
    border-gray-600/50 
    flex 
    items-center 
    justify-center 
    font-bold 
    text-white 
    shadow-lg 
    ${className}
  `;

  const pixelSize = sizePixels[size];

  if (user.avatar_url) {
    return (
      <div className={avatarClasses}>
        <Image
          src={user.avatar_url}
          alt={user.in_game_alias || 'User avatar'}
          width={pixelSize}
          height={pixelSize}
          className="w-full h-full object-cover rounded-lg"
          quality={95}
          priority={size === '2xl' || size === '3xl'}
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLElement;
            target.style.display = 'none';
            if (target.nextSibling) {
              (target.nextSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        <div 
          className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center rounded-lg"
          style={{ display: 'none' }}
        >
          {getInitials()}
        </div>
      </div>
    );
  }

  return (
    <div className={`${avatarClasses} bg-gradient-to-br from-cyan-500 to-blue-600`}>
      {getInitials()}
    </div>
  );
} 