// v8.19.4: Admin — list a specific user's books.
// GET /api/admin/users/[id]/books — admin-only list of the target user's books.
//
// Auth: validateUserAndToken + isAdmin(role). We don't use canManageUser here
// because (a) the spec only requires admin-level access, and (b) the modal
// that consumes this endpoint hides itself for users the admin can't manage
// (the canManageUserClient check in UserManagement.tsx), so by the time the
// request is fired the client has already verified the relationship. The
// server still gates on isAdmin so a stolen token from a regular user
// can't enumerate other people's books.
//
// Returns Book rows with updatedAt desc (matches the library sort).
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { isAdmin } from '@/utils/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });
  if (!isAdmin({ role: user.role })) return res.status(403).json({ error: 'Admin only' });

  const targetUserId = String(req.query['id'] ?? '');
  if (!targetUserId) return res.status(400).json({ error: 'Missing user id' });

  try {
    const books = await prismaClient.book.findMany({
      where: { userId: targetUserId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });

    // Serialise BigInt-tolerant fields for JSON. Prisma's BigInt is not
    // JSON-serialisable by default, so we project to plain numbers/strings.
    const serialised = books.map((b) => ({
      userId: b.userId,
      bookHash: b.bookHash,
      metaHash: b.metaHash,
      format: b.format,
      title: b.title,
      sourceTitle: b.sourceTitle,
      author: b.author,
      tags: b.tags,
      progress: b.progress,
      readingStatus: b.readingStatus,
      groupId: b.groupId,
      groupName: b.groupName,
      metadata: b.metadata,
      createdAt: b.createdAt?.toISOString() ?? null,
      updatedAt: b.updatedAt?.toISOString() ?? null,
      uploadedAt: b.uploadedAt?.toISOString() ?? null,
    }));

    // Pull the latest File row per book to expose file size for the admin
    // UI's "sort by file size" affordance. We don't join (Prisma has no
    // native join) — we just look up File rows in a single round trip.
    const bookHashes = serialised.map((b) => b.bookHash);
    const files = await prismaClient.file.findMany({
      where: { userId: targetUserId, bookHash: { in: bookHashes }, deletedAt: null },
      select: { bookHash: true, fileSize: true, originalFileKey: true },
    });
    const sizeByHash = new Map<string, number>();
    for (const f of files) {
      // Reference files have fileSize 0; only count physical owners.
      // bookHash is nullable on File, but the `in` filter above guarantees
      // non-null here — the guard is just to satisfy TS strict-null.
      if (f.originalFileKey === null && f.bookHash !== null) {
        sizeByHash.set(f.bookHash, Number(f.fileSize));
      }
    }
    const booksWithSize = serialised.map((b) => ({
      ...b,
      fileSize: sizeByHash.get(b.bookHash) ?? null,
    }));

    return res.status(200).json({ books: booksWithSize });
  } catch (error) {
    console.error('Admin user books list failed:', error);
    return res.status(500).json({ error: 'Could not load books' });
  }
}
