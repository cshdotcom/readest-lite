'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import { eventDispatcher } from '@/utils/event';
import {
  IoClose,
  IoSearchOutline,
  IoAddOutline,
  IoCreateOutline,
  IoTrashOutline,
  IoArrowUpOutline,
  IoArrowDownOutline,
} from 'react-icons/io5';

// 用于判断 createPortal 是否可用（client-side 渲染时）
const isBrowser = () => typeof document !== 'undefined' && !!document.body;

interface BookGroupItem {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface GroupManagementModalProps {
  onClose: () => void;
  onChanged?: () => void;
}

export default function GroupManagementModal({ onClose, onChanged }: GroupManagementModalProps) {
  const _ = useTranslation();
  const [groups, setGroups] = useState<BookGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/book-groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setGroups(data.groups || []);
      }
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/book-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, sortOrder: groups.length }),
      });
      if (resp.ok) {
        setNewName('');
        eventDispatcher.dispatch('toast', { message: _('Group created'), type: 'success' });
        onChanged?.();
        loadGroups();
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
      setCreating(false);
    }
  };

  const handleStartEdit = (g: BookGroupItem) => {
    setEditingId(g.id);
    setEditingName(g.name);
  };

  const handleSaveEdit = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/book-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        setEditingId(null);
        setEditingName('');
        eventDispatcher.dispatch('toast', { message: _('Group updated'), type: 'success' });
        onChanged?.();
        loadGroups();
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
      setSaving(false);
    }
  };

  const handleDelete = async (g: BookGroupItem) => {
    if (!confirm(_('Delete group "{{name}}"? Books in this group will be ungrouped.', { name: g.name }))) return;
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/book-groups/${g.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        eventDispatcher.dispatch('toast', { message: _('Group deleted'), type: 'success' });
        onChanged?.();
        loadGroups();
      } else {
        const err = await resp.json();
        eventDispatcher.dispatch('toast', { message: err.error || _('Failed'), type: 'error' });
      }
    } catch (err) {
      eventDispatcher.dispatch('toast', {
        message: err instanceof Error ? err.message : _('Failed'),
        type: 'error',
      });
    }
  };

  const handleMoveOrder = async (g: BookGroupItem, delta: number) => {
    const newOrder = Math.max(0, g.sortOrder + delta);
    try {
      const token = await getAccessToken();
      const resp = await fetch(`${getAPIBaseUrl()}/book-groups/${g.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sortOrder: newOrder }),
      });
      if (resp.ok) {
        loadGroups();
      }
    } catch {
      /* ignore */
    }
  };

  const filteredGroups = searchQuery.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : groups;

  if (!isBrowser()) return null;
  return createPortal(
    <div className='fixed inset-0 z-[200] flex items-center justify-center bg-black/60'>
      <div className='bg-base-100 rounded-lg shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col'>
        <div className='flex items-center justify-between p-4 border-b border-base-200'>
          <h2 className='text-lg font-bold'>{_('Group Management')}</h2>
          <button onClick={onClose} className='btn btn-ghost btn-sm btn-square' title={_('Close')}>
            <IoClose className='w-5 h-5' />
          </button>
        </div>

        {/* 新建分组 */}
        <div className='p-4 border-b border-base-200 flex gap-2'>
          <input
            type='text'
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={_('New group name')}
            className='input input-bordered input-sm flex-1'
            maxLength={100}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className='btn btn-primary btn-sm gap-1'
          >
            <IoAddOutline className='w-4 h-4' />
            {_('Add')}
          </button>
        </div>

        {/* 搜索 */}
        <div className='p-3 border-b border-base-200'>
          <div className='relative'>
            <IoSearchOutline className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={_('Search groups')}
              className='input input-bordered input-sm pl-9 w-full'
            />
          </div>
        </div>

        {/* 分组列表（可滚动） */}
        <div className='flex-1 overflow-y-auto p-3 space-y-2'>
          {loading && (
            <div className='text-center py-6 opacity-50 text-sm'>
              <span className='loading loading-spinner loading-sm' />
            </div>
          )}
          {!loading && filteredGroups.length === 0 && (
            <div className='text-center py-6 opacity-50 text-sm'>
              {searchQuery.trim() ? _('No groups found') : _('No groups yet')}
            </div>
          )}
          {filteredGroups.map((g, idx) => (
            <div
              key={g.id}
              className='flex items-center gap-2 bg-base-200/50 rounded-lg p-2.5 hover:bg-base-200 transition-colors'
            >
              {editingId === g.id ? (
                <>
                  <input
                    type='text'
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(g.id);
                      if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                    }}
                    autoFocus
                    maxLength={100}
                    className='input input-bordered input-sm flex-1'
                  />
                  <button
                    onClick={() => handleSaveEdit(g.id)}
                    disabled={saving}
                    className='btn btn-primary btn-xs'
                  >
                    {saving ? <span className='loading loading-spinner loading-xs' /> : _('Save')}
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditingName(''); }}
                    className='btn btn-ghost btn-xs'
                  >
                    {_('Cancel')}
                  </button>
                </>
              ) : (
                <>
                  <div className='flex flex-col gap-0.5'>
                    <button
                      onClick={() => handleMoveOrder(g, -1)}
                      disabled={idx === 0}
                      className='btn btn-ghost btn-xs btn-square h-5 w-5 min-h-5 p-0 disabled:opacity-30'
                      title={_('Move up')}
                    >
                      <IoArrowUpOutline className='w-3 h-3' />
                    </button>
                    <button
                      onClick={() => handleMoveOrder(g, 1)}
                      disabled={idx === filteredGroups.length - 1}
                      className='btn btn-ghost btn-xs btn-square h-5 w-5 min-h-5 p-0 disabled:opacity-30'
                      title={_('Move down')}
                    >
                      <IoArrowDownOutline className='w-3 h-3' />
                    </button>
                  </div>
                  <div className='flex-1 font-medium truncate'>{g.name}</div>
                  <button
                    onClick={() => handleStartEdit(g)}
                    className='btn btn-ghost btn-xs btn-square'
                    title={_('Edit')}
                  >
                    <IoCreateOutline className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => handleDelete(g)}
                    className='btn btn-ghost btn-xs btn-square text-error'
                    title={_('Delete')}
                  >
                    <IoTrashOutline className='w-4 h-4' />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className='px-4 py-2 border-t border-base-200 text-xs text-base-content/50 text-center'>
          {filteredGroups.length} {_('groups')}
        </div>
      </div>
    </div>,
    document.body,
  );
}
