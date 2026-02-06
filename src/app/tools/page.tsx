import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ToolsPageClient from './ToolsPageClient';

export const metadata: Metadata = {
  title: 'Dev Tools - Free Infantry',
  description: 'Desktop tools and utilities for Infantry Online development, mapping, and asset creation.',
};

const GITHUB_REPO = 'travissim0/infantry-cfs-studio';

export interface LatestBuild {
  id: string;
  version: string;
  changelog: string | null;
  filename: string;
  file_size: number;
  file_path: string;
  download_url: string;
  uploaded_at: string;
}

async function fetchLatestBuild(): Promise<LatestBuild | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from('builds')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data as LatestBuild;
  } catch {
    return null;
  }
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  body: string;
  assets: ReleaseAsset[];
  html_url: string;
}

async function fetchReleases(): Promise<Release[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
      next: { revalidate: 300 }, // Cache for 5 minutes via ISR
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'freeinf-site',
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data
      .filter((r: any) => r.tag_name !== 'assets-v1')
      .map((r: any) => ({
        tag_name: r.tag_name,
        name: r.name,
        published_at: r.published_at,
        prerelease: r.prerelease,
        body: r.body || '',
        html_url: r.html_url,
        assets: (r.assets || []).map((a: any) => ({
          name: a.name,
          browser_download_url: a.browser_download_url,
          size: a.size,
        })),
      }));
  } catch {
    return [];
  }
}

export default async function ToolsPage() {
  const [releases, latestBuild] = await Promise.all([
    fetchReleases(),
    fetchLatestBuild(),
  ]);

  return <ToolsPageClient releases={releases} latestBuild={latestBuild} />;
}
