// 用户书籍分组 API — GET / POST /api/book-groups
// GET  → 列出当前用户的所有自定义分组
// POST → 创建新分组（body: { name: string, sortOrder?: number }）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const groups = await prismaClient.bookGroup.findMany({
    where: { userId: user.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return NextResponse.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sortOrder,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = (body.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Group name too long (max 100)' }, { status: 400 });
    }

    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : 0;

    const existing = await prismaClient.bookGroup.findUnique({
      where: { userId_name: { userId: user.id, name } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Group name already exists' }, { status: 409 });
    }

    const group = await prismaClient.bookGroup.create({
      data: { userId: user.id, name, sortOrder },
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error('Create group error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create group' },
      { status: 500 },
    );
  }
}
