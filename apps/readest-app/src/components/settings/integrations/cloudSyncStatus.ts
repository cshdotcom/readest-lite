// Lite stub — cloud sync status not available
export const useCloudSyncActivation = (): void => {};
export const getThirdPartyRowStatus = (
  _t: unknown,
  _opts: { enabled: boolean; configured: boolean; lastSyncedAt?: number; kind?: string; syncing?: boolean; [key: string]: unknown },
): string => '';
export const getReadestCloudRowStatus = (
  _t: unknown,
  _opts: { signedIn: boolean; planLoading: boolean; plan?: string; [key: string]: unknown },
): string => '';
export const canToggleCloudProvider = (
  _opts?: { isPremium?: boolean; isConfigured?: boolean; isEnabled?: boolean; [key: string]: unknown },
): boolean => false;
