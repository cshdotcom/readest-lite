/**
 * Lite stub for `@/store/localsendStore`.
 * LocalSend (LAN book transfer) is a Tauri-native-only feature; Lite is web-only.
 * The stub provides the same store interface but with empty/default state so
 * any UI consumer renders as if LocalSend were disabled.
 */

import { create } from 'zustand';

export interface LocalSendDevice {
  id: string;
  hostname: string;
  ip: string;
  port: number;
}

export interface LocalSendStore {
  enabled: boolean;
  devices: LocalSendDevice[];
  refreshDevices: () => Promise<void>;
  sendBooks: (_device: LocalSendDevice, _bookHashes: string[]) => Promise<void>;
}

export const useLocalSendStore = create<LocalSendStore>(() => ({
  enabled: false,
  devices: [],
  refreshDevices: async () => {
    // No-op in Lite
  },
  sendBooks: async () => {
    throw new Error('LocalSend is not supported in Readest Lite');
  },
}));
