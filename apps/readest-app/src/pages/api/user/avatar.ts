// v8.19.1: User avatar upload — stores avatar URL in user record
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  
  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'PUT' || req.method === 'POST') {
    const { avatarUrl } = req.body as { avatarUrl?: string };
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'Missing avatarUrl' });
    }
    if (avatarUrl.length > 2048) {
      return res.status(400).json({ error: 'Avatar URL too long' });
    }

    try {
      // v8.19.2: Avatar counts against user storage, stored with hidden prefix
      // If user already has an avatar URL that's a data: URL or local, clean it up
      const existingUser = await prismaClient.user.findUnique({ where: { id: user.id } });
      if (existingUser?.avatarUrl && existingUser.avatarUrl.startsWith('/api/avatar/')) {
        // Delete old avatar file (hidden prefix: avatar/<userId>.<ext>)
        const oldKey = existingUser.avatarUrl.replace('/api/avatar/', 'avatar/');
        try {
          const { deleteObject } = await import('@/utils/object');
          await deleteObject(oldKey);
          // Decrement old avatar size from storage usage
          const oldFile = await prismaClient.file.findFirst({ where: { fileKey: oldKey } });
          if (oldFile) {
            await prismaClient.file.delete({ where: { id: oldFile.id } });
          }
        } catch {}
      }

      // For data: URLs, we store them as-is (base64 in the avatarUrl column)
      // For http(s) URLs, we just store the URL — no local file needed
      // Avatar size is small (typically < 100KB for data: URLs) and counts
      // against user storage via the avatarUrl field
      const avatarSize = avatarUrl.startsWith('data:')
        ? Math.ceil(avatarUrl.length * 0.75) // base64 → bytes
        : 0; // external URL — no local storage

      if (avatarSize > 0) {
        // Check quota
        const storageQuotaMB = user.storageQuotaMB ?? 0;
        if (storageQuotaMB > 0) {
          const { getActualStorageUsage } = await import('@/utils/access');
          const currentUsage = await getActualStorageUsage(user.id);
          if (currentUsage + avatarSize > storageQuotaMB * 1024 * 1024) {
            return res.status(403).json({ error: 'Storage quota exceeded' });
          }
        }

        // Store avatar as hidden file (avatar/ prefix — not shown in file manager)
        const avatarKey = `avatar/${user.id}`;
        const { putObject } = await import('@/utils/object');
        const avatarBytes = Buffer.from(avatarUrl.split(',')[1] || '', 'base64');
        await putObject(avatarKey, avatarBytes, 'image/*');

        // Create/update File row (hidden from file manager — not under Readest/Books/)
        await prismaClient.file.upsert({
          where: { fileKey: avatarKey },
          create: {
            userId: user.id,
            fileKey: avatarKey,
            fileSize: BigInt(avatarBytes.length),
          },
          update: {
            fileSize: BigInt(avatarBytes.length),
            deletedAt: null,
          },
        });

        // Store serving URL (hidden route)
        const servingUrl = `/api/avatar/${user.id}`;
        await prismaClient.user.update({
          where: { id: user.id },
          data: { avatarUrl: servingUrl },
        });
        return res.status(200).json({ ok: true, avatarUrl: servingUrl });
      } else {
        // External URL — just store it, no local file
        await prismaClient.user.update({
          where: { id: user.id },
          data: { avatarUrl },
        });
        return res.status(200).json({ ok: true, avatarUrl });
      }
    } catch (error) {
      console.error('Avatar update failed:', error);
      return res.status(500).json({ error: 'Could not update avatar' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prismaClient.user.update({
        where: { id: user.id },
        data: { avatarUrl: null },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Avatar delete failed:', error);
      return res.status(500).json({ error: 'Could not delete avatar' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
