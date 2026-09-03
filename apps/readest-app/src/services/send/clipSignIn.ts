// Lite stub — clip sign-in is iOS-only (requires SafariViewController)
import type { ConvertedBook } from './conversion/types';
export const clipSignIn = async (): Promise<void> => {};
export const isClipCancelled = (_e?: unknown): boolean => false;
export const clipPageWithSignInFallback = async (): Promise<ConvertedBook | null> => null;
