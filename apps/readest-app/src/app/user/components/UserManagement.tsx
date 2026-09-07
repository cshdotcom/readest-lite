'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import { IoClose, IoCreateOutline, IoTrashOutline, IoPersonOutline, IoChevronForwardOutline, IoSearchOutline, IoChevronDownOutline } from 'react-icons/io5';
import { MdAdminPanelSettings } from 'react-icons/md';
import { PiUserCircle } from 'react-icons/pi';
import UserAvatar from '@/components/UserAvatar';

interface UserItem {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  // v8.18.9: 用户头像 URL（管理员 ADMIN_AVATAR_URL 优先级覆盖已在 API 层应用）
  avatarUrl: string | null;
  storageQuotaMB: number;
  translationQuotaKB: number;
  createdAt: string;
  lastSignInAt: string | null;
}

// v8.19.0: 角色标签 — super_admin 金色、admin 蓝色、user 不显示
const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const _ = useTranslation();
  if (role === 'super_admin') {
    return (
      <span className='ml-2 badge badge-sm' style={{ backgroundColor: '#facc15', color: '#1f2937', borderColor: '#eab308' }}>
        {_('Super Admin')}
      </span>
    );
  }
  if (role === 'admin') {
    return <span className='ml-2 badge badge-primary badge-sm'>{_('Admin')}</span>;
  }
  return null;
};

// v8.19.0: 客户端权限判断 — 与服务端 canManageUser 对应
// 不能跨用户调 isSuperAdmin（依赖 SUPER_ADMIN_EMAIL env，客户端拿不到），
// 只用 currentUser.userRole。currentUser 在运行时是 Lite AuthUser（含 userRole），
// 但 TS 类型是 Supabase User（无 userRole 字段）— 用 unknown cast 安全读取。
type LiteUser = { id?: string; userRole?: string; email?: string };
const asLiteUser = (u: unknown): LiteUser | null => {
  if (!u || typeof u !== 'object') return null;
  const obj = u as Record<string, unknown>;
  return {
    id: typeof obj['id'] === 'string' ? obj['id'] : undefined,
    userRole: typeof obj['userRole'] === 'string' ? obj['userRole'] : undefined,
    email: typeof obj['email'] === 'string' ? obj['email'] : undefined,
  };
};
const isSuperAdminClient = (user: unknown): boolean => {
  return asLiteUser(user)?.userRole === 'super_admin';
};
const canManageUserClient = (
  current: unknown,
  target: { id: string; role: string },
): boolean => {
  const c = asLiteUser(current);
  if (!c || !c.id) return false;
  if (c.id === target.id) return false;
  if (c.userRole === 'super_admin') {
    return target.role !== 'super_admin';
  }
  if (c.userRole === 'admin') {
    return target.role === 'user';
  }
  return false;
};

