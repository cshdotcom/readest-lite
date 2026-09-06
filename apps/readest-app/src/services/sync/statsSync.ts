/**
 * v8.19.4: Reading statistics sync (StatPage rows) over the encrypted
 * settings sync channel (UserSetting table, scope='reading_stats').
 *
 * Why: previously StatPage rows were only synced via KOSync (and our
 * /api/sync endpoint). KOSync only carries the *latest* progress for a
 * book — the full per-page-read history never left the device. Users on
 * multiple devices therefore lost their per-page timing data when they
 * switched devices. The encrypted settings sync channel already exists
 * (v8.18.4) and is end-to-end encrypted with the user's vault key, so we
 * reuse it instead of inventing a new endpoint.
 *
 * The payload is just `{ stats, pushedAt }` where `stats` is the local
 * page_stat_data rows serialized as `PageStatEvent[]`. On pull we apply
 * them with last-writer-wins per (bookHash, page, startTime) — exactly
 * the same merge strategy StatisticsDb.applyRemoteEvents already uses
 * (it keeps `max(duration)` per row), so we just hand the events to
 * applyRemoteEvents with an empty books array (book metadata is already
 * synced separately by /api/sync).
 */
import { pushEncryptedSettings, pullEncryptedSettings } from './encryptedSettingsSync';
import type { PageStatEvent } from '@/types/statistics';

export interface ReadingStatsPayload {
  /** Local page_stat_data rows serialized as PageStatEvent. */
  stats: PageStatEvent[];
  /** Wall-clock ms when this payload was pushed (for diagnostics only). */
  pushedAt: number;
}

/**
 * Push the local reading stats snapshot to the server as encrypted JSON.
 * Returns false if the vault isn't unlocked or the user isn't logged in —
 * callers should treat this as a no-op (best-effort sync, not a hard error).
 */
export const pushReadingStats = async (stats: PageStatEvent[]): Promise<boolean> => {
  const payload: ReadingStatsPayload = { stats, pushedAt: Date.now() };
  return pushEncryptedSettings('reading_stats', payload);
};

/**
 * Pull the latest reading stats snapshot from the server and decrypt it.
 * Returns null when:
 *   - vault isn't unlocked
 *   - no snapshot has been pushed yet (404)
 *   - decryption fails (wrong key / corrupted payload)
 */
export const pullReadingStats = async (): Promise<{
  settings: ReadingStatsPayload;
  updatedAt: string;
} | null> => {
  return pullEncryptedSettings<ReadingStatsPayload>('reading_stats');
};
