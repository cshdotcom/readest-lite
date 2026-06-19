// 改造自原 src/pages/api/sync/replicas.ts。
// 100% 对齐原接口：路径 /api/sync/replicas，方法 GET/POST。
// body={cursors:[...]} → 批量拉；body={rows:[...]} → 推送（CRDT 合并）。
// 错误码、状态码、响应字段与原版一致。
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { prismaClient } from '@/utils/db';
import { validateUserAndToken } from '@/utils/access';
import { runMiddleware, corsAllMethods } from '@/utils/cors';
import {
  validatePullBatch,
  validatePullParams,
  validatePushBatch,
} from '@/libs/replicaSyncServer';
import type { ReplicaRow } from '@/types/replica';
import { crdtMergeReplica } from '@/utils/crdt';

const errorResponse = (status: number, code: string, message: string, offendingIndex?: number) =>
  NextResponse.json(
    {
      error: message,
      code,
      ...(typeof offendingIndex === 'number' ? { offendingIndex } : {}),
    },
    { status },
  );

const rowToResponse = (r: {
  userId: string; kind: string; replicaId: string;
  fieldsJsonb: string; manifestJsonb: string | null;
  deletedAtTs: string | null; reincarnation: string | null;
  updatedAtTs: string; schemaVersion: number;
  createdAt: Date; modifiedAt: Date;
}): ReplicaRow => ({
  user_id: r.userId,
  kind: r.kind,
  replica_id: r.replicaId,
  fields_jsonb: JSON.parse(r.fieldsJsonb || '{}'),
  manifest_jsonb: r.manifestJsonb ? JSON.parse(r.manifestJsonb) : null,
  deleted_at_ts: (r.deletedAtTs as unknown as ReplicaRow['deleted_at_ts']) ?? null,
  reincarnation: r.reincarnation,
  updated_at_ts: r.updatedAtTs as unknown as ReplicaRow['updated_at_ts'],
  schema_version: r.schemaVersion,
});

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return errorResponse(401, 'AUTH', 'Not authenticated');

  let body: unknown;
  try { body = await req.json(); } catch { return errorResponse(400, 'VALIDATION', 'Invalid JSON body'); }

  // 批量拉
  if (typeof body === 'object' && body !== null && 'cursors' in body) {
    const validation = validatePullBatch(body);
    if (!validation.ok) return errorResponse(validation.status, validation.code, validation.message, validation.offendingIndex);
    const { cursors } = validation.params;
    if (cursors.length === 0) return NextResponse.json({ results: [] }, { status: 200 });
    try {
      const tasks = cursors.map(async ({ kind, since }) => {
        const rows = await prismaClient.replica.findMany({
          where: { userId: user.id, kind, ...(since ? { updatedAtTs: { gt: since } } : {}) },
          orderBy: { updatedAtTs: 'asc' as const },
          take: 1000,
        });
        return { kind, rows: rows.map(rowToResponse) };
      });
      const results = await Promise.all(tasks);
      return NextResponse.json({ results }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return errorResponse(500, 'SERVER', message);
    }
  }

  // 推送
  const validation = validatePushBatch(body, user.id, Date.now());
  if (!validation.ok) return errorResponse(validation.status, validation.code, validation.message, validation.offendingIndex);

  const merged: ReplicaRow[] = [];
  for (const row of validation.rows) {
    const existing = await prismaClient.replica.findUnique({
      where: {
        userId_kind_replicaId: { userId: row.user_id, kind: row.kind, replicaId: row.replica_id },
      },
    });
    const localRow = existing
      ? {
          userId: existing.userId, kind: existing.kind, replicaId: existing.replicaId,
          fields_jsonb: JSON.parse(existing.fieldsJsonb || '{}'),
          manifest_jsonb: existing.manifestJsonb ? JSON.parse(existing.manifestJsonb) : null,
          deleted_at_ts: existing.deletedAtTs, reincarnation: existing.reincarnation,
          updated_at_ts: existing.updatedAtTs, schema_version: existing.schemaVersion,
        }
      : null;
    const mergedRow = crdtMergeReplica(localRow, {
      userId: row.user_id, kind: row.kind, replicaId: row.replica_id,
      fieldsJsonb: row.fields_jsonb, manifestJsonb: row.manifest_jsonb,
      deletedAtTs: row.deleted_at_ts, reincarnation: row.reincarnation,
      updatedAtTs: row.updated_at_ts, schemaVersion: row.schema_version,
    });

    if (existing) {
      await prismaClient.replica.update({
        where: { userId_kind_replicaId: { userId: row.user_id, kind: row.kind, replicaId: row.replica_id } },
        data: {
          fieldsJsonb: JSON.stringify(mergedRow.fields_jsonb),
          manifestJsonb: mergedRow.manifest_jsonb ? JSON.stringify(mergedRow.manifest_jsonb) : null,
          deletedAtTs: mergedRow.deleted_at_ts,
          reincarnation: mergedRow.reincarnation,
          updatedAtTs: mergedRow.updated_at_ts,
          schemaVersion: mergedRow.schema_version,
          modifiedAt: new Date(),
        },
      });
    } else {
      await prismaClient.replica.create({
        data: {
          userId: mergedRow.user_id, kind: mergedRow.kind, replicaId: mergedRow.replica_id,
          fieldsJsonb: JSON.stringify(mergedRow.fields_jsonb),
          manifestJsonb: mergedRow.manifest_jsonb ? JSON.stringify(mergedRow.manifest_jsonb) : null,
          deletedAtTs: mergedRow.deleted_at_ts, reincarnation: mergedRow.reincarnation,
          updatedAtTs: mergedRow.updated_at_ts, schemaVersion: mergedRow.schema_version,
        },
      });
    }
    merged.push(mergedRow);
  }

  return NextResponse.json({ rows: merged }, { status: 200 });
}

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) return errorResponse(401, 'AUTH', 'Not authenticated');

  const { searchParams } = new URL(req.url);
  const validation = validatePullParams(searchParams.get('kind'), searchParams.get('since'));
  if (!validation.ok) return errorResponse(validation.status, validation.code, validation.message);
  const { kind, since } = validation.params;

  const rows = await prismaClient.replica.findMany({
    where: { userId: user.id, kind, ...(since ? { updatedAtTs: { gt: since } } : {}) },
    orderBy: { updatedAtTs: 'asc' as const },
    take: 1000,
  });
  return NextResponse.json({ rows: rows.map(rowToResponse) }, { status: 200 });
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!req.url) return res.status(400).json({ error: 'Invalid request URL' });
  const protocol = process.env['PROTOCOL'] || 'http';
  const host = process.env['HOST'] || 'localhost:3000';
  const url = new URL(req.url, `${protocol}://${host}`);
  await runMiddleware(req, res, corsAllMethods);
  try {
    let response: Response;
    if (req.method === 'GET') {
      response = await GET(new NextRequest(url.toString(), { headers: new Headers(req.headers as Record<string, string>), method: 'GET' }));
    } else if (req.method === 'POST') {
      response = await POST(new NextRequest(url.toString(), { headers: new Headers(req.headers as Record<string, string>), method: 'POST', body: JSON.stringify(req.body) }));
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error('Error /api/sync/replicas:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
export default handler;
