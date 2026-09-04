/**
 * Lite stub for `@/services/sync/providers/onedrive/onedriveConnect`.
 * OneDrive cloud sync requires Microsoft OAuth credentials.
 * Lite is self-hosted and uses local filesystem; not applicable.
 */

export interface ConnectOneDriveResult {
  ok: boolean;
  error?: string;
  accountLabel?: string;
}

export const runOneDriveConnect = async (): Promise<ConnectOneDriveResult> => ({
  ok: false,
  error: 'OneDrive sync is not supported in Readest Lite',
});

export const runOneDriveDisconnect = async (): Promise<void> => {
  // No-op in Lite
};
