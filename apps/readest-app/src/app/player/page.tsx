'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { FaHeadphonesAlt } from 'react-icons/fa';

export default function PlayerPage() {
  const _ = useTranslation();
  const searchParams = useSearchParams();
  const bookHash = searchParams?.get('id') ?? '';

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-base-100 p-4'>
      <FaHeadphonesAlt className='mb-4 text-6xl text-base-content/30' />
      <h1 className='mb-2 text-xl font-bold'>
        {_('Audiobook Playback')}
      </h1>
      <p className='max-w-md text-center text-sm text-base-content/60'>
        {_('Audiobook playback is not available in Readest Lite. Audiobookshelf (ABS) integration requires a configured ABS server, which is not included in the self-hosted Lite edition.')}
      </p>
      <p className='mt-2 text-xs text-base-content/40'>
        {_('Book ID')}: {bookHash || _('Unknown')}
      </p>
      <button
        onClick={() => window.history.back()}
        className='btn btn-ghost mt-6'
      >
        {_('Go Back')}
      </button>
    </div>
  );
}
