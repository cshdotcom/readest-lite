// v8.19.0: 文件去重 + 引用计数工具
//
// 提供给 upload.ts / share import route / delete.ts 复用。
//
// 去重规则：
//   - 客户端在上传时已经计算了书籍内容 hash（book.hash = partialMD5(fileContent)）
//   - 服务端用此 hash 作为 contentHash 跨用户去重
//   - 第一个上传某本书的用户成为 owner（originalFileKey = NULL, refCount = 1）
//   - 后续上传同一本书（同 contentHash）的用户创建 reference row：
//       fileKey = <userId>/Readest/Books/<hash>/<filename>.<ext>
//       originalFileKey = <ownerUserId>/Readest/Books/<hash>/<filename>.<ext>
//       refCount = 0
//   - owner 的 refCount = 1 + 引用此文件的 reference 数
//
// 只对书籍本体（EPUB/PDF/MOBI/...）和 cover.png 去重；config.json 和 nav.json
// 是用户自己的阅读配置，必须每个用户独立存储。
import { prismaClient } from '@/utils/db';

// 与 libs/document.ts EXTS 对齐；加上 cover.png 系列扩展名
const DEDUP_EXTENSIONS = new Set([
  'epub', 'pdf', 'mobi', 'azw', 'azw3', 'cbz', 'fb2', 'fbz', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'webp', 'gif',
]);

// 从 fileKey 提取扩展名（小写、无点）
const extOfFileKey = (fileKey: string): string => {
  const basename = fileKey.split('/').pop() ?? '';
  const dot = basename.lastIndexOf('.');
  if (dot < 0) return '';
  return basename.slice(dot + 1).toLowerCase();
};

// 判断此 fileKey 是否参与去重（书籍本体 / cover；不含 config.json / nav.json）
export const isDedupableFileKey = (fileKey: string): boolean => {
  const ext = extOfFileKey(fileKey);
  return DEDUP_EXTENSIONS.has(ext);
};

export interface DedupOwnerRow {
  id: string;
  userId: string;
  fileKey: string;
  bookHash: string | null;
  contentHash: string | null;
  fileSize: bigint;
  originalFileKey: string | null;
  refCount: number;
}

export interface CreateReferenceResult {
  kind: 'reference';
  fileId: string;
  ownerFileKey: string;
}

export interface CreateOwnerResult {
  kind: 'owner';
  fileId: string;
}

export type DedupCreateResult = CreateReferenceResult | CreateOwnerResult;

/**
 * 找到另一个用户拥有的、同 bookHash + 同扩展名、未软删的 owner row。
 * owner row 的定义：originalFileKey IS NULL（即物理文件归属此 row）。
 * 用扩展名过滤以避免 cover.png 与 .epub 互相去重。
 */
const findOwnerForDedup = async (
  bookHash: string,
  ext: string,
  excludeUserId: string,
): Promise<DedupOwnerRow | null> => {
  // SQLite 不支持 Prisma 的字符串 endsWith 直接走索引，但我们已经按
  // (content_hash, deleted_at) 建了 idx_files_content_hash_deleted，先
  // 用这两个条件拉一组，再在 JS 里按 ext + originalFileKey IS NULL 过滤。
  // 单个 bookHash 下的 files 行数很少（通常 1-2 行），无需更复杂的 SQL。
  const candidates = await prismaClient.file.findMany({
    where: {
      bookHash,
      deletedAt: null,
      originalFileKey: null,
      userId: { not: excludeUserId },
    },
  });
  for (const c of candidates) {
    if (extOfFileKey(c.fileKey) === ext) {
      return {
        id: c.id,
        userId: c.userId,
        fileKey: c.fileKey,
        bookHash: c.bookHash,
        contentHash: c.contentHash,
        fileSize: c.fileSize,
        originalFileKey: c.originalFileKey,
        refCount: c.refCount,
      };
    }
  }
  return null;
};

export interface CreateFileArgs {
  userId: string;
  bookHash: string | null;
  fileKey: string;
  fileSize: bigint;
  replicaKind?: string | null;
  replicaId?: string | null;
}

/**
 * 探测是否可以跨用户去重（不创建行）。返回 owner row 或 null。
 *
 * 用于 share import 这种"先看是否可去重，不行再走 copyObject 回退"的场景：
 * 调用方先调此函数判断，再决定是 createFileWithDedup 还是手动创建 + copyObject。
 *
 * 注意：调用方拿到 owner 后仍应调 createFileWithDedup 来创建 reference 行 +
 * 递增 refCount，避免双写竞态。
 */
export const probeDedupOwner = async (
  bookHash: string,
  fileKey: string,
  excludeUserId: string,
): Promise<DedupOwnerRow | null> => {
  if (!isDedupableFileKey(fileKey)) return null;
  const ext = extOfFileKey(fileKey);
  return findOwnerForDedup(bookHash, ext, excludeUserId);
};

/**
 * 在 upload / share import 路径上创建一个新的 File 行，必要时跨用户去重。
 *
 * - 如果 fileKey 不可去重（config.json / nav.json 等），直接创建 owner 行。
 * - 如果可去重，且找到另一个用户的 owner row（同 bookHash + 同扩展名）：
 *     创建 reference 行（originalFileKey = owner.fileKey, refCount = 0），
 *     并把 owner.refCount + 1。返回 { kind: 'reference', ... }。
 * - 否则创建 owner 行（originalFileKey = NULL, refCount = 1, contentHash = bookHash）。
 *
 * bookHash 为 null 时不参与去重（例如副本上传无 hash 的辅助文件）。
 */
