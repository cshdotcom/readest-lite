// 改造自原 src/libs/shareServer.ts。
// supabase → prisma；resolveActiveShare 逻辑与原版完全一致。
// v8.18.3: feed:// 书籍无文件 — share 通过 bookHash 在 library_books 表里
// 找原书的 metadata.feedUrl，recipient 用 descriptor 重建订阅。源书籍
// 被删除 → 返回 source_deleted（仍由原逻辑处理）。
import { customAlphabet } from 'nanoid';
import { prismaClient } from '@/utils/db';

const SHARE_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHARE_TOKEN_LENGTH = 22;
const generator = customAlphabet(SHARE_TOKEN_ALPHABET, SHARE_TOKEN_LENGTH);

const SHARE_TOKEN_REGEX = new RegExp(`^[${SHARE_TOKEN_ALPHABET}]{${SHARE_TOKEN_LENGTH}}$`);

export const isValidShareToken = (token: unknown): token is string =>
  typeof token === 'string' && SHARE_TOKEN_REGEX.test(token);

export const generateShareToken = async (): Promise<{ raw: string; hash: string }> => {
  const raw = generator();
  const hash = await hashShareToken(raw);
  return { raw, hash };
};

export const hashShareToken = async (raw: string): Promise<string> => {
  const data = new TextEncoder().encode(raw);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export type ShareLookupRejection =
  | { kind: 'invalid_token' }
  | { kind: 'not_found' }
  | { kind: 'revoked' }
  | { kind: 'expired' }
  | { kind: 'source_deleted' }
  | { kind: 'lookup_failed'; detail?: string };

export interface ResolvedShare {
  id: string; userId: string; bookHash: string; bookTitle: string;
  bookAuthor: string | null; bookFormat: string; bookSize: number;
  cfi: string | null; expiresAt: string; revokedAt: string | null;
  downloadCount: number; createdAt: string;
  bookFileKey: string; coverFileKey: string | null;
  /**
   * v8.18.3: feed:// books carry no book file. When this is true the share
   * still resolves successfully — recipients read bookUrl + feedUrl from
   * the BookShare row and rebuild the subscription locally.
   */
  isFeedBook?: boolean;
  /** feed:// descriptor URL — set when isFeedBook is true. */
  bookUrl?: string | null;
}

const isCoverKey = (fileKey: string): boolean => /\.(png|jpe?g|webp|gif)$/i.test(fileKey);

export const resolveActiveShare = async (
  rawToken: string,
): Promise<{ ok: true; share: ResolvedShare } | { ok: false; reason: ShareLookupRejection }> => {
  if (!isValidShareToken(rawToken)) return { ok: false, reason: { kind: 'invalid_token' } };

  const tokenHash = await hashShareToken(rawToken);
  const row = await prismaClient.bookShare.findUnique({ where: { tokenHash } });
  if (!row) return { ok: false, reason: { kind: 'not_found' } };
  if (row.revokedAt) return { ok: false, reason: { kind: 'revoked' } };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: { kind: 'expired' } };

  const isFeedBook = !!row.bookUrl && row.bookUrl.startsWith('feed://');

  // v8.18.4: feed:// 分享 — owner 删除书时 delete.ts 自动 revoke BookShare 行，
  // 所以 row.revokedAt 检查（上面）已经覆盖了 owner 删除的情况。
  // feed:// 不需要在 files 表里查 bookFile — 它没有文件，只有 descriptor。
  // 但仍需要查 cover（feed 书也有 cover.png 用于书架展示）。
  const files = await prismaClient.file.findMany({
    where: { userId: row.userId, bookHash: row.bookHash, deletedAt: null },
    select: { fileKey: true },
  });
  const bookFile = files.find((f) => !isCoverKey(f.fileKey));
  const coverFile = files.find((f) => isCoverKey(f.fileKey));

  // 普通书籍：owner 删除文件 → files 表没匹配行 → source_deleted
  // feed:// 书籍：上面 row.revokedAt 检查已覆盖删除场景
  if (!bookFile && !isFeedBook) {
    return { ok: false, reason: { kind: 'source_deleted' } };
  }

  return {
    ok: true,
    share: {
      id: row.id, userId: row.userId, bookHash: row.bookHash,
      bookTitle: row.bookTitle, bookAuthor: row.bookAuthor,
      bookFormat: row.bookFormat, bookSize: Number(row.bookSize),
      cfi: row.cfi, expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
      downloadCount: row.downloadCount, createdAt: row.createdAt.toISOString(),
      // For feed books, bookFileKey/coverFileKey may be empty/cover-only.
      // Recipient endpoints route to feed:// descriptor handling instead.
      bookFileKey: bookFile?.fileKey ?? '',
      coverFileKey: coverFile?.fileKey ?? null,
      isFeedBook,
      bookUrl: row.bookUrl,
    },
  };
};

export const rejectionToHttp = (
  reason: ShareLookupRejection,
): { status: number; body: { error: string; code?: string } } => {
  switch (reason.kind) {
    case 'invalid_token': return { status: 400, body: { error: 'Invalid share token', code: 'invalid_token' } };
    case 'not_found': return { status: 404, body: { error: 'Share not found', code: 'not_found' } };
    case 'revoked': return { status: 410, body: { error: 'Share has been revoked', code: 'revoked' } };
    case 'expired': return { status: 410, body: { error: 'Share has expired', code: 'expired' } };
    case 'source_deleted': return { status: 410, body: { error: 'Shared book is no longer available', code: 'source_deleted' } };
    case 'lookup_failed':
      console.error('Share lookup failed:', reason.detail);
      return { status: 500, body: { error: 'Could not look up share' } };
  }
};
