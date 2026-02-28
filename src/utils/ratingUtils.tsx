import React from 'react';

export const getRatingColor = (rating: number): string => {
  if (rating >= 5.5) return 'text-purple-400';
  if (rating >= 5.0) return 'text-green-400';
  if (rating >= 4.5) return 'text-lime-400';
  if (rating >= 4.0) return 'text-yellow-400';
  if (rating >= 3.5) return 'text-amber-400';
  if (rating >= 3.0) return 'text-orange-400';
  if (rating >= 2.5) return 'text-red-400';
  return 'text-red-500';
};

export const getRatingBgColor = (rating: number): string => {
  if (rating >= 5.5) return 'bg-purple-500/20 border-purple-500/50';
  if (rating >= 5.0) return 'bg-green-500/20 border-green-500/50';
  if (rating >= 4.5) return 'bg-lime-500/20 border-lime-500/50';
  if (rating >= 4.0) return 'bg-yellow-500/20 border-yellow-500/50';
  if (rating >= 3.5) return 'bg-amber-500/20 border-amber-500/50';
  if (rating >= 3.0) return 'bg-orange-500/20 border-orange-500/50';
  if (rating >= 2.5) return 'bg-red-500/20 border-red-500/50';
  return 'bg-red-600/20 border-red-600/50';
};

export const getStarDisplay = (rating: number): React.ReactNode => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 6 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center space-x-1">
      {[...Array(fullStars)].map((_, i) => (
        <span key={`full-${i}`} className="text-yellow-400">★</span>
      ))}
      {hasHalfStar && <span className="text-yellow-400">☆</span>}
      {[...Array(emptyStars)].map((_, i) => (
        <span key={`empty-${i}`} className="text-gray-600">☆</span>
      ))}
    </div>
  );
};
