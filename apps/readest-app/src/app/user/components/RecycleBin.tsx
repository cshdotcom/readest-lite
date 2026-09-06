'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';
import {
  IoTrashBinOutline,
  IoRefresh,
  IoTrashOutline,
  IoArrowUndoOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

interface RecycleBinItem {
  id: string;
  bookHash: string;
  bookTitle: string;
  bookFormat: string;
  fileKey: string | null;
  deletedAt: string;
  expiresAt: string;
}

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return iso;
  }
};

const daysUntil = (iso: string): number => {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

export default function RecycleBin() {
  const _ = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [expireDays, setExpireDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [showAllModal, setShowAllModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const resp = await fetch(`${getAPIBaseUrl()}/recycle-bin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.items || []);
        if (typeof data.expireDays === 'number') setExpireDays(data.expireDays);
      }
    } catch (err) {
      console.error('Failed to fetch recycle bin items:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/recycle-bin/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      });
      const data = await resp.json();
      if (resp.ok) {
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Restored {{count}} item(s)', { count: data.restoredCount || 0 }),
        });
        void fetchItems();
      } else {
        eventDispatcher.dispatch('toast', { type: 'error', message: data.error || _('Failed') });
      }
    } catch (err) {
      console.error('Restore failed:', err);
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Restore failed') });
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(_('Permanently delete {{count}} item(s)? This cannot be undone.', { count: ids.length }))) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/recycle-bin/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      });
      const data = await resp.json();
      if (resp.ok) {
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Permanently deleted {{count}} item(s)', { count: data.deletedCount || 0 }),
        });
        void fetchItems();
      } else {
        eventDispatcher.dispatch('toast', { type: 'error', message: data.error || _('Failed') });
      }
    } catch (err) {
      console.error('Clear failed:', err);
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Clear failed') });
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!confirm(_('Permanently delete ALL items in recycle bin? This cannot be undone.'))) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/recycle-bin/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ all: true }),
      });
      const data = await resp.json();
      if (resp.ok) {
        eventDispatcher.dispatch('toast', {
          type: 'success',
          message: _('Permanently deleted {{count}} item(s)', { count: data.deletedCount || 0 }),
        });
        void fetchItems();
      } else {
        eventDispatcher.dispatch('toast', { type: 'error', message: data.error || _('Failed') });
      }
    } catch (err) {
      console.error('Clear all failed:', err);
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Clear all failed') });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className='card bg-base-100 border-base-200 shadow-sm border rounded-lg p-4'>
        <div className='flex items-center gap-2 mb-3'>
          <IoTrashBinOutline className='w-5 h-5' />
          <h3 className='text-lg font-bold'>{_('Recycle Bin')}</h3>
        </div>
        <div className='text-center py-4'>
          <span className='loading loading-spinner loading-md' />
        </div>
      </div>
    );
  }

  return (
    <div className='card bg-base-100 border-base-200 shadow-sm border rounded-lg p-4'>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='text-lg font-bold flex items-center gap-2'>
          <IoTrashBinOutline className='w-5 h-5' />
          {_('Recycle Bin')}
          {items.length > 0 && (
            <span className='badge badge-sm badge-ghost'>{items.length}</span>
          )}
        </h3>
        <div className='flex items-center gap-1'>
          <button
            onClick={() => void fetchItems()}
            disabled={busy}
            className='btn btn-ghost btn-sm btn-square'
            title={_('Refresh')}
          >
            <IoRefresh className='w-4 h-4' />
          </button>
          {items.length > 0 && (
            <button
              onClick={() => void handleClearAll()}
              disabled={busy}
              className='btn btn-ghost btn-sm text-error'
            >
              <IoTrashOutline className='w-4 h-4' />
              {_('Clear All')}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className='text-center py-6 text-base-content/50'>
          <p>{_('Recycle bin is empty')}</p>
          <p className='text-xs mt-1'>
            {_('Deleted books will be moved here and kept for {{days}} days.', { days: expireDays })}
          </p>
        </div>
      ) : (
        <>
          <div className='space-y-2'>
            {(showAllModal ? items : items.slice(0, 3)).map((it) => {
              const days = daysUntil(it.expiresAt);
              return (
                <div
                  key={it.id}
                  className='flex items-start gap-2 p-2 rounded-lg bg-base-200/50 hover:bg-base-200 transition'
                >
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium text-sm truncate'>
                      {it.bookTitle || it.bookHash.slice(0, 12)}
                      {it.bookFormat && (
                        <span className='ml-2 badge badge-xs badge-ghost uppercase'>{it.bookFormat}</span>
                      )}
                    </div>
                    <div className='text-xs text-base-content/50'>
                      {_('Deleted')}: {formatDate(it.deletedAt)}
                      <span className='mx-1'>·</span>
                      {days > 0
                        ? _('Auto-delete in {{days}} days', { days })
                        : _('Expiring soon')}
                    </div>
                  </div>
                  <div className='flex items-center gap-1 flex-shrink-0'>
                    <button
                      onClick={() => void handleRestore([it.id])}
                      disabled={busy}
                      className='btn btn-ghost btn-xs'
                      title={_('Restore')}
                    >
                      <IoArrowUndoOutline className='w-3.5 h-3.5' />
                      {_('Restore')}
                    </button>
                    <button
                      onClick={() => void handleClear([it.id])}
                      disabled={busy}
                      className='btn btn-ghost btn-xs text-error'
                      title={_('Delete permanently')}
                    >
                      <IoTrashOutline className='w-3.5 h-3.5' />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!showAllModal && items.length > 3 && (
            <button
              onClick={() => setShowAllModal(true)}
              className='btn btn-ghost btn-sm w-full mt-2 text-base-content/60 hover:text-base-content'
            >
              {_('View All')} ({items.length})
              <IoChevronForwardOutline className='w-3 h-3' />
            </button>
          )}
        </>
      )}

      {showAllModal && (
        <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60'>
          <div className='bg-base-100 rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col'>
            <div className='flex items-center justify-between p-4 border-b border-base-200'>
              <h2 className='text-lg font-bold'>
                {_('Recycle Bin')} ({items.length})
              </h2>
              <button onClick={() => setShowAllModal(false)} className='btn btn-ghost btn-sm btn-square' title={_('Close')}>
                <IoRefresh className='w-5 h-5 rotate-45' />
              </button>
            </div>
            <div className='flex-1 overflow-y-auto p-3 space-y-2'>
              {items.map((it) => {
                const days = daysUntil(it.expiresAt);
                return (
                  <div
                    key={it.id}
                    className='flex items-start gap-2 p-2 rounded-lg bg-base-200/50'
                  >
                    <div className='flex-1 min-w-0'>
                      <div className='font-medium text-sm truncate'>
                        {it.bookTitle || it.bookHash.slice(0, 12)}
                        {it.bookFormat && (
                          <span className='ml-2 badge badge-xs badge-ghost uppercase'>{it.bookFormat}</span>
                        )}
                      </div>
                      <div className='text-xs text-base-content/50'>
                        {_('Deleted')}: {formatDate(it.deletedAt)}
                        <span className='mx-1'>·</span>
                        {days > 0
                          ? _('Auto-delete in {{days}} days', { days })
                          : _('Expiring soon')}
                      </div>
                    </div>
                    <div className='flex items-center gap-1 flex-shrink-0'>
                      <button
                        onClick={() => void handleRestore([it.id])}
                        disabled={busy}
                        className='btn btn-ghost btn-xs'
                        title={_('Restore')}
                      >
                        <IoArrowUndoOutline className='w-3.5 h-3.5' />
                        {_('Restore')}
                      </button>
                      <button
                        onClick={() => void handleClear([it.id])}
                        disabled={busy}
                        className='btn btn-ghost btn-xs text-error'
                        title={_('Delete permanently')}
                      >
                        <IoTrashOutline className='w-3.5 h-3.5' />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
