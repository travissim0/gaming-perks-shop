'use client';

import Link from 'next/link';
import { ArrowLeft, Swords } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';

export function TournamentShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const { user } = useAuth();
  return (
    <div className="ctf-theme dt-shell">
      <Navbar user={user} />
      <main className="dt-container">
        <div className="dt-topline">
          <Link href={admin ? '/dueling-tournament' : '/dueling'}>
            <ArrowLeft size={14} />
            {admin ? 'Public tournament page' : 'Dueling hub'}
          </Link>
          <span>
            <Swords size={14} /> FREE INFANTRY / {admin ? 'EVENT CONTROL' : 'COMPETITIVE DUELING'}
          </span>
        </div>
        {children}
        <footer className="dt-footer">
          <span>Free Infantry · CTF Dueling</span>
          <span>All times Eastern (ET)</span>
        </footer>
      </main>
    </div>
  );
}

export function Message({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`dt-message ${error ? 'dt-message-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="dt-loading" role="status">
      <span className="dt-spinner" />
      Loading tournament…
    </div>
  );
}
