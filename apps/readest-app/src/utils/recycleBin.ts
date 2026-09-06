// v8.19.0: 回收站工具 — 在 storage/delete.ts 和 recycle-bin 路由之间复用
//
// 流程：
//   - 用户删除书 → /api/storage/delete 调用 moveToRecycleBin：
//       1. 查 Book row（by userId + bookHash），拿到 title/format
//       2. 软删 File row（deletedAt = now），不动 refCount 或物理文件
//       3. 标记 Book.deletedAt = now（幂等 — 客户端通常已同步过）
//       4. 创建 RecycleBinItem（同 user+bookHash 已有则更新 expiresAt）
//   - 还原 → /api/recycle-bin/restore 调用 restoreFromRecycleBin：
//       1. 查 RecycleBinItem by id + userId
//       2. 清 Book.deletedAt = null
//       3. 恢复 File row（deletedAt = null）
//       4. 删除 RecycleBinItem
//   - 永久删除 → /api/recycle-bin/clear 调用 permanentlyDeleteFromRecycleBin：
//       1. 查 RecycleBinItem by id + userId（或 all）
//       2. 用 deleteFileWithRefCount 处理物理删除 + refCount
//       3. 删除 Book / BookConfig / BookNote 行
//       4. 删除 RecycleBinItem
//   - 自动清理 → GET /api/recycle-bin 调用 cleanupExpiredItems：
//       删除 expiresAt < now 的 RecycleBinItem + 对应 File / Book 物理文件
import { prismaClient } from '@/utils/db';
import { deleteFileWithRefCount } from './fileDedup';
import { deleteObject } from '@/utils/object';

