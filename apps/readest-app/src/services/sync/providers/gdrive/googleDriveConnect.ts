/**
 * Lite stub for `@/services/sync/providers/gdrive/googleDriveConnect`.
 * Google Drive cloud sync requires native OAuth + Google API credentials.
 * Lite is self-hosted and uses local filesystem; not applicable.
 */

export interface ConnectGoogleDriveResult {
  ok: boolean;
  error?: string;
  accountLabel?: string;
}

export const runGoogleDriveConnect = async (): Promise<ConnectGoogleDriveResult> => ({
  ok: false,
  error: 'Google Drive sync is not supported in Readest Lite',
});

export const runGoogleDriveDisconnect = async (): Promise<void> => {
  // No-op in Lite
};
