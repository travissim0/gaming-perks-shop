const returnKey = 'freeinf:tournament-return';

export function safeAuthReturn(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2048 ||
    /[\\\u0000-\u0020]/.test(value) ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/';
  try {
    const url = new URL(value, 'https://freeinf.invalid');
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== 'https://freeinf.invalid' ||
      !/^\/(?:dueling-tournament|admin\/dueling-tournament)(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(path)
    )
      return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function currentAuthReturn(): string {
  if (typeof window === 'undefined') return '/';
  // Every supported login, email callback and profile step carries next explicitly.
  return safeAuthReturn(new URL(window.location.href).searchParams.get('next'));
}

export function rememberAuthReturn(path = currentAuthReturn()) {
  const safe = safeAuthReturn(path);
  try {
    sessionStorage.removeItem(returnKey);
  } catch {
    /* Continue with the explicit return URL. */
  }
  return safe;
}

export function consumeAuthReturn(): string {
  const safe = currentAuthReturn();
  try {
    sessionStorage.removeItem(returnKey);
  } catch {
    /* Ignore disabled storage. */
  }
  return safe;
}

export function authLink(path: string, next: string): string {
  const safe = safeAuthReturn(next);
  return safe === '/' ? path : `${path}?next=${encodeURIComponent(safe)}`;
}
