// 文件复制 API — POST /api/storage/copy
// body: { fileKeys: string[], targetUserId?: string, targetUserIds?: string[] }
// 仅 admin / super_admin 可调用
// v8.22.4: 支持批量复制到多个用户（targetUserIds 数组）
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
    const { fileKeys, targetUserId, targetUserIds } = body;
    if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
      return NextResponse.json({ error: 'No fileKeys provided' }, { status: 400 });
    }

    // 兼容：单目标（targetUserId）或多目标（targetUserIds 数组）
    const targets: string[] = [];
    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      targets.push(...targetUserIds.filter((id: unknown) => typeof id === 'string' && id));
    }
    if (typeof targetUserId === 'string' && targetUserId && !targets.includes(targetUserId)) {
      targets.push(targetUserId);
    }
    if (targets.length === 0) {
      return NextResponse.json({ error: 'targetUserId or targetUserIds required' }, { status: 400 });
    }

    // 校验所有目标用户存在
    const targetUsers = await prismaClient.user.findMany({
      where: { id: { in: targets } },
      select: { id: true, email: true },
    });
    if (targetUsers.length === 0) {
      return NextResponse.json({ error: 'No target users found' }, { status: 404 });
    }
    const validTargetIds = new Set(targetUsers.map((u) => u.id));

    const files = await prismaClient.file.findMany({
      where: { fileKey: { in: fileKeys }, deletedAt: null },
    });

    if (files.length === 0) {
      return NextResponse.json({ error: 'No matching files' }, { status: 404 });
    }

    let copied = 0;
    let failed = 0;
    const errors: { fileKey: string; targetUser: string; error: string }[] = [];
    const perTargetResults: Record<string, { copied: number; failed: number }> = {};

    for (const targetId of validTargetIds) {
      perTargetResults[targetId] = { copied: 0, failed: 0 };
      for (const file of files) {
        try {
          const parts = file.fileKey.split('/');
          if (parts.length < 2 || parts[0] !== file.userId) {
            failed++;
            perTargetResults[targetId]!.failed++;
            errors.push({ fileKey: file.fileKey, targetUser: targetId, error: 'fileKey does not start with source userId' });
            continue;
          }
          parts[0] = targetId;
          const newFileKey = parts.join('/');

          const existing = await prismaClient.file.findUnique({ where: { fileKey: newFileKey } });
          if (existing) {
            // 目标用户已有该文件 — 跳过（不视为错误）
            copied++;
            perTargetResults[targetId]!.copied++;
            continue;
          }

          const srcPath = path.join(BOOKS_DIR, file.fileKey);
          const dstPath = path.join(BOOKS_DIR, newFileKey);
          await fs.mkdir(path.dirname(dstPath), { recursive: true });
          await fs.copyFile(srcPath, dstPath);

          await prismaClient.file.create({
            data: {
              userId: targetId,
              fileKey: newFileKey,
              fileSize: file.fileSize,
              bookHash: file.bookHash,
              replicaKind: file.replicaKind,
              replicaId: file.replicaId,
            },
          });
          copied++;
          perTargetResults[targetId]!.copied++;
        } catch (err) {
          failed++;
          perTargetResults[targetId]!.failed++;
          errors.push({ fileKey: file.fileKey, targetUser: targetId, error: err instanceof Error ? err.message : 'unknown error' });
        }
      }
    }

    // 写审计日志（best-effort）
    await prismaClient.auditLog.create({
      data: {
        userId: user.id,
        targetUserId: targets[0],
        action: 'book_copy',
        description: `Copied ${copied} file(s) to ${targetUsers.length} user(s)`,
        metadata: JSON.stringify({ copied, failed, targetUserCount: targets.length, fileKeys: fileKeys.slice(0, 20) }),
      },
    }).catch(() => { /* ignore */ });

    return NextResponse.json({
      copied,
      failed,
      targetUsersCount: targetUsers.length,
      perTargetResults,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('Copy files error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to copy files' },
      { status: 500 },
    );
  }
}