export default function UserManagement() {
  const _ = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // v8.19.4: UserDetailModal target user (when admin drills into a user row)
  const [detailUser, setDetailUser] = useState<UserItem | null>(null);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(_('Delete user {{email}}? This cannot be undone.', { email }))) return;
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        eventDispatcher.dispatch('toast', { message: _('User deleted'), type: 'success' });
        loadUsers();
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || 'Failed', type: 'error' });
      }
    } catch {
      eventDispatcher.dispatch('toast', { message: _('Failed to delete user'), type: 'error' });
    }
  };

  if (loading) {
    return <div className='flex items-center justify-center py-8'><span className='loading loading-spinner' /></div>;
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h3 className='text-lg font-bold flex items-center gap-2'>
          <MdAdminPanelSettings className='w-5 h-5' />
          {_('User Management')}
        </h3>
        <button onClick={() => setShowCreate(true)} className='btn btn-primary btn-sm'>
          <IoCreateOutline className='w-4 h-4' />
          {_('New User')}
        </button>
      </div>

      <div className='space-y-2'>
        {/* v8.18.6: 搜索框 — 当用户数 > 3 时显示 */}
        {users.length > 3 && (
          <div className='relative'>
            <IoSearchOutline className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={_('Search users...')}
              className='input input-bordered input-sm w-full pl-9'
            />
          </div>
        )}
        {/* 搜索时显示全部匹配；不搜索时显示前 3 个 */}
        {(searchQuery.trim() ? filteredUsers : users.slice(0, 3)).map((u) => {
          const canManage = canManageUserClient(currentUser, u);
          return (
            <div key={u.id} className='flex items-center justify-between bg-base-200 rounded-lg p-3 min-w-0 gap-2 overflow-hidden'>
              <div className='flex items-center gap-3 min-w-0 flex-1'>
                {/* v8.18.9: 优先显示用户头像 URL；无头像时回退到 IoPersonOutline 图标 */}
                {u.avatarUrl ? (
                  <UserAvatar
                    url={u.avatarUrl}
                    size={32}
                    DefaultIcon={PiUserCircle}
                    className='flex-shrink-0'
                  />
                ) : (
                  <IoPersonOutline className='w-5 h-5 opacity-50 flex-shrink-0' />
                )}
                <div className='min-w-0'>
                  <div className='font-medium truncate'>
                    {u.displayName || u.email}
                    <RoleBadge role={u.role} />
                  </div>
                  <div className='text-xs opacity-60 truncate'>{u.email}</div>
                </div>
              </div>
              <div className='flex items-center gap-2 flex-shrink-0 flex-wrap justify-end'>
                <div className='text-xs opacity-60 text-right whitespace-nowrap'>
                  <div>{_('Storage')}: {u.storageQuotaMB > 0 ? `${u.storageQuotaMB} MB` : _('Unlimited')}</div>
                  <div>{_('Translation')}: {u.translationQuotaKB > 0 ? `${u.translationQuotaKB} KB` : _('Unlimited')}</div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setEditingUser(u)}
                    className='btn btn-ghost btn-xs flex-shrink-0'
                  >
                    {_('Edit')}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => handleDelete(u.id, u.email)}
                    className='btn btn-ghost btn-xs text-error flex-shrink-0'
                  >
                    <IoTrashOutline className='w-4 h-4' />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* v8.10.2: 超过 3 个用户且不搜索时显示「查看全部」按钮 */}
      {users.length > 3 && !searchQuery.trim() && (
        <button
          onClick={() => setShowAllUsers(true)}
          className='btn btn-ghost btn-sm w-full text-base-content/60 hover:text-base-content'
        >
          {_('View All')} ({users.length})
          <IoChevronForwardOutline className='w-3 h-3' />
        </button>
      )}

      {/* v8.10.2: 全部用户 Modal */}
      {showAllUsers && (
        <AllUsersModal
          users={users}
          currentUser={currentUser}
          onClose={() => setShowAllUsers(false)}
          onEdit={(u) => { setShowAllUsers(false); setEditingUser(u); }}
          onDelete={handleDelete}
          onShowDetail={(u) => { setShowAllUsers(false); setDetailUser(u); }}
        />
      )}

      {/* v8.19.4: 用户详情 Modal — admin 点击某个用户行查看其书籍 + 回收站 */}
      {detailUser && (
        <UserDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
        />
      )}

      {(showCreate || editingUser) && (
        <UserEditDialog
          user={editingUser}
          onClose={() => { setShowCreate(false); setEditingUser(null); }}
          onSaved={() => { setShowCreate(false); setEditingUser(null); loadUsers(); }}
        />
      )}
    </div>
  );
}

