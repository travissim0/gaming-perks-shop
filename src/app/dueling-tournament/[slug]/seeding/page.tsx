import { SeedingPage } from '@/components/dueling-tournament/SeedingPage';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SeedingPage locator={slug} />;
}
