import i18n from '@/i18n/i18n';
import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { initDayjs } from '@/utils/time';
import { broadcastGlobalSettings } from '@/utils/settingsSync';
import { pushEncryptedSettings } from '@/services/sync/encryptedSettingsSync';
import { pushReadingStats } from '@/services/sync/statsSync';

export type FontPanelView = 'main-fonts' | 'custom-fonts';

interface SettingsState {
  settings: SystemSettings;
  settingsDialogBookKey: string;
  isSettingsDialogOpen: boolean;
  fontPanelView: FontPanelView;
  activeSettingsItemId: string | null;
  /**
   * Deep-link target — when set before opening the Settings dialog, the dialog
   * mounts with this panel pre-selected (instead of the lastConfigPanel from
   * localStorage). Cleared by the dialog after consumption.
   */
  requestedPanel: string | null;
  /**
   * Optional sub-page hint paired with `requestedPanel`. When the requested
   * panel renders nested sub-pages (e.g. Integrations → KOSync / Readwise /
   * Hardcover / OPDS), this string tells the panel which one to drill into.
   * Cleared by the panel after consumption. Format is panel-specific —
   * Integrations recognises 'kosync' | 'readwise' | 'hardcover' | 'opds'.
   */
  requestedSubPage: string | null;
  setSettings: (settings: SystemSettings) => void;
  saveSettings: (envConfig: EnvConfigType, settings: SystemSettings) => Promise<void>;
  setSettingsDialogBookKey: (bookKey: string) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setFontPanelView: (view: FontPanelView) => void;
  setActiveSettingsItemId: (id: string | null) => void;
  setRequestedPanel: (panel: string | null) => void;
  setRequestedSubPage: (subPage: string | null) => void;

  applyUILanguage: (uiLanguage?: string) => void;
}

// v8.18.4: Debounce encrypted settings push — rapid settings changes
// (e.g. dragging a slider) shouldn't fire one PUT per change. 3s is long
// enough to coalesce a burst of edits but short enough that a deliberate
// "save and close" still fires promptly.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3000;

const scheduleEncryptedPush = (settings: SystemSettings): void => {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushEncryptedSettings('system', settings);
    // Also push globalView and globalRead settings if present
    if (settings.globalViewSettings) {
      void pushEncryptedSettings('global_view', settings.globalViewSettings);
    }
    if (settings.globalReadSettings) {
      void pushEncryptedSettings('global_read', settings.globalReadSettings);
    }
    pushTimer = null;
  }, DEBOUNCE_MS);
};

// v8.19.4: Reading stats sync — push a snapshot of local StatPage rows via
// the encrypted settings channel (scope='reading_stats'). Stats change
// far less frequently than settings (a flush only happens on page change
// or idle), so a longer 10s debounce is fine — it coalesces a burst of
// page flips without delaying a deliberate "stop reading and close" by
// more than 10s. The push reads from the per-tab StatisticsDb singleton
// (opened on demand) and serialises every local page_stat_data row.
let statsPushTimer: ReturnType<typeof setTimeout> | null = null;
const STATS_DEBOUNCE_MS = 10_000;

const scheduleReadingStatsPush = (envConfig: EnvConfigType): void => {
  if (statsPushTimer) clearTimeout(statsPushTimer);
  statsPushTimer = setTimeout(() => {
    statsPushTimer = null;
    void (async () => {
      try {
        const appService = await envConfig.getAppService();
        // Dynamic import keeps the statisticsDb module (and its heavy
        // DatabaseService wiring) out of the bundle of every page that
        // imports settingsStore but never reads a book (e.g. login).
        const { StatisticsDb } = await import('@/services/statistics/statisticsDb');
        const db = await StatisticsDb.open(appService);
        // getEventsForPush(0) = all events with start_time > 0 (i.e. every
        // local row). This is a snapshot — the server upserts by (bookHash,
        // page, startTime), so re-pushing identical rows is a no-op.
        const { events } = await db.getEventsForPush(0);
        if (events.length === 0) return;
        await pushReadingStats(events);
      } catch (err) {
        // Best-effort: a failure here (vault locked, db torn down, network)
        // must never surface as an unhandled rejection — settings sync is
        // not blocked by stats sync.
        console.warn('[settingsStore] reading stats push failed:', err);
      }
    })();
  }, STATS_DEBOUNCE_MS);
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {} as SystemSettings,
  settingsDialogBookKey: '',
  isSettingsDialogOpen: false,
  fontPanelView: 'main-fonts',
  activeSettingsItemId: null,
  requestedPanel: null,
  requestedSubPage: null,
  setSettings: (settings) => set({ settings }),
  saveSettings: async (envConfig: EnvConfigType, settings: SystemSettings) => {
    const appService = await envConfig.getAppService();
    await appService.saveSettings(settings);
    // Keep other open windows' in-memory global settings in sync so a stale
    // window doesn't clobber this write on its next save (issue #4580).
    void broadcastGlobalSettings(settings);
    // v8.18.4: Debounced encrypted push to server for cross-device sync.
    // Best-effort — if the vault isn't unlocked the push is a no-op.
    scheduleEncryptedPush(settings);
    // v8.19.4: Debounced reading-stats snapshot push. Best-effort, separate
    // timer so a heavy stats payload doesn't delay the user-facing settings
    // push (and vice versa).
    scheduleReadingStatsPush(envConfig);
  },
  setSettingsDialogBookKey: (bookKey) => set({ settingsDialogBookKey: bookKey }),
  setSettingsDialogOpen: (open) => set({ isSettingsDialogOpen: open }),
  setFontPanelView: (view) => set({ fontPanelView: view }),
  setActiveSettingsItemId: (id) => set({ activeSettingsItemId: id }),
  setRequestedPanel: (panel) => set({ requestedPanel: panel }),
  setRequestedSubPage: (subPage) => set({ requestedSubPage: subPage }),

  applyUILanguage: (uiLanguage?: string) => {
    const locale = uiLanguage ? uiLanguage : navigator.language;
    i18n.changeLanguage(locale);
    initDayjs(locale);
  },
}));
