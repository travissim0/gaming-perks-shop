'use client';

import React from 'react';
import Link from 'next/link';

interface ZoneCardProps {
  title: string;
  icon: string;
  accentColor: 'blue' | 'orange' | 'green' | 'purple' | 'cyan' | 'red' | 'yellow';
  linkTo: string;
  linkText?: string;
  children: React.ReactNode;
}

const colorClasses = {
  blue: {
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/50',
    title: 'text-blue-400',
    button: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400',
  },
  orange: {
    border: 'border-orange-500/30',
    hoverBorder: 'hover:border-orange-500/50',
    title: 'text-orange-400',
    button: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400',
  },
  green: {
    border: 'border-green-500/30',
    hoverBorder: 'hover:border-green-500/50',
    title: 'text-green-400',
    button: 'bg-green-500/20 hover:bg-green-500/30 text-green-400',
  },
  purple: {
    border: 'border-purple-500/30',
    hoverBorder: 'hover:border-purple-500/50',
    title: 'text-purple-400',
    button: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
  },
  cyan: {
    border: 'border-cyan-500/30',
    hoverBorder: 'hover:border-cyan-500/50',
    title: 'text-cyan-400',
    button: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400',
  },
  red: {
    border: 'border-red-500/30',
    hoverBorder: 'hover:border-red-500/50',
    title: 'text-red-400',
    button: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
  },
  yellow: {
    border: 'border-yellow-500/30',
    hoverBorder: 'hover:border-yellow-500/50',
    title: 'text-yellow-400',
    button: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400',
  },
};

export default function ZoneCard({
  title,
  icon,
  accentColor,
  linkTo,
  linkText = 'View More',
  children,
}: ZoneCardProps) {
  const colors = colorClasses[accentColor];

  return (
    <div
      className={`bg-gray-800/50 rounded-xl border ${colors.border} ${colors.hoverBorder} transition-all duration-300 overflow-hidden`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <h3 className={`text-lg font-bold ${colors.title} flex items-center gap-2`}>
          <span className="text-2xl">{icon}</span>
          {title}
        </h3>
      </div>

      {/* Content */}
      <div className="p-4">
        {children}
      </div>

      {/* Footer Link */}
      <div className="p-4 pt-0">
        <Link
          href={linkTo}
          className={`block w-full text-center py-2 ${colors.button} rounded-lg transition-colors font-medium`}
        >
          {linkText}
        </Link>
      </div>
    </div>
  );
}