// v8.10.2: 全部用户列表 Modal — 当 UserManagement 折叠时，点「查看全部」打开
function AllUsersModal({
  users,
  currentUser,
  onClose,
  onEdit,
  onDelete,
  onShowDetail,
}: {
  users: UserItem[];
  currentUser: { id?: string; userRole?: string } | null;
  onClose: () => void;
  onEdit: (u: UserItem) => void;
  onDelete: (id: string, email: string) => void;
  onShowDetail: (u: UserItem) => void;
}) {
  const _ = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60'>
      <div className='bg-base-100 rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col'>
        <div className='flex items-center justify-between p-4 border-b border-base-200'>
          <h2 className='text-lg font-bold'>
            {_('User Management')} ({users.length})
          </h2>
          <button onClick={onClose} className='btn btn-ghost btn-sm btn-square' title={_('Close')}>
            <IoClose className='w-5 h-5' />
          </button>
        </div>
        {/* v8.18.6: 搜索框 */}
        <div className='px-4 py-2 border-b border-base-200'>
          <div className='relative'>
            <IoSearchOutline className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={_('Search users...')}
              className='input input-bordered input-sm w-full pl-9'
              autoFocus
            />
          </div>
          {searchQuery && (
            <div className='text-xs text-base-content/50 mt-1'>
              {filteredUsers.length} / {users.length} {_('users')}
            </div>
          )}
        </div>
        <div className='flex-1 overflow-y-auto p-3 space-y-2'>
          {filteredUsers.length === 0 ? (
            <div className='text-center py-8 text-base-content/40'>
              {_('No matching users')}
            </div>
          ) : (
            filteredUsers.map((u) => {
            const canManage = canManageUserClient(currentUser, u);
            return (
            <div key={u.id} className='flex items-center justify-between bg-base-200/50 rounded-lg p-3 min-w-0 gap-2 overflow-hidden'>
              <div className='flex items-center gap-3 min-w-0 flex-1'>
                {/* v8.18.9: 优先显示用户头像 URL；无头像时回退到 IoPersonOutline 图标 */}
                {u.avatarUrl ? (
                  <UserAvatar
                    url={u.avatarUrl}
                    size={32}
                    DefaultIcon={PiUserCircle}
                    className='flex-shrink-0'
                  />
                ) : (
                  <IoPersonOutline className='w-5 h-5 opacity-50 flex-shrink-0' />
                )}
                <div className='min-w-0'>
                  <div className='font-medium truncate'>
                    {u.displayName || u.email}
                    <RoleBadge role={u.role} />
                  </div>
                  <div className='text-xs opacity-60 truncate'>{u.email}</div>
                </div>
              </div>
              <div className='flex items-center gap-2 flex-shrink-0 flex-wrap justify-end'>
                <div className='text-xs opacity-60 text-right whitespace-nowrap'>
                  <div>{_('Storage')}: {u.storageQuotaMB > 0 ? `${u.storageQuotaMB} MB` : _('Unlimited')}</div>
                  <div>{_('Translation')}: {u.translationQuotaKB > 0 ? `${u.translationQuotaKB} KB` : _('Unlimited')}</div>
                </div>
                {/* v8.19.4: 查看用户详情 — admin 点击 chevron 打开 UserDetailModal */}
                {canManage && (
                  <button
                    onClick={() => onShowDetail(u)}
                    className='btn btn-ghost btn-xs flex-shrink-0'
                    title={_('View Details')}
                    aria-label={_('View Details')}
                  >
                    <IoChevronDownOutline className='w-4 h-4' />
                  </button>
                )}
                {canManage && (
                  <button onClick={() => onEdit(u)} className='btn btn-ghost btn-xs flex-shrink-0'>
                    {_('Edit')}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => onDelete(u.id, u.email)}
                    className='btn btn-ghost btn-xs text-error flex-shrink-0'
                  >
                    <IoTrashOutline className='w-4 h-4' />
                  </button>
                )}
              </div>
            </div>
            );
            })
          )}
        </div>
        <div className='px-4 py-2 border-t border-base-200 text-xs text-base-content/50 text-center'>
          {filteredUsers.length} / {users.length} {_('users')}
        </div>
      </div>
    </div>
  );
}