// 默认 30 天后自动清理；可通过 RECYCLE_BIN_EXPIRE_DAYS 环境变量覆盖
export const getRecycleBinExpireDays = (): number => {
  const raw = parseInt(process.env['RECYCLE_BIN_EXPIRE_DAYS'] || '30', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
};

export const computeExpiresAt = (from: Date = new Date()): Date => {
  return new Date(from.getTime() + getRecycleBinExpireDays() * 24 * 60 * 60 * 1000);
};

/**
 * 把一个 File row 移入回收站。幂等 — 如果已经在回收站，刷新 expiresAt。
 * 返回创建/更新的 RecycleBinItem id。
 */
export const moveToRecycleBin = async (
  userId: string,
  fileRow: { id: string; fileKey: string; bookHash: string | null },
): Promise<string | null> => {
  if (!fileRow.bookHash) return null;

  // 查 Book row 拿 title/format（可能不存在 — 例如纯副本上传没有 library book）
  const book = await prismaClient.book.findFirst({
    where: { userId, bookHash: fileRow.bookHash },
  });
  const bookTitle = book?.title ?? fileRow.bookHash.slice(0, 12);
  const bookFormat = book?.format ?? '';

  // 软删 File row（deletedAt = now）— 不动 refCount 或物理文件
  await prismaClient.file.update({
    where: { id: fileRow.id },
    data: { deletedAt: new Date(), updatedAt: new Date() },
  });

  // 标记 Book.deletedAt = now（幂等）
  if (book && !book.deletedAt) {
    await prismaClient.book.updateMany({
      where: { userId, bookHash: fileRow.bookHash, deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  // 创建/更新 RecycleBinItem（同 user+bookHash 已有则刷新 expiresAt）
  const existing = await prismaClient.recycleBinItem.findFirst({
    where: { userId, bookHash: fileRow.bookHash },
  });
  if (existing) {
    await prismaClient.recycleBinItem.update({
      where: { id: existing.id },
      data: {
        bookTitle,
        bookFormat,
        fileKey: fileRow.fileKey,
        deletedAt: new Date(),
        expiresAt: computeExpiresAt(),
      },
    });
    return existing.id;
  }
  const item = await prismaClient.recycleBinItem.create({
    data: {
      userId,
      bookHash: fileRow.bookHash,
      bookTitle,
      bookFormat,
      fileKey: fileRow.fileKey,
      deletedAt: new Date(),
      expiresAt: computeExpiresAt(),
    },
  });
  return item.id;
};

/**
 * 还原一个 RecycleBinItem：清 Book.deletedAt + 恢复 File row + 删 RecycleBinItem。
 */
export const restoreFromRecycleBin = async (
  userId: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string }> => {
  const item = await prismaClient.recycleBinItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!item) return { ok: false, error: 'Recycle bin item not found' };

  // 恢复 File row(s)（同 user + bookHash + deletedAt != null）
  await prismaClient.file.updateMany({
    where: { userId, bookHash: item.bookHash, deletedAt: { not: null } },
    data: { deletedAt: null, updatedAt: new Date() },
  });

  // 清 Book.deletedAt = null（如果 Book row 存在）
  await prismaClient.book.updateMany({
    where: { userId, bookHash: item.bookHash },
    data: { deletedAt: null, updatedAt: new Date() },
  });

  await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
  return { ok: true };
};

/**
 * 永久删除一个 RecycleBinItem：物理删除文件 + 删除 Book/Config/Note + 删 RecycleBinItem。
 * 使用 deleteFileWithRefCount 处理跨用户去重的引用计数。
 */
export const permanentlyDeleteFromRecycleBin = async (
  userId: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string; physicalDeleted: boolean }> => {
  const item = await prismaClient.recycleBinItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!item) return { ok: false, error: "Recycle bin item not found", physicalDeleted: false };

  return permanentlyDeleteItem(userId, item);
};

/**
 * 永久删除所有 RecycleBinItem（用于 "Clear All"）。
 */
export const permanentlyDeleteAllFromRecycleBin = async (
  userId: string,
): Promise<{ deletedCount: number; failedCount: number }> => {
  const items = await prismaClient.recycleBinItem.findMany({ where: { userId } });
  let deletedCount = 0;
  let failedCount = 0;
  for (const item of items) {
    const result = await permanentlyDeleteItem(userId, item);
    if (result.ok) deletedCount++;
    else failedCount++;
  }
  return { deletedCount, failedCount };
};

const permanentlyDeleteItem = async (
  userId: string,
  item: { id: string; bookHash: string; fileKey: string | null },
): Promise<{ ok: boolean; error?: string; physicalDeleted: boolean }> => {
  try {
    // 查找所有 File rows（包括软删的）— 都需要走 refCount 处理
    const fileRows = await prismaClient.file.findMany({
      where: { userId, bookHash: item.bookHash },
    });
    for (const fr of fileRows) {
      try {
        await deleteFileWithRefCount(
          {
            id: fr.id,
            userId: fr.userId,
            fileKey: fr.fileKey,
            originalFileKey: fr.originalFileKey,
            refCount: fr.refCount,
          },
          deleteObject,
        );
      } catch (err) {
        console.error('permanentlyDeleteItem: file delete failed:', err);
      }
    }

    // 删除 Book / BookConfig / BookNote 行
    await prismaClient.bookNote.deleteMany({ where: { userId, bookHash: item.bookHash } });
    await prismaClient.bookConfig.deleteMany({ where: { userId, bookHash: item.bookHash } });
    await prismaClient.book.deleteMany({ where: { userId, bookHash: item.bookHash } });

    // 删除 RecycleBinItem
    await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
    return { ok: true, physicalDeleted: true };
  } catch (err) {
    console.error('permanentlyDeleteItem failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', physicalDeleted: false };
  }
};

/**
 * 清理过期 RecycleBinItem（expiresAt < now）— 永久删除对应的 File / Book。
 * 在 GET /api/recycle-bin 时调用。
 */
export const cleanupExpiredItems = async (userId: string): Promise<number> => {
  const now = new Date();
  const expired = await prismaClient.recycleBinItem.findMany({
    where: { userId, expiresAt: { lt: now } },
  });
  for (const item of expired) {
    await permanentlyDeleteItem(userId, item);
  }
  return expired.length;
};
