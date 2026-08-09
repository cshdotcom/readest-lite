// Lite stub for cloudSyncProvider — Lite doesn't have cloud sync providers
// (Readest Cloud, OneDrive, Google Drive, S3). All functions return empty/no-op.
import type { SystemSettings } from '@/types/settings';
import type { FileSyncBackendKind } from '@/services/sync/file/providerRegistry';

export type CloudSyncProviderKind = 'readest' | FileSyncBackendKind;

export const settingsKeyForBackend = (kind: CloudSyncProviderKind): string => `${kind}SyncEnabled`;

export const cloudProviderDisplayName = (kind: CloudSyncProviderKind): string => {
  switch (kind) {
    case 'readest': return 'Readest Cloud';
    case 'webdav': return 'WebDAV';
    default: return String(kind);
  }
};

export const getEnabledFileSyncBackends = (_settings: SystemSettings | null | undefined): FileSyncBackendKind[] => [];

export const hasAnyThirdPartyEnabled = (_settings: SystemSettings | null | undefined): boolean => false;

export const isReadestCloudEnabled = (_settings: SystemSettings | null | undefined): boolean => false;

export const getCloudSyncProviders = (_settings: SystemSettings | null | undefined): CloudSyncProviderKind[] => [];

export const cloudProvidersDisplayName = (_kinds: CloudSyncProviderKind[]): string => '';

export interface CloudSyncGate {
  /** Readest Cloud syncs the library channels (rows, progress, notes, files). */
  readest: boolean;
  /** Third-party backends the user switched on, in the fixed webdav/gdrive/s3/onedrive/icloud order. */
  backends: FileSyncBackendKind[];
  /** True when third-party backends are switched on but the plan does not allow cloud sync. */
  paused: boolean;
}

export const resolveCloudSyncGate = (
  _settings: SystemSettings | null | undefined,
): CloudSyncGate => ({
  readest: false,
  backends: [],
  paused: false,
});

export const getActiveFileSyncBackends = (
  _settings: SystemSettings | null | undefined,
): FileSyncBackendKind[] => [];

export const applySyncBooksAutoEnable = (_settings: SystemSettings): boolean => false;

export const isReadestCloudStorageActive = (_settings: SystemSettings | null | undefined): boolean => false;
