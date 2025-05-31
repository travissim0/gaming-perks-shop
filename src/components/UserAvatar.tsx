import Image from 'next/image';

interface UserAvatarProps {
  user: {
    avatar_url?: string | null;
    in_game_alias?: string | null;
    email?: string | null;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function UserAvatar({ user, size = 'md', className = '' }: UserAvatarProps) {
  const sizeClasses = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg'
  };

  const getInitials = () => {
    const name = user.in_game_alias || user.email || 'Anonymous';
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

  if (user.avatar_url) {
    return (
      <div className={avatarClasses}>
        <Image
          src={user.avatar_url}
          alt={user.in_game_alias || 'User avatar'}
          width={64}
          height={64}
          className="w-full h-full object-cover rounded-lg"
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