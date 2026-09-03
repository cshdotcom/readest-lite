// Lite stub — clip sign-in is iOS-only (requires SafariViewController)
import type { Book } from '@/types/book';
export const clipSignIn = async (): Promise<void> => {};
export const isClipCancelled = (_e?: unknown): boolean => false;
export const clipPageWithSignInFallback = async (): Promise<Book | null> => null;
