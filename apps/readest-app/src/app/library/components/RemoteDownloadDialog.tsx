'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { downloadBookFromUrl } from '@/services/remoteDownload';
import { eventDispatcher } from '@/utils/event';
import { useTransferStore } from '@/store/transferStore';
import { useBooksSync } from '@/app/library/hooks/useBooksSync';

interface RemoteDownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function RemoteDownloadDialog({ open, onClose }: RemoteDownloadDialogProps) {
  const _ = useTranslation();
  const { user } = useAuth();
  const { pullLibrary } = useBooksSync();
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = useCallback(async () => {
    if (!url.trim() || !user) return;
    setSubmitting(true);
    setError('');
    const targetUrl = url.trim();
    const targetFilename = filename.trim() || undefined;

    // v8.6: 加入 transferStore 任务队列 — 有进度、重试、状态显示
    const transferId = useTransferStore.getState().addTransfer(
      'remote-download',
      targetFilename || targetUrl.slice(-40),
      'download',
      5,
      false,
    );

    // 关闭弹窗
    onClose();
    setUrl('');
    setFilename('');
    setSubmitting(false);

    // 打开传输队列面板让用户看到进度
    useTransferStore.getState().setIsTransferQueueOpen(true);

    eventDispatcher.dispatch('toast', {
      message: _('Download queued — check transfer panel for progress'),
      type: 'info',
      timeout: 3000,
    });

    // 后台异步下载
    void (async () => {
      useTransferStore.getState().setTransferStatus(transferId, 'in_progress');
      try {
        const result = await downloadBookFromUrl(targetUrl, targetFilename);
        useTransferStore.getState().setTransferStatus(transferId, 'completed');
        useTransferStore.getState().updateTransferProgress(transferId, 100, result.fileSize, result.fileSize, 0);
        eventDispatcher.dispatch('toast', {
          message: _('Download completed: {{filename}}', { filename: result.filename }),
          type: 'success',
          timeout: 3000,
        });
        // 刷新书架
        await pullLibrary(true, true);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        useTransferStore.getState().setTransferStatus(transferId, 'failed', errMsg);
        eventDispatcher.dispatch('toast', {
          message: _('Download failed: {{error}}', { error: errMsg }),
          type: 'error',
          timeout: 6000,
        });
      }
    })();
  }, [url, filename, user, _, onClose, pullLibrary]);

  if (!open) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-base-100 rounded-lg shadow-xl p-6 w-full max-w-md mx-4'>
        <h2 className='text-lg font-bold mb-4'>{_('Download Book from URL')}</h2>
        <p className='text-base-content/60 text-sm mb-4'>
          {_('Enter a direct URL to an EPUB/PDF/MOBI file. The download will be added to the transfer queue with progress and retry support.')}
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
