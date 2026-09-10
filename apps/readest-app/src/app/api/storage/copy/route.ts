// 文件复制 API — POST /api/storage/copy
// body: { fileKeys: string[], targetUserId: string }
// 仅 admin / super_admin 可调用
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';

const BOOKS_DIR = process.env['BOOKS_DIR'] || '/data/books';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, token } = await validateAdmin(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { fileKeys, targetUserId } = body;
    if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
      return NextResponse.json({ error: 'No fileKeys provided' }, { status: 400 });
    }
    if (typeof targetUserId !== 'string' || !targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
    }

    const targetUser = await prismaClient.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const files = await prismaClient.file.findMany({
      where: { fileKey: { in: fileKeys }, deletedAt: null },
    });

    if (files.length === 0) {
      return NextResponse.json({ error: 'No matching files' }, { status: 404 });
    }

    let copied = 0;
    let failed = 0;
    const errors: { fileKey: string; error: string }[] = [];

    for (const file of files) {
      try {
        const parts = file.fileKey.split('/');
        if (parts.length < 2 || parts[0] !== file.userId) {
          failed++;
          errors.push({ fileKey: file.fileKey, error: 'fileKey does not start with source userId' });
          continue;
        }
        parts[0] = targetUserId;
        const newFileKey = parts.join('/');

        const existing = await prismaClient.file.findUnique({ where: { fileKey: newFileKey } });
        if (existing) {
          failed++;
          errors.push({ fileKey: file.fileKey, error: 'Target file already exists' });
          continue;
        }

        const srcPath = path.join(BOOKS_DIR, file.fileKey);
        const dstPath = path.join(BOOKS_DIR, newFileKey);
        await fs.mkdir(path.dirname(dstPath), { recursive: true });
        await fs.copyFile(srcPath, dstPath);

        await prismaClient.file.create({
          data: {
            userId: targetUserId,
            fileKey: newFileKey,
            fileSize: file.fileSize,
            bookHash: file.bookHash,
            replicaKind: file.replicaKind,
            replicaId: file.replicaId,
          },
        });
        copied++;
      } catch (err) {
        failed++;
        errors.push({ fileKey: file.fileKey, error: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    await prismaClient.auditLog.create({
      data: {
        userId: user.id,
        targetUserId,
        action: 'book_copy',
        description: `Copied ${copied} file(s) to ${targetUserId}`,
        metadata: JSON.stringify({ copied, failed, fileKeys: fileKeys.slice(0, 20) }),
      },
    }).catch(() => { /* audit log failure should not block operation */ });

    return NextResponse.json({ copied, failed, errors });
  } catch (error) {
    console.error('Copy files error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to copy files' },
      { status: 500 },
    );
  }
}
