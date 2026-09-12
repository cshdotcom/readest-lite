'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function PlayerRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // v8.23: Audiobook feature removed — redirect back to library
    router.replace('/library');
  }, [router]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-base-100'>
      <span className='loading loading-spinner loading-lg' />
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center bg-base-100'>
          <span className='loading loading-spinner loading-lg' />
        </div>
      }
    >
      <PlayerRedirect />
    </Suspense>
  );
}
