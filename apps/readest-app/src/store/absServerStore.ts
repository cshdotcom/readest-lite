/**
 * Lite stub for `@/store/absServerStore`.
 * Audiobookshelf (ABS) server integration requires a configured ABS server
 * and native HTTP client. Lite is web-only and ships no ABS integration.
 * All consumers gate UI on `servers.length` so returning an empty list hides
 * every ABS UI surface.
 */

import { create } from 'zustand';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';

export interface ABSServer {
  id: string;
  name: string;
  url: string;
  username?: string;
  token?: string;
  deletedAt?: number | null;
}

export interface ABSServerStore {
  servers: ABSServer[];
  findByContentId: (id: string) => ABSServer | undefined;
  loadABSServers: (envConfig?: EnvConfigType) => Promise<void>;
  applyRemoteServer: (server: ABSServer) => Promise<void>;
  softDeleteByContentId: (id: string) => Promise<void>;
}

export const useABSServerStore = create<ABSServerStore>(() => ({
  servers: [],
  findByContentId: () => undefined,
  loadABSServers: async () => {
    // No-op in Lite
  },
  applyRemoteServer: async () => {
    // No-op in Lite
  },
  softDeleteByContentId: async () => {
    // No-op in Lite
  },
}));

/**
 * An ABS-book is "orphaned" when the ABS server that owns it has been
 * deleted from settings. In Lite, no books are ABS-books, so none can be
 * orphaned.
 */
export const isAbsBookOrphaned = (_book: Book): boolean => false;
