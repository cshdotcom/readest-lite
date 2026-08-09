// Lite stub for cloudSyncProvider — Lite doesn't have cloud sync providers
// (Readest Cloud, OneDrive, Google Drive, S3). All functions return empty/no-op.
import type { SystemSettings } from '@/types/settings';

export type CloudSyncProviderKind = 'readest' | 'webdav';

export const settingsKeyForBackend = (kind: CloudSyncProviderKind): string => `${kind}SyncEnabled`;

export const cloudProviderDisplayName = (kind: CloudSyncProviderKind): string => {
  switch (kind) {
    case 'readest': return 'Readest Cloud';
    case 'webdav': return 'WebDAV';
    default: return String(kind);
  }
};

export const getEnabledFileSyncBackends = (_settings: SystemSettings | null | undefined): CloudSyncProviderKind[] => [];

export const hasAnyThirdPartyEnabled = (_settings: SystemSettings | null | undefined): boolean => false;

export const isReadestCloudEnabled = (_settings: SystemSettings | null | undefined): boolean => false;

export const getCloudSyncProviders = (_settings: SystemSettings | null | undefined): CloudSyncProviderKind[] => [];

export const cloudProvidersDisplayName = (_kinds: CloudSyncProviderKind[]): string => '';

export interface CloudSyncGate {
  canSyncLibrary: boolean;
  canSyncFiles: boolean;
  canSyncTTSPacks: boolean;
  activeProvider: CloudSyncProviderKind | null;
}

export const resolveCloudSyncGate = (_settings: SystemSettings | null | undefined): CloudSyncGate => ({
  canSyncLibrary: false,
  canSyncFiles: false,
  canSyncTTSPacks: false,
  activeProvider: null,
});

export const getActiveFileSyncBackends = (_settings: SystemSettings | null | undefined): CloudSyncProviderKind[] => [];

export const applySyncBooksAutoEnable = (_settings: SystemSettings): boolean => false;

export const isReadestCloudStorageActive = (_settings: SystemSettings | null | undefined): boolean => false;
