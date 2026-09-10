'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { saveSysSettings } from '@/helpers/settings';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import { IoChevronBackOutline, IoCheckmarkCircle, IoCloseCircle, IoCloudUploadOutline } from 'react-icons/io5';

interface NotionFormProps {
  onBack: () => void;
}

export default function NotionForm({ onBack }: NotionFormProps) {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();

  // Notion 设置存储在 settings.notion = { accessToken, databaseId, autoSync }
  const existing = (settings as unknown as { notion?: { accessToken?: string; databaseId?: string; autoSync?: boolean } }).notion || {};
  const [accessToken, setAccessToken] = useState(existing.accessToken || '');
  const [databaseId, setDatabaseId] = useState(existing.databaseId || '');
  const [autoSync, setAutoSync] = useState(!!existing.autoSync);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSave = async () => {
    if (!accessToken.trim() || !databaseId.trim()) {
      eventDispatcher.dispatch('toast', { message: _('Notion token is required'), type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await saveSysSettings(envConfig, 'notion', {
        accessToken: accessToken.trim(),
        databaseId: databaseId.trim(),
        autoSync,
      });
      eventDispatcher.dispatch('toast', { message: _('Notion sync settings saved'), type: 'success' });
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Failed'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!accessToken.trim()) {
      eventDispatcher.dispatch('toast', { message: _('Notion token is required'), type: 'error' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getAccessToken();
      // 直接调 Notion API 测 token 是否有效（不需要 databaseId）
      const url = `${getAPIBaseUrl()}/notion/users/me?notionToken=${encodeURIComponent(accessToken.trim())}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.bot) {
          setTestResult('ok');
          eventDispatcher.dispatch('toast', { message: _('Notion connection OK'), type: 'success' });
        } else {
          setTestResult('fail');
          eventDispatcher.dispatch('toast', { message: _('Notion connection failed'), type: 'error' });
        }
      } else {
        setTestResult('fail');
        eventDispatcher.dispatch('toast', { message: _('Notion connection failed'), type: 'error' });
      }
    } catch (err) {
      setTestResult('fail');
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Notion connection failed'),
        type: 'error',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!accessToken.trim() || !databaseId.trim()) {
      eventDispatcher.dispatch('toast', { message: _('Notion token is required'), type: 'error' });
      return;
    }
    setSyncing(true);
    try {
      const token = await getAccessToken();
      // 同步全部书籍的笔记 — 用 Lite 自带的 BookNote 表
      // 简化版：列出当前用户所有 books，每个 book 在 Notion 里创建一个 page，
      // 把所有 notes 作为 block 追加
      const resp = await fetch(`${getAPIBaseUrl()}/notion/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notionToken: accessToken.trim(), databaseId: databaseId.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        eventDispatcher.dispatch('toast', {
          message: _('Notion sync succeeded') + ` (${data.pages || 0} ${_('pages')})`,
          type: 'success',
        });
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || _('Notion sync failed'), type: 'error' });
      }
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Notion sync failed'),
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className='space-y-4 p-2'>
      <div className='flex items-center gap-2'>
        <button onClick={onBack} className='btn btn-ghost btn-sm btn-square' title={_('Back')}>
          <IoChevronBackOutline className='w-5 h-5' />
        </button>
        <h2 className='text-lg font-bold'>{_('Notion Integration')}</h2>
      </div>

      <div className='bg-base-200 rounded p-4 space-y-3 text-sm'>
        <p className='text-base-content/70'>
          {_('Sync notes to Notion')}. {_('Configure Notion sync')}.
        </p>
        <ol className='list-decimal pl-5 space-y-1 text-xs opacity-70'>
          <li>
            <a
              href='https://www.notion.so/my-integrations'
              target='_blank'
              rel='noopener noreferrer'
              className='link link-hover'
            >
              https://www.notion.so/my-integrations
            </a>{' '}
            — {_('Create a new integration, copy the Internal Integration Secret')}
          </li>
          <li>{_('In Notion, create a database and share it with the integration (top-right ... → Add connections)')}</li>
          <li>{_('Copy the database ID from the database URL: notion.so/<workspace>/<database_id>?v=...')}</li>
        </ol>
      </div>

      <div className='space-y-3'>
        <div>
          <label className='text-sm font-medium mb-1 block'>{_('Notion Token')}</label>
          <input
            type='password'
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder='secret_xxx...'
            className='input input-bordered w-full'
            autoComplete='off'
          />
        </div>

        <div>
          <label className='text-sm font-medium mb-1 block'>{_('Notion Database ID')}</label>
          <input
            type='text'
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            placeholder='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
            className='input input-bordered w-full'
            autoComplete='off'
          />
        </div>

        <label className='label cursor-pointer justify-start gap-3'>
          <input
            type='checkbox'
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className='checkbox checkbox-sm'
          />
          <span className='label-text'>{_('Auto sync notes to Notion')}</span>
        </label>

        {testResult && (
          <div className={`text-sm flex items-center gap-2 ${testResult === 'ok' ? 'text-success' : 'text-error'}`}>
            {testResult === 'ok' ? <IoCheckmarkCircle className='w-4 h-4' /> : <IoCloseCircle className='w-4 h-4' />}
            {testResult === 'ok' ? _('Notion connection OK') : _('Notion connection failed')}
          </div>
        )}
      </div>

      <div className='flex gap-2 flex-wrap'>
        <button
          onClick={handleSave}
          disabled={saving || !accessToken.trim() || !databaseId.trim()}
          className='btn btn-primary btn-sm'
        >
          {saving ? <span className='loading loading-spinner loading-xs' /> : _('Save')}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !accessToken.trim()}
          className='btn btn-outline btn-sm'
        >
          {testing ? <span className='loading loading-spinner loading-xs' /> : _('Test Notion Connection')}
        </button>
        <button
          onClick={handleSyncNow}
          disabled={syncing || !accessToken.trim() || !databaseId.trim()}
          className='btn btn-ghost btn-sm gap-1'
        >
          {syncing ? <span className='loading loading-spinner loading-xs' /> : <IoCloudUploadOutline className='w-4 h-4' />}
          {_('Sync Now')}
        </button>
      </div>

      {existing.accessToken && (
        <p className='text-xs opacity-60'>
          {_('Last synced at')}: {_('configured')}
        </p>
      )}
    </div>
  );
}
