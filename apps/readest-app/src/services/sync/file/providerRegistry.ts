/**
 * Lite: WebDAV-only file sync provider registry (no Google Drive).
 * The upstream version also supports Google Drive, but Lite doesn't have
 * the gdrive provider or OAuth client.
 */
import type { FileSyncProvider } from './provider';
import type { WebDAVSettings } from '@/types/settings';
import { createWebDAVProvider } from '@/services/sync/providers/webdav/WebDAVProvider';

export type FileSyncBackendKind = 'webdav';

/** Minimal settings the registry reads to pick + build backends. */
export interface FileSyncBackendsSettings {
  webdav?: WebDAVSettings;
}

/** The backends the user has switched on. */
export const getEnabledFileSyncBackends = (
  settings: FileSyncBackendsSettings,
): FileSyncBackendKind[] => {
  const enabled: FileSyncBackendKind[] = [];
  if (settings.webdav?.enabled) enabled.push('webdav');
  return enabled;
};

/**
 * Build the provider for one backend, or `null` when it cannot run here.
 */
export const createFileSyncProvider = async (
  kind: FileSyncBackendKind,
  settings: FileSyncBackendsSettings,
): Promise<FileSyncProvider | null> => {
  if (kind === 'webdav') {
    return settings.webdav ? createWebDAVProvider(settings.webdav) : null;
  }
  return null;
};
