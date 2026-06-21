'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';
import { IoRefresh, IoTrashOutline, IoPlayCircle, IoPauseCircle, IoCloudDownloadOutline, IoAlertCircleOutline } from 'react-icons/io5';

interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  status: string;
  error: string | null;
  bookHash: string | null;
  fileSize: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'pending': return '⏳';
    case 'in_progress': return '🔄';
    case 'paused': return '⏸';
    case 'completed': return '✅';
    case 'failed': return '❌';
    default: return '❓';
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'text-success';
    case 'failed': return 'text-error';
    case 'in_progress': return 'text-info';
    case 'paused': return 'text-warning';
    default: return 'text-base-content/60';
  }
};

export default function DownloadTasks() {
  const _ = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const resp = await fetch(`${getAPIBaseUrl()}/download-tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to fetch download tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchTasks();
    // 有 pending/in_progress 任务时 5 秒轮询
    const interval = setInterval(() => {
      if (tasks.some((t) => t.status === 'pending' || t.status === 'in_progress')) {
        void fetchTasks();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks, tasks]);

  const doAction = async (taskId: string, action: string) => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await fetch(`${getAPIBaseUrl()}/download-tasks/${taskId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      void fetchTasks();
    } catch (err) {
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Action failed') });
    }
  };

  const deleteTask = async (taskId: string) => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      await fetch(`${getAPIBaseUrl()}/download-tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      void fetchTasks();
    } catch (err) {
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Delete failed') });
    }
  };

  const doBatch = async (action: string) => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const resp = await fetch(`${getAPIBaseUrl()}/download-tasks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const data = await resp.json();
      eventDispatcher.dispatch('toast', { type: 'success', message: _(`{{count}} task(s) affected`, { count: data.count || 0 }) });
      void fetchTasks();
    } catch (err) {
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Batch action failed') });
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      eventDispatcher.dispatch('toast', { type: 'success', message: _('URL copied'), timeout: 1500 });
    });
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  };

  const hasFailed = tasks.some((t) => t.status === 'failed');
  const hasCompleted = tasks.some((t) => t.status === 'completed');
  const hasActive = tasks.some((t) => t.status === 'pending' || t.status === 'in_progress');
  const hasPaused = tasks.some((t) => t.status === 'paused');

  return (
    <div className='card bg-base-100 border-base-200 shadow-sm border rounded-lg p-4'>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='text-lg font-bold flex items-center gap-2'>
          <IoCloudDownloadOutline className='w-5 h-5' />
          {_('Download Tasks')}
        </h3>
        <button onClick={() => void fetchTasks()} className='btn btn-ghost btn-sm btn-square' title={_('Refresh')}>
          <IoRefresh className='w-4 h-4' />
        </button>
      </div>

      {/* Batch actions */}
      {tasks.length > 0 && (
        <div className='flex flex-wrap gap-2 mb-3'>
          {hasFailed && (
            <button onClick={() => void doBatch('retry_failed')} className='btn btn-xs btn-warning'>
              {_('Retry All Failed')}
            </button>
          )}
          {hasActive && (
            <button onClick={() => void doBatch('pause_all')} className='btn btn-xs btn-ghost'>
              <IoPauseCircle className='w-3 h-3' /> {_('Pause All')}
            </button>
          )}
          {hasPaused && (
            <button onClick={() => void doBatch('resume_all')} className='btn btn-xs btn-ghost'>
              <IoPlayCircle className='w-3 h-3' /> {_('Resume All')}
            </button>
          )}
          {hasCompleted && (
            <button onClick={() => void doBatch('clear_completed')} className='btn btn-xs btn-ghost'>
              {_('Clear Completed')}
            </button>
          )}
          {hasFailed && (
            <button onClick={() => void doBatch('clear_failed')} className='btn btn-xs btn-ghost'>
              {_('Clear Failed')}
            </button>
          )}
          <button onClick={() => void doBatch('clear_all')} className='btn btn-xs btn-ghost text-error'>
            {_('Clear All')}
          </button>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className='text-center py-8'>
          <span className='loading loading-spinner loading-md' />
        </div>
      ) : tasks.length === 0 ? (
        <div className='text-center py-8 text-base-content/50'>
          <p>{_('No download tasks')}</p>
        </div>
      ) : (
        <div className='space-y-2 max-h-[400px] overflow-y-auto'>
          {tasks.map((task) => (
            <div key={task.id} className='flex items-start gap-2 p-2 rounded-lg bg-base-200/50'>
              <span className='text-lg mt-0.5'>{statusIcon(task.status)}</span>
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-sm truncate'>{task.filename}</span>
                  <span className={`text-xs font-semibold ${statusColor(task.status)}`}>
                    {_(task.status)}
                  </span>
                </div>
                <div className='text-xs text-base-content/50 truncate cursor-pointer' onClick={() => copyUrl(task.url)} title={task.url}>
                  {task.url}
                </div>
                <div className='text-xs text-base-content/40'>
                  {formatTime(task.createdAt)}
                  {task.fileSize && ` · ${formatSize(task.fileSize)}`}
                  {task.error && ` · ${task.error}`}
                </div>
              </div>
              {/* Actions */}
              <div className='flex items-center gap-1 flex-shrink-0'>
                {task.status === 'failed' && (
                  <button onClick={() => void doAction(task.id, 'retry')} className='btn btn-ghost btn-xs btn-square' title={_('Retry')}>
                    <IoRefresh className='w-3.5 h-3.5' />
                  </button>
                )}
                {(task.status === 'pending' || task.status === 'in_progress') && (
                  <button onClick={() => void doAction(task.id, 'pause')} className='btn btn-ghost btn-xs btn-square' title={_('Pause')}>
                    <IoPauseCircle className='w-3.5 h-3.5' />
                  </button>
                )}
                {task.status === 'paused' && (
                  <button onClick={() => void doAction(task.id, 'resume')} className='btn btn-ghost btn-xs btn-square' title={_('Resume')}>
                    <IoPlayCircle className='w-3.5 h-3.5' />
                  </button>
                )}
                <button onClick={() => void deleteTask(task.id)} className='btn btn-ghost btn-xs btn-square text-error' title={_('Delete')}>
                  <IoTrashOutline className='w-3.5 h-3.5' />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
