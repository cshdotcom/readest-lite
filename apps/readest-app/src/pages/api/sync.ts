// 改造自原 src/pages/api/sync.ts。
// 100% 对齐原接口：路径 /api/sync，方法 GET/POST，请求/响应字段、增量规则、
// last-writer-wins、stat_pages pickWinningPages 全部复刻。
// 唯一变化：底层 supabase 调用 → prisma。
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { prismaClient } from '@/utils/db';
import { validateUserAndToken } from '@/utils/access';
import { runMiddleware, corsAllMethods } from '@/utils/cors';
import {
  transformBookConfigToDB,
  transformBookNoteToDB,
  transformBookToDB,
} from '@/utils/transform';
import type { SyncData, SyncRecord, SyncResult, SyncType, StatBookRecord, StatPageRecord } from '@/libs/sync';
import type { BookDataRecord } from '@/types/book';

const pageKey = (r: StatPageRecord) => `${r.book_hash}|${r.page}|${r.start_time}`;

// KOReader-compatible: 新 key 全要；已有 key 仅当 incoming duration 严格更长时覆盖。
export function pickWinningPages(
  incoming: StatPageRecord[],
  server: Map<string, StatPageRecord>,
): { toUpsert: StatPageRecord[] } {
  const toUpsert: StatPageRecord[] = [];
  for (const rec of incoming) {
    const existing = server.get(pageKey(rec));
    if (!existing || rec.duration > existing.duration) toUpsert.push(rec);
  }
  return { toUpsert };
}

const transformsToDB = {
  books: transformBookToDB,
  book_notes: transformBookNoteToDB,
  book_configs: transformBookConfigToDB,
};

type TableName = keyof typeof transformsToDB;

