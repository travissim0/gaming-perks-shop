import { Suspense } from 'react';
import { AdminEvent } from '@/components/dueling-tournament/AdminEvent';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminEvent id={id} />
    </Suspense>
  );
}
