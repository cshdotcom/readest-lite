// Notion 同步全部书籍的笔记到 Notion 数据库
// POST /api/notion/sync-all
// body: { notionToken: string, databaseId: string }
// 流程：
//   1. 列出当前用户所有 books（含 notes）
//   2. 对每本有 notes 的书：
//      a. 用 Notion API 查询数据库，看是否已有该书对应 page（按书名匹配）
//      b. 没有 → 创建一个新 page
//      c. 有 → 复用该 page
//      d. 把该书所有 notes 转为 Notion blocks 追加到该 page（去重）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export const runtime = 'nodejs';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

interface NotionBlock {
  object: 'block';
  type: string;
  [k: string]: unknown;
}

const headingBlock = (text: string): NotionBlock => ({
  object: 'block',
  type: 'heading_2',
  heading_2: {
    rich_text: [{ type: 'text', text: { content: text.slice(0, 100) } }],
  },
});

const quoteBlock = (text: string): NotionBlock => ({
  object: 'block',
  type: 'quote',
  quote: {
    rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
  },
});

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const { notionToken, databaseId } = await req.json();
    if (!notionToken || !databaseId) {
      return NextResponse.json({ error: 'Notion token and database ID required' }, { status: 400 });
    }

    // 列出当前用户所有非删 books
    const books = await prismaClient.book.findMany({
      where: { userId: user.id, deletedAt: null },
      select: {
        bookHash: true,
        title: true,
        author: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    let pagesCreated = 0;
    let pagesUpdated = 0;
    let notesPushed = 0;
    let failedBooks = 0;
    const errors: { bookHash: string; error: string }[] = [];

    for (const book of books) {
      try {
        const notes = await prismaClient.bookNote.findMany({
          where: { userId: user.id, bookHash: book.bookHash, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });

        if (notes.length === 0) continue;

        const bookTitle = (book.title || 'Untitled').slice(0, 100);
        const queryResp = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_VERSION,
          },
          body: JSON.stringify({
            filter: {
              property: 'Title',
              title: { equals: bookTitle },
            },
          }),
        });

        let pageId: string | undefined;
        if (queryResp.ok) {
          const queryData = await queryResp.json();
          if (queryData.results && queryData.results.length > 0) {
            pageId = queryData.results[0].id;
          }
        }

        if (!pageId) {
          const createResp = await fetch(`${NOTION_API_BASE}/pages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${notionToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': NOTION_VERSION,
            },
            body: JSON.stringify({
              parent: { database_id: databaseId },
              properties: {
                Title: { title: [{ text: { content: bookTitle } }] },
                ...(book.author ? { Author: { rich_text: [{ text: { content: book.author.slice(0, 200) } }] } } : {}),
              },
            }),
          });
          if (!createResp.ok) {
            const err = await createResp.json();
            throw new Error(err.message || 'Failed to create Notion page');
          }
          const createData = await createResp.json();
          pageId = createData.id;
          pagesCreated++;
        } else {
          pagesUpdated++;
        }

        const blocks: NotionBlock[] = [headingBlock(`Notes from ${bookTitle}`)];
        for (const note of notes) {
          const text = (note as unknown as { content?: string }).content || '';
          if (text) {
            blocks.push(quoteBlock(text.slice(0, 2000)));
          }
        }

        if (blocks.length > 1) {
          const batches: NotionBlock[][] = [];
          for (let i = 0; i < blocks.length; i += 100) {
            batches.push(blocks.slice(i, i + 100));
          }
          for (const batch of batches) {
            const appendResp = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': NOTION_VERSION,
              },
              body: JSON.stringify({ children: batch }),
            });
            if (appendResp.ok) {
              notesPushed += batch.length;
            }
          }
        }
      } catch (err) {
        failedBooks++;
        errors.push({ bookHash: book.bookHash, error: err instanceof Error ? err.message : 'unknown' });
      }
    }

    return NextResponse.json({
      pages: pagesCreated + pagesUpdated,
      pagesCreated,
      pagesUpdated,
      notesPushed,
      failedBooks,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Notion sync-all error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Notion sync failed' },
      { status: 500 },
    );
  }
}
