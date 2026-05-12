import { Metadata } from 'next';
import ToolsPageClient from './ToolsPageClient';

export const metadata: Metadata = {
  title: 'Infantry Online Reimagined - Download & Features',
  description: 'Download the modernized Infantry Online client with dynamic zoom, improved UI, right-click commands, and developer tools built for the modern era.',
};

const GITHUB_REPO = 'travissim0/infantry-cfs-studio';

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  body: string;
  assets: { name: string; browser_download_url: string; size: number }[];
  html_url: string;
}

async function fetchReleases(): Promise<Release[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
      next: { revalidate: 300 },
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
  const releases = await fetchReleases();
  return <ToolsPageClient releases={releases} />;
}
