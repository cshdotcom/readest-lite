/**
 * Lite stub for `@/services/sync/adapters/absServer`.
 * ABS (Audiobookshelf) replica adapter — not applicable to web-only Lite.
 * Implements the full ReplicaAdapter interface so the registry accepts it,
 * but every method returns empty/no-op since ABS is not available.
 */

import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaRow } from '@/types/replica';

export interface ABSServer {
  id: string;
  name: string;
  url: string;
  username?: string;
  token?: string;
  deletedAt?: number | null;
}

export const absServerAdapter: ReplicaAdapter<ABSServer> = {
  kind: 'abs_server',
  schemaVersion: 1,
  pack: (_replica: ABSServer) => ({}),
  unpack: (_fields: Record<string, unknown>) => ({ id: '', name: '', url: '' }),
  computeId: async (server: ABSServer) => server.id,
  unpackRow: (_row: ReplicaRow, _bundleDir: string) => null,
};
