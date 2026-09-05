import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { pullEncryptedSettings } from '@/services/sync/encryptedSettingsSync';
import type { SystemSettings } from '@/types/settings';
import type { ViewSettings } from '@/types/book';

export const useLibrary = () => {
  const { envConfig } = useEnv();
  const { setLibrary, libraryLoaded: storeLibraryLoaded } = useLibraryStore();
  const { setSettings, saveSettings } = useSettingsStore();
  // Skip the disk reload when another mount has already populated the store —
  // re-reading would clobber transient in-memory entries (e.g. OPDS-PSE
  // streamed books) that aren't persisted to disk.
  const [libraryLoaded, setLibraryLoaded] = useState(storeLibraryLoaded);
  const isInitiating = useRef(false);

  useEffect(() => {
    if (isInitiating.current || storeLibraryLoaded) {
      if (storeLibraryLoaded && !libraryLoaded) {
        setLibraryLoaded(true);
      }
      return;
    }
    isInitiating.current = true;
    const initLibrary = async () => {
      const appService = await envConfig.getAppService();
      const settings = await appService.loadSettings();

      // v8.18.4: Pull encrypted settings from server and merge.
      // Best-effort — if vault isn't unlocked or no remote copy exists,
      // we keep the local settings as-is.
      try {
        const remoteSystem = await pullEncryptedSettings<SystemSettings>('system');
        if (remoteSystem) {
          // Last-writer-wins merge: remote overrides local for fields that
          // differ, but we keep local-only fields (like libraryHashes).
          const merged = { ...settings, ...remoteSystem.settings };
          // Preserve local globalView/Read if remote doesn't have them
          if (!remoteSystem.settings.globalViewSettings && settings.globalViewSettings) {
            merged.globalViewSettings = settings.globalViewSettings;
          }
          if (!remoteSystem.settings.globalReadSettings && settings.globalReadSettings) {
            merged.globalReadSettings = settings.globalReadSettings;
          }
          setSettings(merged);
          // Persist merged settings locally so the next boot is fast
          await saveSettings(envConfig, merged);
          setSettings(merged);
        } else {
          setSettings(settings);
        }

        // Pull global view/read settings independently
        const remoteView = await pullEncryptedSettings<ViewSettings>('global_view');
        if (remoteView) {
          const merged = { ...settings, globalViewSettings: remoteView.settings };
          setSettings(merged);
        }
        const remoteRead = await pullEncryptedSettings<ViewSettings>('global_read');
        if (remoteRead) {
          const merged = { ...settings, globalReadSettings: remoteRead.settings };
          setSettings(merged);
        }
      } catch {
        // Remote pull failed — keep local settings
        setSettings(settings);
      }

      setLibrary(await appService.loadLibraryBooks());
      setLibraryLoaded(true);
    };

    initLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLibraryLoaded]);

  return { libraryLoaded };
};
