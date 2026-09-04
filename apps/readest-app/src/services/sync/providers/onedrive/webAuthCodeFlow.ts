/**
 * Lite stub for `@/services/sync/providers/onedrive/webAuthCodeFlow`.
 * OneDrive web OAuth code flow — not supported in self-hosted Lite.
 */

export const WEB_OAUTH_CALLBACK_PATH = '/onedrive-callback';

export const oneDriveWebRedirectUri = (): string => '';

export interface TokenSet {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export const beginWebOneDriveRedirect = async (_args: {
  redirectAfterAuth?: string;
}): Promise<void> => {
  throw new Error('OneDrive OAuth is not supported in Readest Lite');
};

export const consumeWebOAuthState = (): string | null => null;
export const consumeWebPkceVerifier = (): string | null => null;
export const consumeReturnPath = (): string => '/library';

export const exchangeWebAuthCode = async (_args: {
  code: string;
  verifier: string;
}): Promise<TokenSet> => {
  throw new Error('OneDrive OAuth is not supported in Readest Lite');
};

export const saveWebOneDriveToken = (_tokens: TokenSet): void => {
  // No-op in Lite
};

export const loadWebOneDriveToken = (): TokenSet | null => null;

export const clearWebOneDriveToken = (): void => {
  // No-op in Lite
};

export const hasValidWebOneDriveToken = (_now: number = Date.now()): boolean =>
  false;

export interface TokenPersistence {
  save: (tokens: TokenSet) => void;
  load: () => TokenSet | null;
  clear: () => void;
}

export const webOneDriveTokenPersistence: TokenPersistence = {
  save: saveWebOneDriveToken,
  load: loadWebOneDriveToken,
  clear: clearWebOneDriveToken,
};
