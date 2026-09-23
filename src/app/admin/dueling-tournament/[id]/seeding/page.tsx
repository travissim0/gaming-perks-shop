import { SeedingPage } from '@/components/dueling-tournament/SeedingPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SeedingPage locator={id} admin />;
}
