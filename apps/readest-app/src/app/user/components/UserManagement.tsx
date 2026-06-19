'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import { IoClose, IoCreateOutline, IoTrashOutline, IoPersonOutline } from 'react-icons/io5';
import { MdAdminPanelSettings } from 'react-icons/md';

interface UserItem {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  storageQuotaMB: number;
  translationQuotaKB: number;
  createdAt: string;
  lastSignInAt: string | null;
}

export default function UserManagement() {
  const _ = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

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
        {users.map((u) => (
          <div key={u.id} className='flex items-center justify-between bg-base-200 rounded-lg p-3'>
            <div className='flex items-center gap-3'>
              <IoPersonOutline className='w-5 h-5 opacity-50' />
              <div>
                <div className='font-medium'>
                  {u.displayName || u.email}
                  {u.role === 'admin' && (
                    <span className='ml-2 badge badge-primary badge-sm'>{_('Admin')}</span>
                  )}
                </div>
                <div className='text-xs opacity-60'>{u.email}</div>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <div className='text-xs opacity-60 text-right'>
                <div>{_('Storage')}: {u.storageQuotaMB > 0 ? `${u.storageQuotaMB} MB` : _('Unlimited')}</div>
                <div>{_('Translation')}: {u.translationQuotaKB > 0 ? `${u.translationQuotaKB} KB` : _('Unlimited')}</div>
              </div>
              {u.id !== currentUser?.id && (
                <button
                  onClick={() => setEditingUser(u)}
                  className='btn btn-ghost btn-xs'
                >
                  {_('Edit')}
                </button>
              )}
              {u.id !== currentUser?.id && u.role !== 'admin' && (
                <button
                  onClick={() => handleDelete(u.id, u.email)}
                  className='btn btn-ghost btn-xs text-error'
                >
                  <IoTrashOutline className='w-4 h-4' />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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

function UserEditDialog({ user, onClose, onSaved }: {
  user: UserItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const _ = useTranslation();
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [storageQuotaMB, setStorageQuotaMB] = useState(user?.storageQuotaMB?.toString() || '0');
  const [translationQuotaKB, setTranslationQuotaKB] = useState(user?.translationQuotaKB?.toString() || '0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      if (password) body.password = password;
      if (!user) body.email = email;

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
