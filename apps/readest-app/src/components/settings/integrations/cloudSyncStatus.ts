// Lite stub — cloud sync status not available
export const useCloudSyncActivation = (): void => {};
export const getThirdPartyRowStatus = (
  _t: unknown,
  _opts: {
    enabled: boolean;
    configured: boolean;
    lastSyncedAt?: number;
    kind?: string;
    syncing?: boolean;
    [key: string]: unknown;
  },
): null => null;
export const getReadestCloudRowStatus = (): null => null;
export const canToggleCloudProvider = (): boolean => false;
