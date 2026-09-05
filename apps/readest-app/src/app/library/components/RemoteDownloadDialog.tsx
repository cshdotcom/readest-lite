'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';
import { IoCloudDownloadOutline, IoCodeWorkingOutline, IoAddOutline, IoRemoveOutline } from 'react-icons/io5';

interface RemoteDownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

// v8.10.1: 批量下载 per-URL 解析
// 支持语法:
//   https://example.com/book.epub
//   https://site-a.com/book.epub | cookie:sessionid=abc123
//   https://site-b.com/book.epub | cookie:PHPSESSID=def | header:Referer: https://site-b.com
//   # 开头的行是注释，跳过
// 没有指令的行使用全局 Cookies/Headers（Advanced Options 里设的）
interface ParsedBatchItem {
  url: string;
  cookies?: string;
  headers?: Record<string, string>;
}

const parseBatchLine = (line: string): ParsedBatchItem | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // 按 " | " 分割（空格-管道-空格）
  const segments = trimmed.split(/\s*\|\s*/);
  const url = segments[0]?.trim();
  if (!url) return null;

  // 简单校验 URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  const item: ParsedBatchItem = { url };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]?.trim();
    if (!seg) continue;

    const lowerSeg = seg.toLowerCase();
    if (lowerSeg.startsWith('cookie:')) {
      const val = seg.slice(7).trim();
      if (val) item.cookies = val;
    } else if (lowerSeg.startsWith('header:')) {
      const headerStr = seg.slice(7).trim();
      // header 格式: KEY: VALUE（第一个冒号分隔 key 和 value）
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > 0) {
        const key = headerStr.slice(0, colonIdx).trim();
        const value = headerStr.slice(colonIdx + 1).trim();
        if (key && value) {
          if (!item.headers) item.headers = {};
          item.headers[key] = value;
        }
      }
    }
    // 不认识的指令静默忽略
  }

  return item;
};

const parseBatchText = (text: string): ParsedBatchItem[] => {
  return text
    .split('\n')
    .map(parseBatchLine)
    .filter((item): item is ParsedBatchItem => item !== null);
};

type Tab = 'single' | 'batch';

interface HeaderEntry {
  key: string;
  value: string;
}

