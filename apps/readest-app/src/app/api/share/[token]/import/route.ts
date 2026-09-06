// 改造自原 src/app/api/share/[token]/import/route.ts。
import { NextResponse } from 'next/server';
import { prismaClient } from '@/utils/db';
import { copyObject, objectExists } from '@/utils/object';
import { validateUserAndToken } from '@/utils/access';
import { rejectionToHttp, resolveActiveShare } from '@/libs/shareServer';

interface RouteParams { params: Promise<{ token: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const { token: shareToken } = await params;
  const { user, token: jwt } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !jwt) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const result = await resolveActiveShare(shareToken);
  if (!result.ok) {
    const { status, body } = rejectionToHttp(result.reason);
    return NextResponse.json(body, { status });
  }
  const { share } = result;

  // v8.18.7: feed:// 书籍分享 — 无文件，只复制 cover，返回 descriptor
  if (share.isFeedBook) {
    // 检查接收方是否已有该 bookHash 的 cover row
    const existingCover = await prismaClient.file.findFirst({
      where: {
        userId: user.id,
        bookHash: share.bookHash,
        deletedAt: null,
        fileKey: { endsWith: '/cover.png' },
      },
    });
    const alreadyOwned = !!existingCover;

    // 复制 owner 的 cover.png 到接收方命名空间
    if (!alreadyOwned && share.coverFileKey) {
      const sharerPrefix = `${share.userId}/`;
      const recipientPrefix = `${user.id}/`;
      const destCoverKey = share.coverFileKey.startsWith(sharerPrefix)
        ? recipientPrefix + share.coverFileKey.slice(sharerPrefix.length)
        : null;
      if (destCoverKey) {
        try {
          const coverExists = await objectExists(share.coverFileKey);
          if (coverExists) {
            await copyObject(share.coverFileKey, destCoverKey);
            await prismaClient.file.create({
              data: {
                userId: user.id,
                bookHash: share.bookHash,
                fileKey: destCoverKey,
                fileSize: BigInt(0),
              },
            });
          }
        } catch (err) {
          console.error('Feed share cover copy failed (non-fatal):', err);
        }
      }
    }

    return NextResponse.json({
      fileId: share.bookHash,
      alreadyOwned,
      bookHash: share.bookHash,
      cfi: share.cfi,
      isFeedBook: true,
      bookUrl: share.bookUrl,
      bookTitle: share.bookTitle,
      bookAuthor: share.bookAuthor,
      bookFormat: share.bookFormat,
    });
  }

  // 自导入幂等
  if (share.userId === user.id) {
    const own = await prismaClient.file.findFirst({
      where: { userId: user.id, bookHash: share.bookHash, deletedAt: null, NOT: [{ fileKey: { endsWith: '.png' } }, { fileKey: { endsWith: '.jpg' } }, { fileKey: { endsWith: '.jpeg' } }, { fileKey: { endsWith: '.webp' } }, { fileKey: { endsWith: '.gif' } }] },
    });
    if (own) return NextResponse.json({ fileId: own.id, alreadyOwned: true, bookHash: share.bookHash, cfi: share.cfi });
  }

  // 查已有 row（包括软删）
  const existing = await prismaClient.file.findMany({ where: { userId: user.id, bookHash: share.bookHash } });
  const existingRows = existing.filter((f) => !/\.(png|jpe?g|webp|gif)$/i.test(f.fileKey));
  const liveRow = existingRows.find((f) => f.deletedAt === null);
  if (liveRow) return NextResponse.json({ fileId: liveRow.id, alreadyOwned: true, bookHash: share.bookHash, cfi: share.cfi });

  const deletedRow = existingRows.find((f) => f.deletedAt !== null);
  if (deletedRow) {
    await prismaClient.file.update({ where: { id: deletedRow.id }, data: { deletedAt: null, updatedAt: new Date() } });
    return NextResponse.json({ fileId: deletedRow.id, alreadyOwned: true, bookHash: share.bookHash, cfi: share.cfi });
  }

  // quota 检查跳过（无限）
  // 重映射 file_key 前缀
  const sharerPrefix = `${share.userId}/`;
  const recipientPrefix = `${user.id}/`;
  const remap = (sourceKey: string): string | null => sourceKey.startsWith(sharerPrefix) ? recipientPrefix + sourceKey.slice(sharerPrefix.length) : null;

  const destBookKey = remap(share.bookFileKey);
  if (!destBookKey) return NextResponse.json({ error: 'Cannot remap shared file' }, { status: 500 });

  const sourceExists = await objectExists(share.bookFileKey);
  if (!sourceExists) return NextResponse.json({ error: 'Shared book is no longer available', code: 'source_deleted' }, { status: 410 });

  const insertedBook = await prismaClient.file.create({
    data: { userId: user.id, bookHash: share.bookHash, fileKey: destBookKey, fileSize: BigInt(share.bookSize) },
    select: { id: true },
  });

  try {
    const copyResp = await copyObject(share.bookFileKey, destBookKey);
    if (copyResp && typeof (copyResp as { ok?: boolean }).ok === 'boolean' && !(copyResp as { ok: boolean }).ok) {
      throw new Error('copy failed');
    }
  } catch (err) {
    console.error('Share import book copy failed:', err);
    await prismaClient.file.update({ where: { id: insertedBook.id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ error: 'Could not import book' }, { status: 500 });
  }

  // 封面 best-effort
  if (share.coverFileKey) {
    const destCoverKey = remap(share.coverFileKey);
    if (destCoverKey) {
      try {
        const coverExists = await objectExists(share.coverFileKey);
        if (coverExists) {
          await copyObject(share.coverFileKey, destCoverKey);
          await prismaClient.file.create({
            data: { userId: user.id, bookHash: share.bookHash, fileKey: destCoverKey, fileSize: BigInt(0) },
          });
        }
      } catch (err) {
        console.error('Share import cover copy failed (non-fatal):', err);
      }
    }
  }

  return NextResponse.json({ fileId: insertedBook.id, alreadyOwned: false, bookHash: share.bookHash, cfi: share.cfi });
}
