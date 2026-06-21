// v8.7: 批量操作
// POST /api/download-tasks/batch
// body: { action: "retry_failed" | "pause_all" | "resume_all" | "clear_completed" | "clear_failed" | "clear_all" }
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { action } = await req.json();

  switch (action) {
    case 'retry_failed': {
      const failed = await prismaClient.downloadTask.findMany({
        where: { userId: user.id, status: 'failed' },
      });
      await prismaClient.downloadTask.updateMany({
        where: { userId: user.id, status: 'failed' },
        data: { status: 'pending', error: null, startedAt: null, completedAt: null },
      });
      // 后台批量重试（简化：逐个执行）
      for (const task of failed) {
        void (async () => {
          try {
            await prismaClient.downloadTask.update({
              where: { id: task.id }, data: { status: 'in_progress', startedAt: new Date() },
            });
            const resp = await fetch(task.url, {
              headers: { 'User-Agent': 'ReadestLite/1.0' },
              signal: AbortSignal.timeout(120000),
              redirect: 'follow',
            });
            if (!resp.ok) throw new Error(`Remote ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            if (buffer.byteLength === 0) throw new Error('Empty');
            if (buffer.byteLength > 200 * 1024 * 1024) throw new Error('Too large');

            const { createHash } = await import('crypto');
            const { putObject, isSafeObjectKeyName } = await import('@/utils/object');
            const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');
            const fileKey = `${user.id}/Readest/Books/${hash}/${task.filename}`;
            if (!isSafeObjectKeyName(fileKey)) throw new Error('Invalid filename');
            await putObject(fileKey, buffer, resp.headers.get('content-type') || 'application/octet-stream');

            const existing = await prismaClient.file.findUnique({ where: { fileKey } });
            if (!existing) {
              await prismaClient.file.create({
                data: { userId: user.id, bookHash: hash, fileKey, fileSize: BigInt(buffer.byteLength) },
              });
            }
            const ext = task.filename.split('.').pop()?.toUpperCase() || '';
            const title = task.filename.replace(/\.[^.]+$/, '');
            await prismaClient.book.upsert({
              where: { userId_bookHash: { userId: user.id, bookHash: hash } },
              create: { userId: user.id, bookHash: hash, title, format: ext, uploadedAt: new Date(), updatedAt: new Date(), createdAt: new Date() },
              update: { deletedAt: null, uploadedAt: new Date(), updatedAt: new Date() },
            });
            await prismaClient.downloadTask.update({
              where: { id: task.id },
              data: { status: 'completed', completedAt: new Date(), bookHash: hash, fileSize: BigInt(buffer.byteLength) },
            });
          } catch (err) {
            await prismaClient.downloadTask.update({
              where: { id: task.id },
              data: { status: 'failed', error: err instanceof Error ? err.message : 'Error', completedAt: new Date() },
            }).catch(() => {});
          }
        })();
      }
      return NextResponse.json({ ok: true, count: failed.length });
    }

    case 'pause_all': {
      const result = await prismaClient.downloadTask.updateMany({
        where: { userId: user.id, status: { in: ['pending', 'in_progress'] } },
        data: { status: 'paused' },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    case 'resume_all': {
      const paused = await prismaClient.downloadTask.findMany({
        where: { userId: user.id, status: 'paused' },
      });
      await prismaClient.downloadTask.updateMany({
        where: { userId: user.id, status: 'paused' },
        data: { status: 'pending' },
      });
      // 后台批量恢复（简化：逐个执行，复用 retry 逻辑）
      for (const task of paused) {
        void (async () => {
          try {
            await prismaClient.downloadTask.update({
              where: { id: task.id }, data: { status: 'in_progress', startedAt: new Date() },
            });
            const resp = await fetch(task.url, {
              headers: { 'User-Agent': 'ReadestLite/1.0' },
              signal: AbortSignal.timeout(120000), redirect: 'follow',
            });
            if (!resp.ok) throw new Error(`Remote ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            if (buffer.byteLength === 0) throw new Error('Empty');
            const { createHash } = await import('crypto');
            const { putObject, isSafeObjectKeyName } = await import('@/utils/object');
            const hash = createHash('md5').update(Buffer.from(buffer)).digest('hex');
            const fileKey = `${user.id}/Readest/Books/${hash}/${task.filename}`;
            if (!isSafeObjectKeyName(fileKey)) throw new Error('Invalid filename');
            await putObject(fileKey, buffer, resp.headers.get('content-type') || 'application/octet-stream');
            const existing = await prismaClient.file.findUnique({ where: { fileKey } });
            if (!existing) await prismaClient.file.create({ data: { userId: user.id, bookHash: hash, fileKey, fileSize: BigInt(buffer.byteLength) } });
            const ext = task.filename.split('.').pop()?.toUpperCase() || '';
            await prismaClient.book.upsert({
              where: { userId_bookHash: { userId: user.id, bookHash: hash } },
              create: { userId: user.id, bookHash: hash, title: task.filename.replace(/\.[^.]+$/, ''), format: ext, uploadedAt: new Date(), updatedAt: new Date(), createdAt: new Date() },
              update: { deletedAt: null, uploadedAt: new Date(), updatedAt: new Date() },
            });
            await prismaClient.downloadTask.update({ where: { id: task.id }, data: { status: 'completed', completedAt: new Date(), bookHash: hash, fileSize: BigInt(buffer.byteLength) } });
          } catch (err) {
            await prismaClient.downloadTask.update({ where: { id: task.id }, data: { status: 'failed', error: err instanceof Error ? err.message : 'Error', completedAt: new Date() } }).catch(() => {});
          }
        })();
      }
      return NextResponse.json({ ok: true, count: paused.length });
    }

    case 'clear_completed': {
      const result = await prismaClient.downloadTask.deleteMany({
        where: { userId: user.id, status: 'completed' },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    case 'clear_failed': {
      const result = await prismaClient.downloadTask.deleteMany({
        where: { userId: user.id, status: 'failed' },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    case 'clear_all': {
      const result = await prismaClient.downloadTask.deleteMany({
        where: { userId: user.id },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}
