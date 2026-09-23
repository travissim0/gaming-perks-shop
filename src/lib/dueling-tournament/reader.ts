import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { TournamentError } from './contracts';

type ReaderConfiguration = {
  secret: string | undefined;
  vercel: boolean;
  localTest: boolean;
  supabaseUrl: string | undefined;
};

function normalizeAddress(value: string): string | null {
  const version = isIP(value);
  if (version === 4) return value;
  if (version === 6) {
    // Canonicalize IPv6 and group its /64 so rotating interface addresses cannot
    // create fresh quotas. IPv4-mapped IPv6 also gets a stable representation.
    const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    const [left, right = ''] = canonical.split('::');
    const a = left ? left.split(':') : [];
    const b = right ? right.split(':') : [];
    const words = [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b].map((word) =>
      word.padStart(4, '0'),
    );
    if (words.slice(0, 5).every((word) => word === '0000') && words[5] === 'ffff')
      return [words[6].slice(0, 2), words[6].slice(2), words[7].slice(0, 2), words[7].slice(2)]
        .map((byte) => parseInt(byte, 16))
        .join('.');
    return `${words.slice(0, 4).join(':')}::/64`;
  }
  return null;
}

export function readerIdentity(request: Request, config: ReaderConfiguration): string {
  if (!config.secret || config.secret.length < 32)
    throw new TournamentError(
      'unavailable',
      'Tournament request admission is not configured.',
      503,
    );
  let address: string | null = null;
  if (config.vercel) {
    // Trust this header only when running on Vercel, which supplies the value.
    // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
    address = normalizeAddress(request.headers.get('x-vercel-forwarded-for') ?? '');
  } else if (config.localTest) {
    const loopback = (url: string) =>
      ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
    if (loopback(request.url) && config.supabaseUrl && loopback(config.supabaseUrl))
      address = 'loopback-test';
  }
  if (!address)
    throw new TournamentError(
      'unavailable',
      'Tournament request admission is unavailable on this host.',
      503,
    );
  // Cookies and bearer contents never select a quota. Raw addresses are neither
  // stored nor logged. This dedicated secret is unrelated to database credentials.
  return createHmac('sha256', config.secret).update(`tournament-network:${address}`).digest('hex');
}
