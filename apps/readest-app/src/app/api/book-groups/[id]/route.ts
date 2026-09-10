// 用户书籍分组单条操作 — PUT /api/book-groups/[id] / DELETE /api/book-groups/[id]
// PUT    body: { name?: string, sortOrder?: number }
// DELETE 同时清理所有引用此分组的 Book.groupName
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prismaClient.bookGroup.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      if (name.length > 100) return NextResponse.json({ error: 'Name too long' }, { status: 400 });
      if (name !== existing.name) {
        const conflict = await prismaClient.bookGroup.findUnique({
          where: { userId_name: { userId: user.id, name } },
        });
        if (conflict) {
          return NextResponse.json({ error: 'Group name already exists' }, { status: 409 });
        }
      }
      updateData['name'] = name;
    }
    if (typeof body.sortOrder === 'number') {
      updateData['sortOrder'] = body.sortOrder;
    }

    const updated = await prismaClient.bookGroup.update({ where: { id }, data: updateData });

    // 同步更新 Book.groupName（如果分组名变更）
    if (typeof updateData['name'] === 'string' && updateData['name'] !== existing.name) {
      await prismaClient.book.updateMany({
        where: { userId: user.id, groupName: existing.name, deletedAt: null },
        data: { groupName: updateData['name'] as string },
      });
    }

    return NextResponse.json({ group: updated });
  } catch (error) {
    console.error('Update group error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update group' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prismaClient.bookGroup.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // 清理引用此分组名的 Book.groupName（设为 null）
    await prismaClient.book.updateMany({
      where: { userId: user.id, groupName: existing.name, deletedAt: null },
      data: { groupName: null },
    });

    await prismaClient.bookGroup.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete group error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete group' },
      { status: 500 },
    );
  }
}
