/**
 * Lite stub for `@/services/sync/cloudSyncActivation`.
 * Cloud sync provider activation — Lite is self-hosted with local filesystem,
 * so third-party cloud sync providers (Google Drive, OneDrive, iCloud, S3)
 * are not applicable. The stubs accept the same signatures so the forms
 * compile, but persisting returns the unchanged settings and activation
 * has no side effects.
 */

import type { SystemSettings } from '@/types/settings';
import type { EnvConfigType } from '@/services/environment';
import type { CloudSyncProviderKind } from '@/services/sync/cloudSyncProvider';

export const withCloudProviderEnabled = (
  settings: SystemSettings,
  _kind: CloudSyncProviderKind,
  _enabled: boolean,
): SystemSettings => {
  // No-op in Lite — return settings unchanged
  return settings;
};

export const persistCloudProviderEnabled = async (
  _envConfig: EnvConfigType,
  _kind: CloudSyncProviderKind,
  _enabled: boolean,
  _mutate: (settings: SystemSettings) => SystemSettings = (s) => s,
): Promise<SystemSettings> => {
  // No-op in Lite — return the current settings unchanged
  const current =
    (await import('@/store/settingsStore')).useSettingsStore.getState().settings ??
    ({} as SystemSettings);
  return current;
};
