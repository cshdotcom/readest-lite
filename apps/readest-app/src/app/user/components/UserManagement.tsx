'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import { IoClose, IoCreateOutline, IoTrashOutline, IoPersonOutline, IoChevronForwardOutline, IoSearchOutline } from 'react-icons/io5';
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
}: {
  users: UserItem[];
  currentUser: { id?: string; userRole?: string } | null;
  onClose: () => void;
  onEdit: (u: UserItem) => void;
  onDelete: (id: string, email: string) => void;
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
  // v8.18.9: 用户头像 URL —— 任意 http(s) / data: URL，后端拒绝 SVG
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [storageQuotaMB, setStorageQuotaMB] = useState(user?.storageQuotaMB?.toString() || '0');
  const [translationQuotaKB, setTranslationQuotaKB] = useState(user?.translationQuotaKB?.toString() || '0');
  // v8.19.0: 角色变更 — super_admin 可以把 user 升级为 admin 或降级为 user
  const [role, setRole] = useState(user?.role || 'user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // v8.19.0: 只有 super_admin 才能改角色
  const canChangeRole = isSuperAdminClient(currentUser) && user !== null && user.role !== 'super_admin';

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
      // v8.18.9: 头像 URL —— 空字符串清空，否则上传。后端会校验格式和拒绝 SVG。
      // 编辑时只发 avatarUrl 字段（即使没改）；创建时也允许直接附带。
      body['avatarUrl'] = avatarUrl.trim() || null;
      if (password) body['password'] = password;
      if (!user) body['email'] = email;
      // v8.19.0: 角色变更（仅 super_admin）
      if (canChangeRole && user && role !== user.role) {
        body['role'] = role;
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
            />
            {/* v8.18.9: 提示用户 displayName 不允许 @ 等特殊字符 */}
            <p className='text-xs opacity-50 mt-1'>
              {_('Cannot contain "@", angle brackets, quotes, slashes, or other special characters')}
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
              {_('Accepts http(s) or data: URLs. SVG is not allowed.')}
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
