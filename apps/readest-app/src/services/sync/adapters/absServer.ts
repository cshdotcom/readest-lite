/**
 * Lite stub for `@/services/sync/adapters/absServer`.
 * ABS (Audiobookshelf) replica adapter — not applicable to web-only Lite.
 */

import type { Book } from '@/types/book';

export interface ReplicaAdapter<T> {
  kind: string;
  list: () => Promise<T[]>;
  findByContentId: (id: string) => T | undefined;
  hydrateLocalStore: (envConfig?: unknown) => Promise<void>;
  applyRemote: (item: T) => Promise<void>;
  softDeleteByContentId: (id: string) => Promise<void>;
}

export interface ABSServer {
  id: string;
  name: string;
  url: string;
}

export const absServerAdapter: ReplicaAdapter<ABSServer> = {
  kind: 'absServer',
  list: async () => [],
  findByContentId: () => undefined,
  hydrateLocalStore: async () => {
    // No-op in Lite
  },
  applyRemote: async () => {
    // No-op in Lite
  },
  softDeleteByContentId: async () => {
    // No-op in Lite
  },
};