export const createFileWithDedup = async (
  args: CreateFileArgs,
): Promise<DedupCreateResult> => {
  const { userId, bookHash, fileKey, fileSize, replicaKind, replicaId } = args;

  // 无 bookHash 或不可去重文件 → 直接创建 owner 行
  if (!bookHash || !isDedupableFileKey(fileKey)) {
    const owner = await prismaClient.file.create({
      data: {
        userId,
        bookHash,
        contentHash: bookHash,
        fileKey,
        fileSize,
        replicaKind: replicaKind ?? null,
        replicaId: replicaId ?? null,
        originalFileKey: null,
        refCount: 1,
      },
    });
    return { kind: 'owner', fileId: owner.id };
  }

  const ext = extOfFileKey(fileKey);
  const owner = await findOwnerForDedup(bookHash, ext, userId);
  if (!owner) {
    // 没有可去重的 owner → 自己成为 owner
    const newOwner = await prismaClient.file.create({
      data: {
        userId,
        bookHash,
        contentHash: bookHash,
        fileKey,
        fileSize,
        replicaKind: replicaKind ?? null,
        replicaId: replicaId ?? null,
        originalFileKey: null,
        refCount: 1,
      },
    });
    return { kind: 'owner', fileId: newOwner.id };
  }

  // 去重：创建 reference 行，并把 owner.refCount + 1
  const ref = await prismaClient.file.create({
    data: {
      userId,
      bookHash,
      contentHash: bookHash,
      fileKey,
      fileSize: owner.fileSize,
      replicaKind: replicaKind ?? null,
      replicaId: replicaId ?? null,
      originalFileKey: owner.fileKey,
      refCount: 0,
    },
  });
  await prismaClient.file.update({
    where: { id: owner.id },
    data: { refCount: { increment: 1 } },
  });
  return { kind: 'reference', fileId: ref.id, ownerFileKey: owner.fileKey };
};

export interface FileDeleteHandleResult {
  /** 是否物理删除了文件（owner refCount 归 0） */
  physicalDeleted: boolean;
  /** 被物理删除的 fileKey（如果有） */
  deletedFileKey?: string;
}

/**
 * 处理用户 File 行的删除：根据是否是 reference 行决定如何处理 owner / 物理文件。
 *
 * 1. 如果是 reference 行（originalFileKey != null）：
 *    - 硬删除自己的 reference 行
 *    - 把 owner.refCount - 1（owner 行可能已被其原 owner 软删，但仍保留在 DB
 *      里跟踪 refCount；用 fileKey 查找，不过滤 deletedAt）
 *    - 如果 owner.refCount 降到 0，物理删除 owner 的文件并硬删除 owner 行
 *
 * 2. 如果是 owner 行（originalFileKey == null）：
 *    - 把 refCount - 1
 *    - 如果 refCount 降到 0：物理删除自己的文件 + 硬删除自己的行
 *    - 如果 refCount > 0：保留物理文件，软删自己的行（deletedAt = now）。
 *      其他 reference 用户的 originalFileKey 仍指向此 fileKey，物理文件仍在
 *      磁盘上；DB 行保留以继续跟踪 refCount，但 deletedAt 标记让此用户不再
 *      看到此书。
 *
 * 注意：调用方应已确认此行属于当前用户且未软删。
 */
export const deleteFileWithRefCount = async (
  fileRow: {
    id: string;
    userId: string;
    fileKey: string;
    originalFileKey: string | null;
    refCount: number;
  },
  deleteObjectFn: (fileKey: string) => Promise<void>,
): Promise<FileDeleteHandleResult> => {
  if (fileRow.originalFileKey) {
    // reference 行：硬删自己 + 把 owner.refCount - 1
    await prismaClient.file.delete({ where: { id: fileRow.id } });

    // 用 fileKey 查 owner 行（不过滤 deletedAt — owner 可能已被软删）
    const owner = await prismaClient.file.findFirst({
      where: { fileKey: fileRow.originalFileKey, originalFileKey: null },
    });
    if (owner) {
      const newCount = Math.max(0, owner.refCount - 1);
      if (newCount === 0) {
        try {
          await deleteObjectFn(owner.fileKey);
        } catch (err) {
          console.error('deleteFileWithRefCount: physical delete failed:', err);
        }
        await prismaClient.file.delete({ where: { id: owner.id } }).catch(() => {});
        return { physicalDeleted: true, deletedFileKey: owner.fileKey };
      }
      await prismaClient.file.update({
        where: { id: owner.id },
        data: { refCount: newCount },
      });
    }
    return { physicalDeleted: false };
  }

  // owner 行：refCount - 1
  const newCount = Math.max(0, fileRow.refCount - 1);
  if (newCount === 0) {
    // 无引用 → 物理删除 + 硬删行
    try {
      await deleteObjectFn(fileRow.fileKey);
    } catch (err) {
      console.error('deleteFileWithRefCount: physical delete failed:', err);
    }
    await prismaClient.file.delete({ where: { id: fileRow.id } });
    return { physicalDeleted: true, deletedFileKey: fileRow.fileKey };
  }

  // 仍有引用 → 物理文件保留，软删自己的行（deletedAt = now），refCount 减 1
  await prismaClient.file.update({
    where: { id: fileRow.id },
    data: { refCount: newCount, deletedAt: new Date() },
  });
  return { physicalDeleted: false };
};
