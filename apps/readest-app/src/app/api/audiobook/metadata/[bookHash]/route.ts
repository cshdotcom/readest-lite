// 有声书元数据 API — GET /api/audiobook/metadata/[bookHash]
// 返回该有声书的所有音频文件列表（按章节顺序）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ bookHash: string }>;
}

interface AudioChapter {
  index: number;
  title: string;
  fileKey: string;
  fileSize: number;
  fileName: string;
}

const AUDIO_EXTS = ['mp3', 'm4a', 'm4b', 'ogg', 'wav', 'aac', 'flac'];

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }

  const { bookHash } = await params;

  try {
    const book = await prismaClient.book.findUnique({
      where: { userId_bookHash: { userId: user.id, bookHash } },
    });
    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const files = await prismaClient.file.findMany({
      where: { userId: user.id, bookHash, deletedAt: null },
      orderBy: { fileKey: 'asc' },
    });

    const audioFiles = files.filter((f) => {
      const ext = f.fileKey.split('.').pop()?.toLowerCase() || '';
      return AUDIO_EXTS.includes(ext);
    });

    if (audioFiles.length === 0) {
      return NextResponse.json({
        bookHash,
        title: book.title || bookHash,
        author: book.author || '',
        chapters: [],
        message: 'No audio files found. See the tutorial below for how to add audiobooks.',
      });
    }

    const chapters: AudioChapter[] = audioFiles.map((f, i) => {
      const fileName = f.fileKey.split('/').pop() || f.fileKey;
      let title = fileName.replace(/\.[^.]+$/, '');
      title = title.replace(/^\d+[-_.\s]+/, '');
      title = title.replace(/^Chapter\s+\d+[-_.\s:]*/i, '');
      title = title || `Chapter ${i + 1}`;
      return {
        index: i,
        title,
        fileKey: f.fileKey,
        fileSize: Number(f.fileSize),
        fileName,
      };
    });

    return NextResponse.json({
      bookHash,
      title: book.title || bookHash,
      author: book.author || '',
      coverImageUrl: (book.metadata as { coverImageUrl?: string } | null)?.coverImageUrl || null,
      chapters,
    });
  } catch (error) {
    console.error('Audiobook metadata error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch metadata' },
      { status: 500 },
    );
  }
}
