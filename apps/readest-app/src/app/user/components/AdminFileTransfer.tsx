'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import {
  IoPersonOutline,
  IoSearchOutline,
  IoRefreshOutline,
  IoMoveOutline,
  IoCopyOutline,
  IoTrashOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';

interface FileItem {
  file_key: string;
  file_size: number;
  book_hash: string | null;
  replica_kind: string | null;
  replica_id: string | null;
  created_at: string;
  updated_at: string | null;
  user_id?: string;
  user_email?: string;
  user_display_name?: string | null;
}

interface UserItem {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// 管理员跨用户文件管理 — 允许 admin/super_admin 浏览所有用户的文件、移动/复制到其他用户、批量删除
export default function AdminFileTransfer() {
  const _ = useTranslation();
  const { user: currentUser } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  // v8.22.2: 折叠/展开 — 默认折叠（像回收站）
  const [collapsed, setCollapsed] = useState(true);
  // 可搜索的"目标用户"输入框显示值（用 datalist 关联到用户列表）
  const [targetUserInput, setTargetUserInput] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  // v8.22.4: 多目标用户选择（批量复制）
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [targetUserSearch, setTargetUserSearch] = useState('');
  const [targetUserIds, setTargetUserIds] = useState<Set<string>>(new Set());
  const [operating, setOperating] = useState(false);

  // v8.22.4: 单目标用户 ID（向后兼容）— 取选中的第一个，若无则空
  const targetUserId = targetUserIds.size > 0 ? Array.from(targetUserIds)[0] : '';

  // 派生：当前 selectedUser 显示名（用于可搜索 input 的回显）
  const selectedUserDisplay = (() => {
    if (!selectedUser) return '';
    const u = users.find((x) => x.id === selectedUser);
    return u ? (u.displayName || u.email) : '';
  })();

  // 通过 unknown cast 读取 userRole（运行时是 Lite AuthUser，类型是 supabase User）
  const currentUserRole = (currentUser as unknown as { userRole?: string } | null)?.userRole;
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin';

  const loadUsers = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (selectedUser) params.set('userId', selectedUser);
      else params.set('allUsers', '1');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('pageSize', '100');

      const resp = await fetch(`${getAPIBaseUrl()}/storage/list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedUser, searchQuery]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadFiles();
    } else {
      setLoading(false);
    }
  }, [isAdmin, loadFiles, loadUsers]);

  if (!isAdmin) return null;

  const handleToggleSelect = (fileKey: string) => {
    const next = new Set(selectedFiles);
    if (next.has(fileKey)) next.delete(fileKey);
    else next.add(fileKey);
    setSelectedFiles(next);
  };

  const handleSelectAll = () => setSelectedFiles(new Set(files.map((f) => f.file_key)));
  const handleDeselectAll = () => setSelectedFiles(new Set());

  const handleMove = async () => {
    if (selectedFiles.size === 0 || targetUserIds.size === 0) {
      eventDispatcher.dispatch('toast', { message: _('Select files and target user first'), type: 'info' });
      return;
    }
    if (targetUserIds.size > 1) {
      eventDispatcher.dispatch('toast', { message: _('Move supports only one target user. Use Copy for multi-user.'), type: 'info' });
      return;
    }
    const targetId = Array.from(targetUserIds)[0]!;
    if (!confirm(_('Move {{count}} file(s) to {{users}} user?', { count: selectedFiles.size, users: 1 }))) return;
    setOperating(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/storage/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileKeys: Array.from(selectedFiles), targetUserId: targetId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        eventDispatcher.dispatch('toast', {
          message: _('Moved {{count}} file(s)', { count: data.moved }),
          type: 'success',
        });
        setSelectedFiles(new Set());
        setTargetUserIds(new Set());
        setShowTargetDropdown(false);
        loadFiles();
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || _('Failed'), type: 'error' });
      }
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Failed'),
        type: 'error',
      });
    } finally {
      setOperating(false);
    }
  };

  const handleCopy = async () => {
    if (selectedFiles.size === 0 || targetUserIds.size === 0) {
      eventDispatcher.dispatch('toast', { message: _('Select files and target user first'), type: 'info' });
      return;
    }
    const targetCount = targetUserIds.size;
    if (!confirm(_('Copy {{count}} file(s) to {{users}} user(s)?', { count: selectedFiles.size, users: targetCount }))) return;
    setOperating(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/storage/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileKeys: Array.from(selectedFiles),
          targetUserIds: Array.from(targetUserIds),
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        eventDispatcher.dispatch('toast', {
          message: _('Copied {{count}} file(s) to {{users}} user(s)', { count: data.copied, users: data.targetUsersCount }),
          type: 'success',
        });
        setSelectedFiles(new Set());
        setTargetUserIds(new Set());
        setShowTargetDropdown(false);
        loadFiles();
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || _('Failed'), type: 'error' });
      }
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Failed'),
        type: 'error',
      });
    } finally {
      setOperating(false);
    }
  };

  const handleDelete = async (purge = false) => {
    if (selectedFiles.size === 0) return;
    const msg = purge
      ? _('Permanently delete {{count}} file(s)?', { count: selectedFiles.size })
      : _('Move {{count}} file(s) to recycle bin?', { count: selectedFiles.size });
    if (!confirm(msg)) return;
    setOperating(true);
    try {
      const token = await getAccessToken();
      let success = 0;
      let failed = 0;
      for (const fileKey of selectedFiles) {
        // 注意：admin 模式下 fileKey 可能是其他用户的；需要带 userId 参数
        // 但 storage/list 的 cross-user 模式响应里有 user_id，这里从 files 数组找
        const file = files.find((f) => f.file_key === fileKey);
        const targetUid = file?.user_id && file.user_id !== (currentUser as unknown as { id?: string })?.id
          ? file.user_id
          : undefined;
        let url = `${getAPIBaseUrl()}/storage/delete?fileKey=${encodeURIComponent(fileKey)}`;
        if (targetUid) url += `&userId=${encodeURIComponent(targetUid)}`;
        if (purge) url += '&purge=true';
        const resp = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) success++;
        else failed++;
      }
      eventDispatcher.dispatch('toast', {
        message: _('Processed {{ok}}, failed {{fail}}', { ok: success, fail: failed }),
        type: failed === 0 ? 'success' : 'info',
      });
      setSelectedFiles(new Set());
      loadFiles();
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Failed'),
        type: 'error',
      });
    } finally {
      setOperating(false);
    }
  };

  return (
    <div className='card bg-base-100 border-base-200 shadow-sm border rounded-lg p-4'>
      <div className='flex items-center justify-between mb-3 gap-2 flex-wrap'>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className='text-lg font-bold flex items-center gap-2 cursor-pointer hover:opacity-80'
          title={collapsed ? _('Expand') : _('Collapse')}
        >
          <IoMoveOutline className='w-5 h-5' />
          {_('Admin File Transfer')}
          {files.length > 0 && (
            <span className='badge badge-sm badge-ghost'>{files.length}</span>
          )}
          <IoChevronForwardOutline
            className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          />
        </button>
        {!collapsed && (
          <button onClick={loadFiles} className='btn btn-ghost btn-sm btn-square' title={_('Refresh')}>
            <IoRefreshOutline className='w-4 h-4' />
          </button>
        )}
      </div>

      {collapsed && (
        <div className='text-center py-4 text-base-content/50 text-sm'>
          <p>{_('Click to manage files across all users — move, copy, or delete.')}</p>
          <button
            onClick={() => setCollapsed(false)}
            className='btn btn-ghost btn-sm mt-2'
          >
            {_('Expand')} →
          </button>
        </div>
      )}

      {!collapsed && (
        <>
      {/* 用户选择 + 文件搜索（用户选择支持搜索） */}
      <div className='flex gap-2 flex-wrap mb-3'>
        <div className='relative'>
          <IoSearchOutline className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none' />
          <input
            type='text'
            list='admin-file-transfer-user-list'
            value={selectedUserDisplay}
            onChange={(e) => {
              const val = e.target.value;
              const matched = users.find((u) => (u.displayName || u.email) === val);
              if (matched) {
                setSelectedUser(matched.id);
                setSelectedFiles(new Set());
              } else if (!val) {
                setSelectedUser('');
                setSelectedFiles(new Set());
              }
            }}
            placeholder={_('All Users')}
            className='input input-bordered input-sm pl-9 w-52'
          />
          <datalist id='admin-file-transfer-user-list'>
            {users.map((u) => (
              <option key={u.id} value={u.displayName || u.email}>
                {u.email}
              </option>
            ))}
          </datalist>
        </div>
        <div className='relative flex-1 min-w-[200px]'>
          <IoSearchOutline className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50' />
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={_('Search by file name')}
            className='input input-bordered input-sm pl-9 w-full'
          />
        </div>
      </div>

      {loading && (
        <div className='text-center py-4 opacity-50 text-sm'>
          <span className='loading loading-spinner loading-sm' />
        </div>
      )}

      {!loading && files.length === 0 && (
        <div className='text-center py-4 opacity-50 text-sm'>
          <IoPersonOutline className='w-8 h-8 mx-auto mb-2 opacity-30' />
          {_('No files')}
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* 批量操作工具栏 */}
          <div className='flex items-center justify-between gap-2 flex-wrap bg-base-200/50 rounded p-2 mb-2'>
            <div className='flex gap-2 items-center text-xs'>
              <button onClick={handleSelectAll} className='btn btn-ghost btn-xs link link-hover'>
                {_('Select All')}
              </button>
              <button onClick={handleDeselectAll} className='btn btn-ghost btn-xs link link-hover'>
                {_('Deselect')}
              </button>
              <span className='opacity-60'>
                {selectedFiles.size} {_('selected')}
              </span>
            </div>
            <div className='flex gap-2 items-center flex-wrap'>
              {/* v8.22.4: 目标用户下拉（可搜索 + 可多选 + 可滚动 + 不溢出） */}
              <div className='relative'>
                <button
                  onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                  className='btn btn-outline btn-xs gap-1 w-44 justify-between'
                  title={_('Select target user(s)')}
                >
                  <span className='truncate'>
                    {targetUserIds.size === 0
                      ? _('Target user(s)')
                      : `${targetUserIds.size} ${_('user(s) selected')}`}
                  </span>
                  <IoChevronForwardOutline className={`w-3 h-3 transition-transform ${showTargetDropdown ? 'rotate-90' : ''}`} />
                </button>
                {showTargetDropdown && (
                  <div className='absolute top-full left-0 mt-1 w-72 bg-base-100 border border-base-300 rounded shadow-lg z-50'>
                    <div className='p-2 border-b border-base-200'>
                      <input
                        type='text'
                        value={targetUserSearch}
                        onChange={(e) => setTargetUserSearch(e.target.value)}
                        placeholder={_('Search users...')}
                        className='input input-bordered input-xs w-full'
                        autoFocus
                      />
                    </div>
                    <div className='max-h-60 overflow-y-auto'>
                      {users
                        .filter((u) => u.id !== selectedUser)
                        .filter((u) => {
                          if (!targetUserSearch.trim()) return true;
                          const q = targetUserSearch.toLowerCase();
                          return (
                            u.email.toLowerCase().includes(q) ||
                            (u.displayName || '').toLowerCase().includes(q)
                          );
                        })
                        .map((u) => (
                          <label
                            key={u.id}
                            className='flex items-center gap-2 p-2 hover:bg-base-200 cursor-pointer text-xs'
                          >
                            <input
                              type='checkbox'
                              checked={targetUserIds.has(u.id)}
                              onChange={() => {
                                setTargetUserIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(u.id)) next.delete(u.id);
                                  else next.add(u.id);
                                  return next;
                                });
                              }}
                              className='checkbox checkbox-xs'
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='truncate font-medium'>
                                {u.displayName || u.email}
                              </div>
                              <div className='text-xs opacity-50 truncate'>{u.email}</div>
                            </div>
                          </label>
                        ))}
                    </div>
                    <div className='p-2 border-t border-base-200 flex justify-between text-xs'>
                      <button
                        onClick={() => {
                          setTargetUserIds(new Set(users.filter((u) => u.id !== selectedUser).map((u) => u.id)));
                        }}
                        className='btn btn-ghost btn-xs link link-hover'
                      >
                        {_('Select All')}
                      </button>
                      <button
                        onClick={() => setTargetUserIds(new Set())}
                        className='btn btn-ghost btn-xs link link-hover'
                      >
                        {_('Clear')}
                      </button>
                      <button
                        onClick={() => setShowTargetDropdown(false)}
                        className='btn btn-ghost btn-xs'
                      >
                        {_('Done')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleMove}
                disabled={operating || selectedFiles.size === 0 || targetUserIds.size === 0}
                className='btn btn-primary btn-xs gap-1'
              >
                <IoMoveOutline className='w-3 h-3' />
                {_('Move')}
              </button>
              <button
                onClick={handleCopy}
                disabled={operating || selectedFiles.size === 0 || targetUserIds.size === 0}
                className='btn btn-outline btn-xs gap-1'
              >
                <IoCopyOutline className='w-3 h-3' />
                {_('Copy')}
              </button>
              <button
                onClick={() => handleDelete(false)}
                disabled={operating || selectedFiles.size === 0}
                className='btn btn-ghost btn-xs text-warning gap-1'
              >
                <IoTrashOutline className='w-3 h-3' />
                {_('Recycle')}
              </button>
              <button
                onClick={() => handleDelete(true)}
                disabled={operating || selectedFiles.size === 0}
                className='btn btn-ghost btn-xs text-error gap-1'
              >
                <IoTrashOutline className='w-3 h-3' />
                {_('Purge')}
              </button>
            </div>
          </div>

          {/* 文件列表（表头粘性 + 滚动） */}
          <div className='overflow-x-auto max-h-[400px] overflow-y-auto border border-base-200 rounded'>
            <table className='table table-xs'>
              <thead className='sticky top-0 bg-base-100 z-10'>
                <tr>
                  <th></th>
                  <th>{_('File')}</th>
                  {!selectedUser && <th>{_('User')}</th>}
                  <th>{_('Size')}</th>
                  <th>{_('Date')}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.file_key}>
                    <td>
                      <input
                        type='checkbox'
                        checked={selectedFiles.has(f.file_key)}
                        onChange={() => handleToggleSelect(f.file_key)}
                        className='checkbox checkbox-xs'
                      />
                    </td>
                    <td className='max-w-[200px] truncate' title={f.file_key}>
                      {f.file_key.split('/').pop() || f.file_key}
                    </td>
                    {!selectedUser && (
                      <td className='max-w-[150px] truncate' title={f.user_email}>
                        {f.user_display_name || f.user_email || f.user_id?.slice(0, 8) || '-'}
                      </td>
                    )}
                    <td className='whitespace-nowrap'>{formatBytes(f.file_size)}</td>
                    <td className='whitespace-nowrap text-xs opacity-70'>
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