export default function RemoteDownloadDialog({ open, onClose }: RemoteDownloadDialogProps) {
  const _ = useTranslation();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('single');
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [batchText, setBatchText] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cookies, setCookies] = useState('');
  const [headers, setHeaders] = useState<HeaderEntry[]>([{ key: '', value: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetState = () => {
    setUrl('');
    setFilename('');
    setBatchText('');
    setCookies('');
    setHeaders([{ key: '', value: '' }]);
    setShowAdvanced(false);
    setError('');
  };

  const buildHeadersObject = useCallback((): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const h of headers) {
      const k = h.key.trim();
      const v = h.value.trim();
      if (k && v) result[k] = v;
    }
    return result;
  }, [headers]);

  const addHeaderRow = () => {
    setHeaders((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeHeaderRow = (idx: number) => {
    setHeaders((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const updateHeader = (idx: number, field: 'key' | 'value', val: string) => {
    setHeaders((prev) => prev.map((h, i) => i === idx ? { ...h, [field]: val } : h));
  };

  const handleSingleDownload = useCallback(async () => {
    if (!url.trim() || !user) return;
    setSubmitting(true);
    setError('');

    const token = await getAccessToken();
    if (!token) { setError('Not authenticated'); setSubmitting(false); return; }

    try {
      const resp = await fetch(`${getAPIBaseUrl()}/download-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          url: url.trim(),
          filename: filename.trim() || undefined,
          cookies: cookies.trim() || undefined,
          headers: Object.keys(buildHeadersObject()).length > 0 ? buildHeadersObject() : undefined,
        }),
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

      resetState();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed'));
    } finally {
      setSubmitting(false);
    }
  }, [url, filename, cookies, headers, user, _, onClose, buildHeadersObject]);

  const handleBatchDownload = useCallback(async () => {
    if (!user) return;
    // v8.10.1: 解析每行 URL 的 per-URL cookie:/header: 指令
    // 格式: URL | cookie:VALUE | header:Key: VALUE
    // v8.18.3: 移除「Advanced Options」全局 Cookies/Headers — 每个 URL 独立携带
    // 自己的指令，无指令的行就是纯 URL。
    const parsedItems = parseBatchText(batchText);
    if (parsedItems.length === 0) return;

    setSubmitting(true);
    setError('');

    const token = await getAccessToken();
    if (!token) { setError('Not authenticated'); setSubmitting(false); return; }

    // 每行 URL 自带指令，不需要全局合并
    const items = parsedItems.map((item) => ({
      url: item.url,
      cookies: item.cookies,
      headers: item.headers,
    }));

    try {
      const resp = await fetch(`${getAPIBaseUrl()}/download-tasks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'create',
          items,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${resp.status})`);
      }

      const data = await resp.json();
      eventDispatcher.dispatch('toast', {
        message: _(`{{count}} download tasks created`, { count: data.count || 0 }),
        type: 'success',
        timeout: 4000,
      });
      eventDispatcher.dispatch('refresh-library');

      resetState();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : _('Failed'));
    } finally {
      setSubmitting(false);
    }
  }, [batchText, cookies, headers, user, _, onClose, buildHeadersObject]);

  const handleClose = () => {
    if (!submitting) {
      resetState();
      onClose();
    }
  };

  if (!open) return null;

  const advancedSection = (
    <div className='mt-2 border-t border-base-200 pt-3'>
      <button
        type='button'
        onClick={() => setShowAdvanced((v) => !v)}
        className='flex items-center gap-2 text-sm font-medium text-base-content/70 hover:text-base-content'
      >
        <IoCodeWorkingOutline className='w-4 h-4' />
        {showAdvanced ? _('Hide Advanced') : _('Advanced Options')}
      </button>
      {showAdvanced && (
        <div className='mt-3 space-y-3'>
          <div>
            <label className='text-sm font-medium mb-1 block'>
              {_('Cookies')} <span className='text-base-content/40'>({_('for authenticated sites')})</span>
            </label>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder={'key1=val1; key2=val2'}
              className='textarea textarea-bordered w-full text-sm font-mono'
              rows={2}
              disabled={submitting}
            />
            <p className='text-xs text-base-content/40 mt-1'>
              {_('Format: key1=val1; key2=val2 (same as browser Cookie header)')}
            </p>
          </div>
          <div>
            <label className='text-sm font-medium mb-1 block'>
              {_('Custom Headers')} <span className='text-base-content/40'>({_('like curl -H')})</span>
            </label>
            <div className='space-y-2'>
              {headers.map((h, idx) => (
                <div key={idx} className='flex gap-2'>
                  <input
                    type='text'
                    value={h.key}
                    onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                    placeholder={'Header-Name'}
                    className='input input-bordered flex-1 text-sm font-mono'
                    disabled={submitting}
                  />
                  <input
                    type='text'
                    value={h.value}
                    onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                    placeholder={'Header-Value'}
                    className='input input-bordered flex-[2] text-sm font-mono'
                    disabled={submitting}
                  />
                  <button
                    type='button'
                    onClick={() => removeHeaderRow(idx)}
                    className='btn btn-ghost btn-square btn-sm'
                    disabled={submitting || headers.length === 1}
                    title={_('Remove')}
                  >
                    <IoRemoveOutline className='w-4 h-4' />
                  </button>
                </div>
              ))}
              <button
                type='button'
                onClick={addHeaderRow}
                className='btn btn-ghost btn-xs'
                disabled={submitting}
              >
                <IoAddOutline className='w-3 h-3' /> {_('Add Header')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-base-100 rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto'>
        <h2 className='text-lg font-bold mb-4 flex items-center gap-2'>
          <IoCloudDownloadOutline className='w-5 h-5' />
          {_('Download Book from URL')}
        </h2>

        {/* Tabs */}
        <div className='flex gap-1 mb-4 bg-base-200 p-1 rounded-lg w-fit'>
          <button
            onClick={() => setTab('single')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'single' ? 'bg-base-100 shadow-sm font-medium' : 'text-base-content/60'}`}
          >
            {_('Single')}
          </button>
          <button
            onClick={() => setTab('batch')}
            className={`px-4 py-1.5 text-sm rounded-md transition ${tab === 'batch' ? 'bg-base-100 shadow-sm font-medium' : 'text-base-content/60'}`}
          >
            {_('Batch')}
          </button>
        </div>

        {tab === 'single' ? (
          <div className='space-y-3'>
            <p className='text-base-content/60 text-sm'>
              {_('Enter a direct URL. The download runs in the background — track progress in User Center → Download Tasks.')}
            </p>
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
              <label className='text-sm font-medium mb-1 block'>
                {_('Filename (optional)')} <span className='text-base-content/40'>({_('auto-detected if blank')})</span>
              </label>
              <input
                type='text'
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={_('auto-detect from URL / Content-Disposition')}
                className='input input-bordered w-full'
                disabled={submitting}
              />
              <p className='text-xs text-base-content/40 mt-1'>
                {_('Supports base64 / URL-encoded Chinese / Content-Disposition auto-detection. Query strings stripped.')}
              </p>
            </div>
            {advancedSection}
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-base-content/60 text-sm'>
              {_('Paste one URL per line. Up to 20 URLs per batch. Each becomes a separate task.')}
            </p>
            <div>
              <label className='text-sm font-medium mb-1 block'>{_('URLs (one per line)')}</label>
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                placeholder={'# ' + _('Lines starting with # are comments') + '\nhttps://example.com/book1.epub\nhttps://site-a.com/book2.epub | cookie:sessionid=abc123\nhttps://site-b.com/book3.epub | cookie:PHPSESSID=def | header:Referer: https://site-b.com'}
                className='textarea textarea-bordered w-full text-sm font-mono'
                rows={8}
                disabled={submitting}
                autoFocus
              />
              <p className='text-xs text-base-content/40 mt-1'>
                {_('Count')}: {parseBatchText(batchText).length} / 20
              </p>
              <p className='text-xs text-base-content/50 mt-1'>
                {_('Per-URL syntax:')} <code className='text-[10px] bg-base-200 px-1 rounded'>URL | cookie:VALUE | header:Key: VALUE</code>
              </p>
              <p className='text-xs text-base-content/40 mt-0.5'>
                {_('Each URL line carries its own cookie / header directives — no global Advanced Options needed.')}
              </p>
            </div>
          </div>
        )}

        {error && <div className='text-sm text-red-500 mt-3'>{error}</div>}

        <div className='flex gap-2 mt-6'>
          <button
            onClick={tab === 'single' ? handleSingleDownload : handleBatchDownload}
            disabled={submitting || (tab === 'single' ? !url.trim() : parseBatchText(batchText).length === 0)}
            className='btn btn-primary flex-1'
          >
            {submitting ? <span className='loading loading-spinner loading-sm' /> : _('Download')}
          </button>
          <button onClick={handleClose} className='btn btn-ghost' disabled={submitting}>
            {_('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
