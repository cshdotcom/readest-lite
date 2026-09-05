// Clear reading statistics endpoint
// DELETE /api/usage/stats — delete all StatPage + UsageStat rows for this user
// Auth required (Bearer token).
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // StatPage holds the per-page reading duration history used by
    // Reading Statistics and Book Ranking. UsageStat holds the daily
    // translation char count (not strictly "reading", but we clear it
    // too since the user asked for stats cleanup).
    const deletedPages = await prismaClient.statPage.deleteMany({
      where: { userId: user.id },
    });
    const deletedUsage = await prismaClient.usageStat.deleteMany({
      where: { userId: user.id },
    });

    return res.status(200).json({
      ok: true,
      deletedStatPages: deletedPages.count,
      deletedUsageStats: deletedUsage.count,
    });
  } catch (error) {
    console.error('Clear reading stats failed:', error);
    return res.status(500).json({ error: 'Failed to clear reading statistics' });
  }
}
