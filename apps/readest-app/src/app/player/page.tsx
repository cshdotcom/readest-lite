'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { FaHeadphonesAlt, FaBookOpen, FaServer, FaCloudDownloadAlt, FaPlayCircle } from 'react-icons/fa';

function PlayerContent() {
  const _ = useTranslation();
  const searchParams = useSearchParams();
  const bookHash = searchParams?.get('id') ?? '';

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-base-100 p-6 max-w-2xl mx-auto'>
      <FaHeadphonesAlt className='mb-6 text-6xl text-base-content/30' />
      <h1 className='mb-3 text-2xl font-bold text-center'>
        {_('Audiobook Playback')}
      </h1>
      <p className='text-center text-base text-base-content/70 mb-6'>
        {_('Readest Lite supports audiobook playback via local MP3/M4A files or streaming from Audiobookshelf (ABS).')}
      </p>

      <div className='card bg-base-200 border-base-300 border rounded-lg p-5 w-full'>
        <h2 className='text-lg font-semibold mb-3 flex items-center gap-2'>
          <FaPlayCircle className='w-5 h-5 text-primary' />
          {_('How to play audiobooks in Lite')}
        </h2>

        <div className='space-y-4 text-sm'>
          <div>
            <h3 className='font-semibold mb-1 flex items-center gap-2'>
              <FaBookOpen className='w-4 h-4' />
              {_('Method 1: Upload local audio files')}
            </h3>
            <p className='opacity-70 mb-2'>
              {_('Upload .mp3 / .m4a / .m4b files to your library. The book will be detected as an audiobook and clicking it will start playback here.')}
            </p>
            <ul className='list-disc pl-5 opacity-60 text-xs space-y-1'>
              <li>{_('Single-file audiobook (.m4b or one .mp3): upload it directly.')}</li>
              <li>{_('Multi-file audiobook (.mp3 chapters): create a folder named like the book, upload all chapters.')}</li>
              <li>{_('Cover: optional cover.jpg in the same folder will be used as the cover.')}</li>
            </ul>
          </div>

          <div>
            <h3 className='font-semibold mb-1 flex items-center gap-2'>
              <FaServer className='w-4 h-4' />
              {_('Method 2: Stream from Audiobookshelf (ABS)')}
            </h3>
            <p className='opacity-70 mb-2'>
              {_('Configure an Audiobookshelf server in Settings → Integrations → Audiobookshelf, then browse and stream audiobooks directly.')}
            </p>
            <ul className='list-disc pl-5 opacity-60 text-xs space-y-1'>
              <li>{_('Server URL: e.g. http://192.168.1.100:13378')}</li>
              <li>{_('Username + password: your ABS account')}</li>
              <li>{_('After login, audiobooks will appear in the library with a headphone icon.')}</li>
            </ul>
          </div>

          <div>
            <h3 className='font-semibold mb-1 flex items-center gap-2'>
              <FaCloudDownloadAlt className='w-4 h-4' />
              {_('Method 3: Import an .epub with narration')}
            </h3>
            <p className='opacity-70 mb-2'>
              {_('Some EPUBs ship with embedded audio narration. Upload the .epub and Readest Lite will detect the embedded audio and offer playback.')}
            </p>
          </div>
        </div>
      </div>

      {bookHash && (
        <p className='mt-4 text-xs opacity-40'>
          {_('Book ID')}: {bookHash}
        </p>
      )}

      <button
        onClick={() => window.history.back()}
        className='btn btn-primary mt-6'
      >
        {_('Go Back')}
      </button>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center bg-base-100 p-4'>
          <span className='loading loading-spinner loading-lg' />
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  );
}
