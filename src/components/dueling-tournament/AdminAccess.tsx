'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { authLink, rememberAuthReturn } from '@/lib/auth-return';
import { accessResponseSchema } from '@/lib/dueling-tournament/wire';
import { requestJson } from './client';
import { Loading, Message } from './Shell';

export function AdminAccess({ children }: { children: (director: boolean) => React.ReactNode }) {
  const { user, loading } = useAuth();
  const [access, setAccess] = useState<{ director: boolean; referee: boolean } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const userId = user?.id;
  useEffect(() => {
    let active = true;
    setAccess(null);
    setError('');
    if (!loading && userId)
      void requestJson('/access', accessResponseSchema)
        .then((value) => {
          if (active) setAccess(value);
        })
        .catch((failure) => {
          if (active)
            setError(failure instanceof Error ? failure.message : 'Could not check access.');
        });
    return () => {
      active = false;
    };
  }, [userId, loading, retry]);
  if (loading) return <Loading />;
  if (!user)
    return (
      <Message>
        Sign in with your Freeinf account to manage tournaments.{' '}
        <Link
          className="dt-button"
          href={authLink('/auth/login', '/admin/dueling-tournament')}
          onClick={() => rememberAuthReturn('/admin/dueling-tournament')}
        >
          Sign in
        </Link>
      </Message>
    );
  if (error)
    return (
      <Message error>
        {error}{' '}
        <button
          className="dt-button dt-button-quiet"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry
        </button>
      </Message>
    );
  if (!access) return <Loading />;
  if (!access.director && !access.referee)
    return (
      <Message>
        Your Freeinf account has no tournament staff role. Ask the database owner to connect this
        account as a tournament director. A director can assign referees to individual events.
      </Message>
    );
  return <>{children(access.director)}</>;
}
