/**
 * Lite stub for `@/libs/statsArchive`.
 * Reading-statistics archive (R2 + PostgREST tiered storage) requires Cloudflare
 * R2 buckets and PostgREST endpoints. Lite is self-hosted with no R2 backend.
 * Stubs return empty/default values so sync/user-delete pages stay consistent.
 */

export const SEGMENT_VERSION = 1 as const;

export interface ArchivedPageRow {
  [key: string]: unknown;
}

export interface StatsSegment {
  updatedToMs?: number;
  rows?: ArchivedPageRow[];
}

export interface StatArchiveManifestRow {
  user_id: string;
  updated_to_ms: number;
  segment_version: number;
}

export interface R2ObjectBodyLike {
  text: () => Promise<string>;
}

export interface R2BucketLike {
  get: (key: string) => Promise<R2ObjectBodyLike | null>;
  delete: (key: string) => Promise<void>;
  list: (opts?: { prefix?: string }) => Promise<{ key: string }[]>;
}

export interface AnalyticsEngineDatasetLike {
  [key: string]: unknown;
}

export interface StatsArchiveEnv {
  STATS_ARCHIVE_R2?: R2BucketLike;
  STATS_ARCHIVE_DURABLE_OBJECT?: unknown;
  STATS_ARCHIVE_DATASET?: AnalyticsEngineDatasetLike;
  STATS_ARCHIVE_CLOUDFLARE_ACCOUNT_ID?: string;
  STATS_ARCHIVE_CLOUDFLARE_API_TOKEN?: string;
  STATS_ARCHIVE_POSTGREST_URL?: string;
  STATS_ARCHIVE_POSTGREST_JWT_SECRET?: string;
  STATS_ARCHIVE_COMPACTION_ENABLED?: string;
}

export const getStatsArchiveEnv = (): Partial<StatsArchiveEnv> => {
  // Lite has no stats archive backend; return empty env.
  return {};
};

export const tsToMs = (ts: string): number => (ts ? new Date(ts).getTime() : 0);

const SEGMENT_KEY_PREFIX = 'stat-archive/';

export const segmentKey = (userId: string, updatedToMs: number) =>
  `${SEGMENT_KEY_PREFIX}${userId}/${updatedToMs}.json`;

export const userSegmentPrefix = (userId: string) =>
  `${SEGMENT_KEY_PREFIX}${userId}/`;

export function encodeSegment(_seg: StatsSegment): string {
  return '{}';
}

export function decodeSegment(_text: string): StatsSegment {
  return { rows: [] };
}

export function takePage(_seg: StatsSegment, _until: number): ArchivedPageRow[] {
  return [];
}

export const toWireStatPage = (
  _r: ArchivedPageRow,
  _userId: string,
): Record<string, unknown> => ({});

export class SegmentUnavailableError extends Error {
  constructor(message = 'Stats segment unavailable in Readest Lite') {
    super(message);
    this.name = 'SegmentUnavailableError';
  }
}

export async function readSegment(
  _bucket: R2BucketLike,
  _key: string,
): Promise<StatsSegment | null> {
  return null;
}

export async function deleteUserSegments(
  _bucket: R2BucketLike,
  _userId: string,
): Promise<number> {
  return 0;
}

export type ArchiveGuardResult = { ok: true } | { ok: false; error: string };

export function guardArchiveRequest(_env: Partial<StatsArchiveEnv>): ArchiveGuardResult {
  return { ok: false, error: 'Stats archive is not configured in Readest Lite' };
}

export const isCompactionEnabled = (env: Partial<StatsArchiveEnv>) =>
  String(env.STATS_ARCHIVE_COMPACTION_ENABLED ?? '') === '1';

export interface CompactConfig {
  windowDays: number;
  rowCap: number;
}

export function readCompactConfig(_env: Partial<StatsArchiveEnv>): CompactConfig {
  return { windowDays: 7, rowCap: 5000 };
}
