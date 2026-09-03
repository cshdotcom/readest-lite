// Lite stub — cloud sync activation not available
export const activateCloudSync = (): void => {};
export const deactivateCloudSync = (): void => {};
export const isCloudSyncActive = (): boolean => false;
export const persistCloudProviderEnabled = async (
  _envConfig: unknown,
  _kind: string,
  _next: boolean,
): Promise<void> => {};