function UserEditDialog({ user, onClose, onSaved }: {
  user: UserItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const _ = useTranslation();
  const { user: currentUser } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  // v8.18.9: 用户头像 URL —— 任意 http(s) / data: URL，后端接受任意格式
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [storageQuotaMB, setStorageQuotaMB] = useState(user?.storageQuotaMB?.toString() || '0');
  const [translationQuotaKB, setTranslationQuotaKB] = useState(user?.translationQuotaKB?.toString() || '0');
  // v8.19.0: 角色变更 — super_admin 可以把 user 升级为 admin 或降级为 user
  const [role, setRole] = useState(user?.role || 'user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // v8.19.0: 只有 super_admin 才能改角色
  // v8.19.7: Allow role selection when creating (user === null) OR editing
  const canChangeRole = isSuperAdminClient(currentUser) && (user === null || user.role !== 'super_admin');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const token = await getAccessToken();
      const body: Record<string, unknown> = {
        displayName: displayName.trim() || null,
        storageQuotaMB: parseInt(storageQuotaMB) || 0,
        translationQuotaKB: parseInt(translationQuotaKB) || 0,
      };
      // v8.18.9: 头像 URL —— 空字符串清空，否则上传。后端会校验格式。
      // 编辑时只发 avatarUrl 字段（即使没改）；创建时也允许直接附带。
      body['avatarUrl'] = avatarUrl.trim() || null;
      if (password) body['password'] = password;
      if (!user) body['email'] = email;
      // v8.19.0: 角色变更/创建（仅 super_admin）
      if (canChangeRole) {
        if (user) {
          // Editing: only send if changed
          if (role !== user.role) body['role'] = role;
        } else {
          // Creating: always send role
          body['role'] = role;
        }
      }

      const url = user
        ? `${getAPIBaseUrl()}/admin/users/${user.id}`
        : `${getAPIBaseUrl()}/admin/users`;
      const method = user ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        eventDispatcher.dispatch('toast', {
          message: user ? _('User updated') : _('User created'),
          type: 'success',
        });
        onSaved();
      } else {
        const err = await resp.json();
        setError(err.error || 'Failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-base-100 rounded-lg shadow-xl p-6 w-full max-w-md mx-4'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-bold'>{user ? _('Edit User') : _('Create User')}</h2>
          <button onClick={onClose} className='btn btn-ghost btn-sm btn-square'>
            <IoClose className='w-5 h-5' />
          </button>
        </div>

        <div className='space-y-3'>
          {!user && (
            <div>
              <label className='text-sm font-medium mb-1 block'>{_('Email')} *</label>
              <input
                type='email' value={email} onChange={(e) => setEmail(e.target.value)}
                className='input input-bordered w-full' placeholder='user@example.com'
              />
            </div>
          )}
          <div>
            <label className='text-sm font-medium mb-1 block'>
              {user ? _('New Password (leave blank to keep)') : _('Password')} {user ? '' : '*'}
            </label>
            <input
              type='password' value={password} onChange={(e) => setPassword(e.target.value)}
              className='input input-bordered w-full' placeholder='••••••••'
            />
          </div>
          <div>
            <label className='text-sm font-medium mb-1 block'>{_('Display Name')}</label>
            <input
              type='text' value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className='input input-bordered w-full' placeholder={_('Optional')}
              maxLength={100}
            />
            {/* v8.19.0: 提示用户 displayName 不允许 @ 等特殊字符（含单引号），最长 100 字符 */}
            <p className='text-xs opacity-50 mt-1'>
              {_('Cannot contain "@", angle brackets, quotes, slashes, or other special characters')} (≤ 100)
            </p>
          </div>
          {/* v8.18.9: 头像 URL 输入框 + 实时预览 */}
          <div>
            <label className='text-sm font-medium mb-1 block'>{_('Avatar URL')}</label>
            <input
              type='url' value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
              className='input input-bordered w-full' placeholder='https://example.com/avatar.png'
              spellCheck='false'
            />
            <p className='text-xs opacity-50 mt-1'>
              {_('Accepts http(s), data: URLs, or any image format including SVG.')}
            </p>
            {avatarUrl.trim() && (
              <div className='mt-2 flex items-center gap-2'>
                <span className='text-xs opacity-60'>{_('Preview')}:</span>
                <div className='w-10 h-10 rounded-full overflow-hidden bg-base-200 flex items-center justify-center'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl.trim()}
                    alt={_('Avatar preview')}
                    className='w-full h-full object-cover'
                    referrerPolicy='no-referrer'
                    onError={(e) => {
                      // 预览加载失败时显示一个占位图标
                      const img = e.currentTarget;
                      img.style.display = 'none';
                      const parent = img.parentElement;
                      if (parent && !parent.querySelector('.avatar-preview-fallback')) {
                        const span = document.createElement('span');
                        span.className = 'avatar-preview-fallback text-xs opacity-50';
                        span.textContent = '?';
                        parent.appendChild(span);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='text-sm font-medium mb-1 block'>{_('Storage Quota (MB)')}</label>
              <input
                type='number' value={storageQuotaMB} onChange={(e) => setStorageQuotaMB(e.target.value)}
                className='input input-bordered w-full' placeholder='0 = unlimited'
              />
              <p className='text-xs opacity-50 mt-1'>0 = {_('Unlimited')}</p>
            </div>
            <div>
              <label className='text-sm font-medium mb-1 block'>{_('Translation Quota (KB)')}</label>
              <input
                type='number' value={translationQuotaKB} onChange={(e) => setTranslationQuotaKB(e.target.value)}
                className='input input-bordered w-full' placeholder='0 = unlimited'
              />
              <p className='text-xs opacity-50 mt-1'>0 = {_('Unlimited')}</p>
            </div>
          </div>
          {/* v8.19.0: 角色变更 — 仅 super_admin 可见，且不能改 super_admin */}
          {canChangeRole && (
            <div>
              <label className='text-sm font-medium mb-1 block'>{_('Role')}</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className='select select-bordered w-full'
              >
                <option value='user'>{_('User')}</option>
                <option value='admin'>{_('Admin')}</option>
              </select>
              <p className='text-xs opacity-50 mt-1'>
                {_('Super admin role can only be set via SUPER_ADMIN_EMAIL env var.')}
              </p>
            </div>
          )}
          {error && <div className='text-sm text-red-500'>{error}</div>}
        </div>

        <div className='flex gap-2 mt-6'>
          <button
            onClick={handleSave}
            disabled={saving || (!user && (!email || !password))}
            className='btn btn-primary flex-1'
          >
            {saving ? <span className='loading loading-spinner loading-sm' /> : (user ? _('Save') : _('Create'))}
          </button>
          <button onClick={onClose} className='btn btn-ghost' disabled={saving}>
            {_('Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// v8.19.4: UserDetailModal — admin 点击 AllUsersModal 里某个用户后打开。
// 展示用户基本信息 + 角色徽章 + 书籍列表（搜索 + 排序）+ 回收站条目（恢复/永久删除）。
// 调用 /api/admin/users/[id]/books 和 /api/admin/users/[id]/recycle-bin
// （两个端点都要求 isAdmin，由后端二次校验，前端不传 canManageUser 防伪造）。
interface AdminBookItem {
  userId: string;
  bookHash: string;
  title: string | null;
  author: string | null;
  format: string | null;
  updatedAt: string | null;
  uploadedAt: string | null;
  createdAt: string | null;
  fileSize: number | null;
}

interface AdminRecycleItem {
  id: string;
  bookHash: string;
  bookTitle: string;
  bookFormat: string;
  fileKey: string | null;
  deletedAt: string;
  expiresAt: string;
}

type SortKey = 'title' | 'uploadedAt' | 'fileSize';
type SortDir = 'asc' | 'desc';

const formatBytes = (bytes: number | null): string => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function UserDetailModal({ user, onClose }: { user: UserItem; onClose: () => void }) {
  const _ = useTranslation();
  const [books, setBooks] = useState<AdminBookItem[]>([]);
  const [recycleItems, setRecycleItems] = useState<AdminRecycleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookSearch, setBookSearch] = useState('');
  // Default sort: most recently uploaded first (mirrors the library sort).
  const [sortKeyActual, setSortKeyActual] = useState<SortKey>('uploadedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedRecycle, setSelectedRecycle] = useState<Set<string>>(new Set());
  const [actionPending, setActionPending] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const [booksResp, recycleResp] = await Promise.all([
        fetch(`${getAPIBaseUrl()}/admin/users/${user.id}/books`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getAPIBaseUrl()}/admin/users/${user.id}/recycle-bin`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (booksResp.ok) {
        const data = await booksResp.json();
        setBooks(data.books || []);
      } else if (booksResp.status === 403) {
        eventDispatcher.dispatch('toast', { message: _('Admin only'), type: 'error' });
      }
      if (recycleResp.ok) {
        const data = await recycleResp.json();
        setRecycleItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load user detail:', err);
      eventDispatcher.dispatch('toast', { message: _('Failed to load'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [user.id, _]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const sortedBooks = useMemo(() => {
    // search first
    const q = bookSearch.trim().toLowerCase();
    const filtered = !q
      ? books
      : books.filter((b) =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.author || '').toLowerCase().includes(q) ||
          (b.format || '').toLowerCase().includes(q) ||
          b.bookHash.toLowerCase().includes(q),
        );
    const dirMul = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKeyActual === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
      } else if (sortKeyActual === 'uploadedAt') {
        const at = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const bt = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        cmp = at - bt;
      } else if (sortKeyActual === 'fileSize') {
        cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
      }
      return cmp * dirMul;
    });
  }, [books, bookSearch, sortKeyActual, sortDir]);

  const toggleRecycle = (id: string) => {
    setSelectedRecycle((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRecycleAction = async (action: 'restore' | 'delete') => {
    if (selectedRecycle.size === 0) return;
    if (
      action === 'delete' &&
      !confirm(_('Permanently delete {{count}} item(s)? This cannot be undone.', { count: selectedRecycle.size }))
    ) {
      return;
    }
    setActionPending(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(
        `${getAPIBaseUrl()}/admin/users/${user.id}/recycle-bin?action=${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: [...selectedRecycle] }),
        },
      );
      if (resp.ok) {
        const data = await resp.json();
        eventDispatcher.dispatch('toast', {
          message: action === 'restore'
            ? _('Restored {{count}} item(s)', { count: data.restored })
            : _('Permanently deleted {{count}} item(s)', { count: data.deleted }),
          type: 'success',
        });
        setSelectedRecycle(new Set());
        await loadAll();
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || 'Failed', type: 'error' });
      }
    } catch (err) {
      console.error('Recycle action failed:', err);
      eventDispatcher.dispatch('toast', { message: _('Failed'), type: 'error' });
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className='fixed inset-0 z-[110] flex items-center justify-center bg-black/60'>
      <div className='bg-base-100 rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[88vh] flex flex-col'>
        <div className='flex items-center justify-between p-4 border-b border-base-200'>
          <h2 className='text-lg font-bold flex items-center gap-2 min-w-0'>
            <MdAdminPanelSettings className='w-5 h-5 flex-shrink-0' />
            <span className='truncate'>
              {user.displayName || user.email}
              <RoleBadge role={user.role} />
            </span>
          </h2>
          <button onClick={onClose} className='btn btn-ghost btn-sm btn-square' title={_('Close')}>
            <IoClose className='w-5 h-5' />
          </button>
        </div>

        {/* User info card */}
        <div className='px-4 py-3 border-b border-base-200 bg-base-200/30'>
          <div className='flex items-center gap-3 min-w-0'>
            {user.avatarUrl ? (
              <UserAvatar url={user.avatarUrl} size={48} DefaultIcon={PiUserCircle} className='flex-shrink-0' />
            ) : (
              <PiUserCircle className='w-12 h-12 opacity-50 flex-shrink-0' />
            )}
            <div className='min-w-0 flex-1'>
              <div className='font-medium truncate flex items-center gap-2'>
                {user.displayName || user.email}
                <RoleBadge role={user.role} />
              </div>
              <div className='text-xs opacity-60 truncate'>{user.email}</div>
              <div className='text-xs opacity-60 mt-1 flex flex-wrap gap-x-4 gap-y-1'>
                <span>{_('Created')}: {formatDate(user.createdAt)}</span>
                <span>{_('Last signed in')}: {formatDate(user.lastSignInAt)}</span>
                <span>{_('Storage')}: {user.storageQuotaMB > 0 ? `${user.storageQuotaMB} MB` : _('Unlimited')}</span>
                <span>{_('Translation')}: {user.translationQuotaKB > 0 ? `${user.translationQuotaKB} KB` : _('Unlimited')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Books section */}
        <div className='px-4 py-3 border-b border-base-200'>
          <div className='flex items-center justify-between mb-2'>
            <h3 className='text-sm font-semibold'>
              {_('Book List')} ({books.length})
            </h3>
            {/* Sort selector */}
            <div className='flex items-center gap-2'>
              <span className='text-xs opacity-60'>{_('Sort by')}</span>
              <select
                value={sortKeyActual}
                onChange={(e) => setSortKeyActual(e.target.value as SortKey)}
                className='select select-bordered select-xs'
              >
                <option value='uploadedAt'>{_('Upload Date')}</option>
                <option value='title'>{_('Title')}</option>
                <option value='fileSize'>{_('File Size')}</option>
              </select>
              <button
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                className='btn btn-ghost btn-xs'
                title={sortDir === 'asc' ? _('Sort ascending') : _('Sort descending')}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
          <div className='relative mb-2'>
            <IoSearchOutline className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40' />
            <input
              type='text'
              value={bookSearch}
              onChange={(e) => setBookSearch(e.target.value)}
              placeholder={_('Search books...')}
              className='input input-bordered input-sm w-full pl-9'
            />
          </div>
        </div>
        <div className='flex-1 overflow-y-auto p-3 min-h-0'>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <span className='loading loading-spinner' />
            </div>
          ) : (
            <div className='space-y-3'>
              {/* Books list */}
              <div className='space-y-1'>
                {sortedBooks.length === 0 ? (
                  <div className='text-center py-4 text-sm text-base-content/40'>
                    {_('No matching books')}
                  </div>
                ) : (
                  sortedBooks.map((b) => (
                    <div key={b.bookHash} className='flex items-center gap-2 bg-base-200/40 rounded px-2 py-1.5 text-sm'>
                      <div className='min-w-0 flex-1'>
                        <div className='font-medium truncate'>
                          {b.title || b.bookHash}
                        </div>
                        <div className='text-xs opacity-50 truncate'>
                          {b.author || '—'} · {b.format || '—'} · {formatBytes(b.fileSize)}
                        </div>
                      </div>
                      <div className='text-xs opacity-50 whitespace-nowrap'>
                        {b.uploadedAt ? formatDate(b.uploadedAt) : '—'}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Recycle bin section */}
              <div className='pt-3 mt-3 border-t border-base-200'>
                <div className='flex items-center justify-between mb-2'>
                  <h3 className='text-sm font-semibold'>
                    {_('Recycle Bin')} ({recycleItems.length})
                  </h3>
                  {recycleItems.length > 0 && (
                    <div className='flex gap-1'>
                      <button
                        onClick={() => void handleRecycleAction('restore')}
                        disabled={selectedRecycle.size === 0 || actionPending}
                        className='btn btn-ghost btn-xs'
                      >
                        {_('Restore Selected')}
                      </button>
                      <button
                        onClick={() => void handleRecycleAction('delete')}
                        disabled={selectedRecycle.size === 0 || actionPending}
                        className='btn btn-ghost btn-xs text-error'
                      >
                        {_('Permanently Delete Selected')}
                      </button>
                    </div>
                  )}
                </div>
                {recycleItems.length === 0 ? (
                  <div className='text-center py-4 text-sm text-base-content/40'>
                    {_('No items in recycle bin')}
                  </div>
                ) : (
                  <div className='space-y-1'>
                    {recycleItems.map((item) => (
                      <div key={item.id} className='flex items-center gap-2 bg-base-200/40 rounded px-2 py-1.5 text-sm'>
                        <input
                          type='checkbox'
                          className='checkbox checkbox-xs'
                          checked={selectedRecycle.has(item.id)}
                          onChange={() => toggleRecycle(item.id)}
                          aria-label={_('Select recycle bin item')}
                        />
                        <div className='min-w-0 flex-1'>
                          <div className='font-medium truncate'>{item.bookTitle}</div>
                          <div className='text-xs opacity-50 truncate'>
                            {item.bookFormat} · {_('Deleted')}: {formatDate(item.deletedAt)} · {_('Expires')}: {formatDate(item.expiresAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