// ───────────────────────────────────────────────────────────────────────────
// GET /api/sync
// ───────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since');
  const typeParam = searchParams.get('type') as SyncType | undefined;
  const bookParam = searchParams.get('book');
  const metaHashParam = searchParams.get('meta_hash');
  const statsLimitParam = searchParams.get('limit');
  const statsLimit = statsLimitParam ? Math.max(1, Math.floor(Number(statsLimitParam))) : 0;

  if (!sinceParam) {
    return NextResponse.json({ error: '"since" query parameter is required' }, { status: 400 });
  }

  const since = new Date(Number(sinceParam));
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid "since" timestamp' }, { status: 400 });
  }
  // 原版用 sinceIso 在 supabase .or() 过滤；Prisma 版直接用 Date 对象，不需要 ISO 字符串

  const results: SyncResult = { books: [], configs: [], notes: [], statBooks: [], statPages: [] };
  const errors: Record<TableName, { table: TableName; error: string } | null> = {
    books: null,
    book_notes: null,
    book_configs: null,
  };

  const queryBooks = async () => {
    const rows = await prismaClient.book.findMany({
      where: {
        userId: user.id,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
        ...(bookParam ? { bookHash: bookParam } : {}),
        ...(metaHashParam ? { metaHash: metaHashParam } : {}),
      },
      orderBy: { updatedAt: 'desc' as const },
      // SQLite 无 1000 行限制；为兼容原行为仍按页拉
      take: 100000,
    });
    (results as unknown as { books: SyncRecord[] }).books = rows.map((r) => ({
      user_id: r.userId,
      id: r.bookHash,
      book_hash: r.bookHash,
      meta_hash: r.metaHash,
      hash: r.bookHash,
      format: r.format ?? 'EPUB',
      title: r.title ?? '',
      author: r.author ?? '',
      group_id: r.groupId,
      group_name: r.groupName,
      tags: r.tags,  // 保持原始 JSON 字符串，前端 transformBookFromDB 会 JSON.parse
      progress: r.progress,  // 保持原始 JSON 字符串
      reading_status: r.readingStatus,
      source_title: r.sourceTitle,
      metadata: r.metadata,  // 保持原始 JSON 字符串
      created_at: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updated_at: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
      uploaded_at: r.uploadedAt ? new Date(r.uploadedAt).getTime() : null,
      // 兼容前端 camelCase 字段（部分客户端代码同时读两种命名）
      groupId: r.groupId,
      groupName: r.groupName,
      readingStatus: r.readingStatus,
      sourceTitle: r.sourceTitle,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deletedAt: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
      uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).getTime() : null,
    })) as unknown as SyncRecord[];
  };

  const queryBookConfigs = async () => {
    const rows = await prismaClient.bookConfig.findMany({
      where: {
        userId: user.id,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
        ...(bookParam ? { bookHash: bookParam } : {}),
        ...(metaHashParam ? { metaHash: metaHashParam } : {}),
      },
      orderBy: { updatedAt: 'desc' as const },
      take: 100000,
    });
    (results as unknown as { configs: SyncRecord[] }).configs = rows.map((r) => ({
      user_id: r.userId,
      book_hash: r.bookHash,
      meta_hash: r.metaHash,
      location: r.location,
      xpointer: r.xpointer,
      progress: r.progress,
      rsvp_position: r.rsvpPosition,
      search_config: r.searchConfig,
      view_settings: r.viewSettings,
      updated_at: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deletedAt: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
    })) as unknown as SyncRecord[];
  };

  const queryBookNotes = async () => {
    const rows = await prismaClient.bookNote.findMany({
      where: {
        userId: user.id,
        OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
        ...(bookParam ? { bookHash: bookParam } : {}),
        ...(metaHashParam ? { metaHash: metaHashParam } : {}),
      },
      orderBy: { updatedAt: 'desc' as const },
      take: 100000,
    });
    (results as unknown as { notes: SyncRecord[] }).notes = rows.map((r) => ({
      user_id: r.userId,
      book_hash: r.bookHash,
      meta_hash: r.metaHash,
      id: r.id,
      type: r.type,
      cfi: r.cfi,
      xpointer0: r.xpointer0,
      xpointer1: r.xpointer1,
      page: r.page,
      text: r.text,
      style: r.style,
      color: r.color,
      note: r.note,
      global: r.global,
      created_at: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updated_at: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deleted_at: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      updatedAt: r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now(),
      deletedAt: r.deletedAt ? new Date(r.deletedAt).getTime() : null,
    })) as unknown as SyncRecord[];
  };

  try {
    if (!typeParam || typeParam === 'books') {
      try { await queryBooks(); } catch (e) { errors.books = { table: 'books', error: (e as Error).message }; }
      if (results.books?.length === 0 && since.getTime() < 1000) {
        const dummyHash = '00000000000000000000000000000000';
        const now = Date.now();
        results.books.push({
          user_id: user.id,
          id: dummyHash,
          book_hash: dummyHash,
          deleted_at: now,
          updated_at: now,
          hash: dummyHash,
          title: 'Dummy Book',
          format: 'EPUB',
          author: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        } as SyncRecord);
      }
    }
    if (!typeParam || typeParam === 'configs') {
      try { await queryBookConfigs(); } catch (e) { errors.book_configs = { table: 'book_configs', error: (e as Error).message }; }
    }
    if (!typeParam || typeParam === 'notes') {
      try { await queryBookNotes(); } catch (e) { errors.book_notes = { table: 'book_notes', error: (e as Error).message }; }
    }
    if (!typeParam || typeParam === 'stats') {
      const sb = await prismaClient.statBook.findMany({
        where: {
          userId: user.id,
          OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
        },
        orderBy: { updatedAt: 'asc' as const },
        take: 100000,
      });
      const spQuery = {
        where: {
          userId: user.id,
          OR: [{ updatedAt: { gt: since } }, { deletedAt: { gt: since } }],
          ...(bookParam ? { bookHash: bookParam } : {}),
        },
        orderBy: { updatedAt: 'asc' as const },
      };
      const sp = statsLimit > 0
        ? await prismaClient.statPage.findMany({ ...spQuery, take: statsLimit })
        : await prismaClient.statPage.findMany({ ...spQuery, take: 100000 });

      const withMs = <T extends { updatedAt: Date | null }>(rows: T[], toRecord: (r: T) => Record<string, unknown>) =>
        rows.map((r) => {
          const rec = toRecord(r);
          rec['updated_at_ms'] = r.updatedAt ? r.updatedAt.getTime() : 0;
          return rec;
        });

      (results as unknown as { statBooks: StatBookRecord[] }).statBooks = withMs(sb, (r) => ({
        user_id: r.userId,
        book_hash: r.bookHash,
        title: r.title,
        authors: r.authors,
        updated_at: r.updatedAt?.toISOString(),
        deleted_at: r.deletedAt?.toISOString() ?? null,
      })) as unknown as StatBookRecord[];

      (results as unknown as { statPages: StatPageRecord[] }).statPages = withMs(sp, (r) => ({
        user_id: r.userId,
        book_hash: r.bookHash,
        page: r.page,
        start_time: Number(r.startTime),
        duration: r.duration,
        total_pages: r.totalPages,
        ext: r.ext ? JSON.parse(r.ext) : undefined,
        updated_at: r.updatedAt?.toISOString(),
        deleted_at: r.deletedAt?.toISOString() ?? null,
      })) as unknown as StatPageRecord[];
    }

    const dbErrors = Object.values(errors).filter(Boolean);
    if (dbErrors.length > 0) {
      const errorMsg = dbErrors.map((e) => `${e!.table}: ${e!.error}`).join('; ');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const response = NextResponse.json(results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.delete('ETag');
    return response;
  } catch (error) {
    const errorMessage = (error as Error).message || 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/sync — last-writer-wins + 软删除 union
// ───────────────────────────────────────────────────────────────────────────
// v8.6: fix(sync) — treat undefined and null reading_status as equal
// prevents statusless books from being re-pinned to top after every sync
const readingStatusChanged = (client: unknown, server: unknown): boolean =>
  (client ?? null) !== (server ?? null);

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const body = await req.json();
  const { books = [], configs = [], notes = [], statBooks = [], statPages = [] } = body as SyncData;

  const upsertBooks = async (records: BookDataRecord[]) => {
    const authoritative: BookDataRecord[] = [];
    for (const rec of records) {
      const dbRec = transformsToDB.books(rec, user.id);
      rec.user_id = user.id;
      rec.book_hash = dbRec.book_hash;
      const existing = await prismaClient.book.findUnique({
        where: { userId_bookHash: { userId: user.id, bookHash: dbRec.book_hash } },
      });
      const now = new Date();
      if (!existing) {
        const created = await prismaClient.book.create({
          data: {
            userId: user.id,
            bookHash: dbRec.book_hash,
            metaHash: dbRec.meta_hash,
            format: dbRec.format,
            title: dbRec.title,
            author: dbRec.author,
            groupId: dbRec.group_id,
            groupName: dbRec.group_name,
            tags: dbRec.tags ? JSON.stringify(dbRec.tags) : null,
            progress: dbRec.progress ? JSON.stringify(dbRec.progress) : null,
            readingStatus: dbRec.reading_status,
            sourceTitle: dbRec.source_title,
            metadata: dbRec.metadata,
            createdAt: dbRec.created_at ? new Date(dbRec.created_at) : now,
            updatedAt: now,
            deletedAt: dbRec.deleted_at ? new Date(dbRec.deleted_at) : null,
            uploadedAt: dbRec.uploaded_at ? new Date(dbRec.uploaded_at) : null,
          },
        });
        authoritative.push({ ...dbRec, updated_at: created.updatedAt?.toISOString() } as unknown as BookDataRecord);
      } else {
        const clientUpdatedAt = dbRec.updated_at ? new Date(dbRec.updated_at).getTime() : 0;
        const serverUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
        const clientDeletedAt = dbRec.deleted_at ? new Date(dbRec.deleted_at).getTime() : 0;
        const serverDeletedAt = existing.deletedAt ? existing.deletedAt.getTime() : 0;
        const clientIsNewer = clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt;
        if (clientIsNewer) {
          const updated = await prismaClient.book.update({
            where: { userId_bookHash: { userId: user.id, bookHash: dbRec.book_hash } },
            data: {
              metaHash: dbRec.meta_hash,
              format: dbRec.format,
              title: dbRec.title,
              author: dbRec.author,
              groupId: dbRec.group_id,
              groupName: dbRec.group_name,
              tags: dbRec.tags ? JSON.stringify(dbRec.tags) : null,
              progress: dbRec.progress ? JSON.stringify(dbRec.progress) : null,
              readingStatus: dbRec.reading_status,
              sourceTitle: dbRec.source_title,
              metadata: dbRec.metadata,
              updatedAt: now,
              deletedAt: dbRec.deleted_at ? new Date(dbRec.deleted_at) : null,
              uploadedAt: dbRec.uploaded_at ? new Date(dbRec.uploaded_at) : null,
            },
          });
          authoritative.push({ ...dbRec, updated_at: updated.updatedAt?.toISOString() } as unknown as BookDataRecord);
        } else {
          authoritative.push(existing as unknown as BookDataRecord);
        }
      }
    }
    return authoritative;
  };

  const upsertBookConfigs = async (records: BookDataRecord[]) => {
    const authoritative: BookDataRecord[] = [];
    for (const rec of records) {
      const dbRec = transformsToDB.book_configs(rec, user.id);
      rec.user_id = user.id;
      rec.book_hash = dbRec.book_hash;
      const existing = await prismaClient.bookConfig.findUnique({
        where: { userId_bookHash: { userId: user.id, bookHash: dbRec.book_hash } },
      });
      const now = new Date();
      if (!existing) {
        const created = await prismaClient.bookConfig.create({
          data: {
            userId: user.id,
            bookHash: dbRec.book_hash,
            metaHash: dbRec.meta_hash,
            location: dbRec.location,
            xpointer: dbRec.xpointer,
            progress: dbRec.progress,
            rsvpPosition: dbRec.rsvp_position,
            searchConfig: dbRec.search_config,
            viewSettings: dbRec.view_settings,
            updatedAt: now,
          },
        });
        authoritative.push({ ...dbRec, updated_at: created.updatedAt?.toISOString() } as unknown as BookDataRecord);
      } else {
        const clientUpdatedAt = dbRec.updated_at ? new Date(dbRec.updated_at).getTime() : 0;
        const serverUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
        const clientDeletedAt = dbRec.deleted_at ? new Date(dbRec.deleted_at).getTime() : 0;
        const serverDeletedAt = existing.deletedAt ? existing.deletedAt.getTime() : 0;
        const clientIsNewer = clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt;
        if (clientIsNewer) {
          const updated = await prismaClient.bookConfig.update({
            where: { userId_bookHash: { userId: user.id, bookHash: dbRec.book_hash } },
            data: {
              metaHash: dbRec.meta_hash,
              location: dbRec.location,
              xpointer: dbRec.xpointer,
              progress: dbRec.progress,
              rsvpPosition: dbRec.rsvp_position,
              searchConfig: dbRec.search_config,
              viewSettings: dbRec.view_settings,
              updatedAt: now,
              deletedAt: dbRec.deleted_at ? new Date(dbRec.deleted_at) : null,
            },
          });
          authoritative.push({ ...dbRec, updated_at: updated.updatedAt?.toISOString() } as unknown as BookDataRecord);
        } else {
          authoritative.push(existing as unknown as BookDataRecord);
        }
      }
    }
    return authoritative;
  };

  const upsertBookNotes = async (records: BookDataRecord[]) => {
    const authoritative: BookDataRecord[] = [];
    for (const rec of records) {
      const dbRec = transformsToDB.book_notes(rec, user.id);
      rec.user_id = user.id;
      rec.book_hash = dbRec.book_hash;
      const existing = await prismaClient.bookNote.findUnique({
        where: {
          userId_bookHash_id: { userId: user.id, bookHash: dbRec.book_hash, id: dbRec.id },
        },
      });
      const now = new Date();
      if (!existing) {
        const created = await prismaClient.bookNote.create({
          data: {
            userId: user.id,
            bookHash: dbRec.book_hash,
            metaHash: dbRec.meta_hash,
            id: dbRec.id,
            type: dbRec.type,
            cfi: dbRec.cfi,
            xpointer0: dbRec.xpointer0,
            xpointer1: dbRec.xpointer1,
            text: dbRec.text,
            style: dbRec.style,
            color: dbRec.color,
            note: dbRec.note,
            page: dbRec.page,
            global: dbRec.global,
            updatedAt: now,
            deletedAt: dbRec.deleted_at ? new Date(dbRec.deleted_at) : null,
          },
        });
        authoritative.push({ ...dbRec, updated_at: created.updatedAt?.toISOString() } as unknown as BookDataRecord);
      } else {
        const clientUpdatedAt = dbRec.updated_at ? new Date(dbRec.updated_at).getTime() : 0;
        const serverUpdatedAt = existing.updatedAt ? existing.updatedAt.getTime() : 0;
        const clientDeletedAt = dbRec.deleted_at ? new Date(dbRec.deleted_at).getTime() : 0;
        const serverDeletedAt = existing.deletedAt ? existing.deletedAt.getTime() : 0;
        const clientIsNewer = clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt;
        if (clientIsNewer) {
          const updated = await prismaClient.bookNote.update({
            where: {
              userId_bookHash_id: { userId: user.id, bookHash: dbRec.book_hash, id: dbRec.id },
            },
            data: {
              metaHash: dbRec.meta_hash,
              type: dbRec.type,
              cfi: dbRec.cfi,
              xpointer0: dbRec.xpointer0,
              xpointer1: dbRec.xpointer1,
              text: dbRec.text,
              style: dbRec.style,
              color: dbRec.color,
              note: dbRec.note,
              page: dbRec.page,
              global: dbRec.global,
              updatedAt: now,
              deletedAt: dbRec.deleted_at ? new Date(dbRec.deleted_at) : null,
            },
          });
          authoritative.push({ ...dbRec, updated_at: updated.updatedAt?.toISOString() } as unknown as BookDataRecord);
        } else {
          authoritative.push(existing as unknown as BookDataRecord);
        }
      }
    }
    return authoritative;
  };

  try {
    const [booksResult, configsResult, notesResult] = await Promise.all([
      upsertBooks(books as BookDataRecord[]),
      upsertBookConfigs(configs as BookDataRecord[]),
      upsertBookNotes(notes as BookDataRecord[]),
    ]);

    // 进度回写：configs 里的 progress 同步到 books.progress（仅当 books.updated_at 更早）
    for (const rec of configsResult) {
      const cfg = rec as unknown as { book_hash: string; progress?: string; updated_at?: string };
      if (!cfg.book_hash || !cfg.updated_at || !cfg.progress) continue;
      let parsed: unknown;
      try {
        parsed = typeof cfg.progress === 'string' ? JSON.parse(cfg.progress) : cfg.progress;
      } catch {
        continue;
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        typeof parsed[0] !== 'number' ||
        typeof parsed[1] !== 'number'
      ) continue;
      try {
        await prismaClient.book.updateMany({
          where: {
            userId: user.id,
            bookHash: cfg.book_hash,
            updatedAt: { lt: new Date(cfg.updated_at) },
          },
          data: { progress: JSON.stringify(parsed), updatedAt: new Date(cfg.updated_at) },
        });
      } catch (err) {
        console.warn('books.progress piggyback failed for', cfg.book_hash, err);
      }
    }

    if (statBooks.length > 0) {
      for (const b of statBooks) {
        await prismaClient.statBook.upsert({
          where: { userId_bookHash: { userId: user.id, bookHash: b.book_hash } },
          create: {
            userId: user.id,
            bookHash: b.book_hash,
            title: b.title,
            authors: b.authors,
            updatedAt: new Date(),
            deletedAt: b.deleted_at ? new Date(b.deleted_at) : null,
          },
          update: {
            title: b.title,
            authors: b.authors,
            updatedAt: new Date(),
            deletedAt: b.deleted_at ? new Date(b.deleted_at) : null,
          },
        });
      }
    }

    if (statPages.length > 0) {
      const BATCH = 500;
      for (let off = 0; off < statPages.length; off += BATCH) {
        const batch = statPages.slice(off, off + BATCH);
        const bookHashes = [...new Set(batch.map((p) => p.book_hash))];
        const startTimes = [...new Set(batch.map((p) => p.start_time))];
        const existing = await prismaClient.statPage.findMany({
          where: {
            userId: user.id,
            bookHash: { in: bookHashes },
            startTime: { in: startTimes.map((n) => BigInt(n)) },
          },
        });
        const serverMap = new Map<string, StatPageRecord>();
        for (const r of existing) {
          serverMap.set(`${r.bookHash}|${r.page}|${r.startTime}`, {
            user_id: r.userId,
            book_hash: r.bookHash,
            page: r.page,
            start_time: Number(r.startTime),
            duration: r.duration,
            total_pages: r.totalPages,
            updated_at: r.updatedAt?.toISOString(),
            deleted_at: r.deletedAt?.toISOString() ?? null,
          });
        }
        const { toUpsert } = pickWinningPages(batch, serverMap);
        for (const p of toUpsert) {
          await prismaClient.statPage.upsert({
            where: {
              userId_bookHash_page_startTime: {
                userId: user.id,
                bookHash: p.book_hash,
                page: p.page,
                startTime: BigInt(p.start_time),
              },
            },
            create: {
              userId: user.id,
              bookHash: p.book_hash,
              page: p.page,
              startTime: BigInt(p.start_time),
              duration: p.duration,
              totalPages: p.total_pages,
              ext: p.ext ? JSON.stringify(p.ext) : null,
              updatedAt: new Date(),
              deletedAt: p.deleted_at ? new Date(p.deleted_at) : null,
            },
            update: {
              duration: p.duration,
              totalPages: p.total_pages,
              ext: p.ext ? JSON.stringify(p.ext) : null,
              updatedAt: new Date(),
              deletedAt: p.deleted_at ? new Date(p.deleted_at) : null,
            },
          });
        }
      }
    }

    return NextResponse.json(
      { books: booksResult, configs: configsResult, notes: notesResult },
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = (error as Error).message || 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Pages Router handler 包装（与原项目一致）
// ───────────────────────────────────────────────────────────────────────────
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!req.url) return res.status(400).json({ error: 'Invalid request URL' });
  const protocol = process.env['PROTOCOL'] || 'http';
  const host = process.env['HOST'] || 'localhost:3000';
  const url = new URL(req.url, `${protocol}://${host}`);
  await runMiddleware(req, res, corsAllMethods);
  try {
    let response: Response;
    if (req.method === 'GET') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'GET',
      });
      response = await GET(nextReq);
    } else if (req.method === 'POST') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      response = await POST(nextReq);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error('Error processing /api/sync:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default handler;
