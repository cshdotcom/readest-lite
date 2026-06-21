'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';

interface RemoteDownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function RemoteDownloadDialog({ open, onClose }: RemoteDownloadDialogProps) {
  const _ = useTranslation();
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = useCallback(async () => {
    if (!url.trim() || !user) return;
    setSubmitting(true);
    setError('');

    const token = await getAccessToken();
    if (!token) { setError('Not authenticated'); setSubmitting(false); return; }

    try {
      const resp = await fetch(`${getAPIBaseUrl()}/download-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), filename: filename.trim() || undefined }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${resp.status})`);
      }

      eventDispatcher.dispatch('toast', {
        message: _('Download task created — check User Center → Download Tasks'),
        type: 'success',
        timeout: 4000,
      });
      eventDispatcher.dispatch('refresh-library');

      setUrl('');
      setFilename('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed'));
    } finally {
      setSubmitting(false);
    }
  }, [url, filename, user, _, onClose]);

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-base-100 rounded-lg shadow-xl p-6 w-full max-w-md mx-4'>
        <h2 className='text-lg font-bold mb-4'>{_('Download Book from URL')}</h2>
        <p className='text-base-content/60 text-sm mb-4'>
          {_('Enter a direct URL. The download runs in the background — track progress in User Center → Download Tasks.')}
        </p>
        <div className='space-y-3'>
          <div>
            <label className='text-sm font-medium mb-1 block'>{_('URL')}</label>
            <input
              type='url'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder='https://example.com/book.epub'
              className='input input-bordered w-full'
              disabled={submitting}
              autoFocus
            />
          </div>
          <div>
            <label className='text-sm font-medium mb-1 block'>{_('Filename (optional)')}</label>
            <input
              type='text'
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder='book.epub'
              className='input input-bordered w-full'
              disabled={submitting}
            />
          </div>
          {error && <div className='text-sm text-red-500'>{error}</div>}
        </div>
        <div className='flex gap-2 mt-6'>
          <button onClick={handleDownload} disabled={submitting || !url.trim()} className='btn btn-primary flex-1'>
            {submitting ? <span className='loading loading-spinner loading-sm' /> : _('Download')}
          </button>
          <button onClick={onClose} className='btn btn-ghost'>{_('Cancel')}</button>
        </div>
      </div>
    </div>
  );
}
