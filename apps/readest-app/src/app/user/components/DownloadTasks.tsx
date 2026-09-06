'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { eventDispatcher } from '@/utils/event';
import {
  IoRefresh,
  IoTrashOutline,
  IoPlayCircle,
  IoPauseCircle,
  IoCloudDownloadOutline,
  IoChevronForwardOutline,
  IoSearchOutline,
} from 'react-icons/io5';
import DownloadTaskDetailModal from './DownloadTaskDetailModal';
import DownloadTasksModal from './DownloadTasksModal';

interface DownloadTask {
  id: string;
  url: string;
  filename: string;
  originalFilename?: string | null;
  status: string;
  error: string | null;
  bookHash: string | null;
  fileSize: number | null;
  progress: number;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBps: number;
  etaSeconds: number | null;
  hasCookies: boolean;
  hasCustomHeaders: boolean;
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

// 格式化字节
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// 格式化速度
const formatSpeed = (bps: number): string => {
  if (!bps || bps < 0) return '-';
  return `${formatBytes(bps)}/s`;
};

// 格式化时长（秒）
const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '-';
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
};

export default function DownloadTasks() {
  const _ = useTranslation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showAllModal, setShowAllModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const nowRef = useRef(Date.now());
  const [, setTick] = useState(0); // 强制重渲染用

  // v8.18.9: filter tasks by URL, filename, or status. useMemo so we don't
  // re-filter on every 1s tick — only when tasks or searchQuery actually change.
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      t.url.toLowerCase().includes(q) ||
      t.filename.toLowerCase().includes(q) ||
      t.originalFilename?.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q) ||
      _(t.status).toLowerCase().includes(q),
    );
    // _ is the translation fn — its identity is stable per language; including
    // it in deps would re-filter on every render. We only need it for the
    // localized status match, which is fine to read at filter time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, searchQuery]);

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
    // 有 pending/in_progress 任务时 3 秒轮询（v8.9: 缩短到 3s，便于看到进度更新）
    const interval = setInterval(() => {
      if (tasks.some((t) => t.status === 'pending' || t.status === 'in_progress')) {
        void fetchTasks();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchTasks, tasks]);

  // v8.9: 每秒触发一次重渲染以刷新 "用时" 显示
  useEffect(() => {
    const tickInterval = setInterval(() => {
      nowRef.current = Date.now();
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(tickInterval);
  }, []);

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
      eventDispatcher.dispatch('toast', {
        type: 'success',
        message: _(`{{count}} task(s) affected`, { count: data.count || 0 }),
      });
      void fetchTasks();
    } catch (err) {
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Batch action failed') });
    }
  };

  const copyUrl = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      eventDispatcher.dispatch('toast', { type: 'success', message: _('URL copied'), timeout: 1500 });
    });
  };

  // 计算已用时（秒）
  const getElapsedSeconds = (task: DownloadTask): number => {
    if (!task.startedAt) return 0;
    const start = new Date(task.startedAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : nowRef.current;
    return Math.max(0, (end - start) / 1000);
  };

  const hasFailed = filteredTasks.some((t) => t.status === 'failed');
  const hasCompleted = filteredTasks.some((t) => t.status === 'completed');
  const hasActive = filteredTasks.some((t) => t.status === 'pending' || t.status === 'in_progress');
  const hasPaused = filteredTasks.some((t) => t.status === 'paused');

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

      {/* v8.18.9: search/filter — filters by URL, filename, or status.
          Only show when there's more than 1 task; otherwise the input takes
          more space than the list itself. */}
      {tasks.length > 1 && (
        <div className='relative mb-3'>
          <IoSearchOutline className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40 pointer-events-none' />
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={_('Search downloads...')}
            className='input input-bordered input-sm w-full pl-9'
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className='btn btn-ghost btn-xs btn-square absolute right-1 top-1/2 -translate-y-1/2'
              title={_('Clear Search')}
              aria-label={_('Clear Search')}
            >
              <IoRefresh className='w-3 h-3 rotate-45' />
            </button>
          )}
        </div>
      )}

      {/* Batch actions — operate on the full task set, not the filtered view.
          Showing them only when there are tasks (filtered) keeps the card tidy. */}
      {filteredTasks.length > 0 && (
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
          <p className='text-xs mt-2'>{_('Use "Download from URL" in the library to add tasks.')}</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        /* v8.18.9: searching but no matches — distinguish from "no tasks at all" */
        <div className='text-center py-8 text-base-content/50'>
          <p>{_('No matching download tasks')}</p>
        </div>
      ) : (
        <>
          <div className='space-y-2'>
            {/* v8.10: 默认只显示前 3 条，避免长列表撑爆用户中心。
                v8.18.9: 搜索时显示全部匹配项（slice 0,3 only when not searching） */}
            {(searchQuery.trim() ? filteredTasks : filteredTasks.slice(0, 3)).map((task) => {
              const elapsed = getElapsedSeconds(task);
              const isActive = task.status === 'pending' || task.status === 'in_progress';
              const showProgress = task.status === 'in_progress' || task.status === 'paused';
              const wasRenamed = task.originalFilename && task.originalFilename !== task.filename;
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className='flex items-start gap-2 p-2 rounded-lg bg-base-200/50 hover:bg-base-200 cursor-pointer transition'
                >
                  <span className='text-lg mt-0.5'>{statusIcon(task.status)}</span>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className='font-medium text-sm truncate'>{task.filename}</span>
                      <span className={`text-xs font-semibold ${statusColor(task.status)}`}>
                        {_(task.status)}
                      </span>
                      {wasRenamed && (
                        <span className='badge badge-xs badge-info' title={`${task.originalFilename} → ${task.filename}`}>
                          ↻ {_('renamed')}
                        </span>
                      )}
                      {task.hasCookies && <span className='badge badge-xs badge-warning'>{_('cookie')}</span>}
                      {task.hasCustomHeaders && <span className='badge badge-xs badge-warning'>{_('headers')}</span>}
                    </div>

                    {/* v8.9: 进度条 */}
                    {(showProgress || task.status === 'completed') && (
                      <div className='mt-1'>
                        <progress
                          className='progress progress-primary w-full h-1.5'
                          value={task.progress}
                          max='100'
                        />
                        <div className='flex items-center justify-between text-xs text-base-content/50 mt-0.5'>
                          <span>
                            {formatBytes(task.downloadedBytes)}
                            {task.totalBytes ? ` / ${formatBytes(task.totalBytes)}` : ''}
                            {task.progress > 0 && task.progress < 100 ? ` · ${task.progress}%` : ''}
                          </span>
                          {isActive && (
                            <span>
                              {task.speedBps > 0 ? formatSpeed(task.speedBps) : '—'}
                              {task.etaSeconds !== null && task.etaSeconds > 0 ? ` · ETA ${formatDuration(task.etaSeconds)}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* v8.9: URL + 用时 */}
                    <div
                      className='text-xs text-base-content/50 truncate cursor-pointer hover:text-base-content/80'
                      onClick={(e) => copyUrl(e, task.url)}
                      title={task.url}
                    >
                      {task.url}
                    </div>
                    <div className='text-xs text-base-content/40'>
                      {new Date(task.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                      {elapsed > 0 && ` · ⏱ ${formatDuration(elapsed)}`}
                      {task.fileSize && task.status === 'completed' && ` · ${formatBytes(task.fileSize)}`}
                      {task.error && (
                        <span className='text-error'> · {task.error.slice(0, 80)}{task.error.length > 80 ? '...' : ''}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions — stop propagation to avoid opening modal */}
                  <div
                    className='flex items-center gap-1 flex-shrink-0'
                    onClick={(e) => e.stopPropagation()}
                  >
                    {task.status === 'failed' && (
                      <button onClick={() => void doAction(task.id, 'retry')} className='btn btn-ghost btn-xs btn-square' title={_('Retry')}>
                        <IoRefresh className='w-3.5 h-3.5' />
                      </button>
                    )}
                    {isActive && (
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
              );
            })}
          </div>

          {/* v8.10: 超过 3 条时显示「查看全部」按钮。
              v8.18.9: 搜索时不显示——用户已经在看全部匹配项了。 */}
          {!searchQuery.trim() && filteredTasks.length > 3 && (
            <button
              onClick={() => setShowAllModal(true)}
              className='btn btn-ghost btn-sm w-full mt-2 text-base-content/60 hover:text-base-content'
            >
              {_('View All')} ({tasks.length})
              <IoChevronForwardOutline className='w-3 h-3' />
            </button>
          )}
        </>
      )}

      {/* v8.9: 详情 Modal */}
      {selectedTaskId && (
        <DownloadTaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskChanged={() => void fetchTasks()}
        />
      )}

      {/* v8.10: 全部任务 Modal */}
      {showAllModal && (
        <DownloadTasksModal
          tasks={tasks}
          onClose={() => setShowAllModal(false)}
          onSelectTask={(id) => {
            setShowAllModal(false);
            setSelectedTaskId(id);
          }}
          onAction={doAction}
          onDelete={deleteTask}
          onCopyUrl={copyUrl}
          getElapsedSeconds={getElapsedSeconds}
        />
      )}
    </div>
  );
}
