/**
 * Lite stub for `@/services/audiobook/mapping`.
 * Audiobook text-chapter mapping is not supported in web-only Lite.
 */

import type { TOCItem } from '@/libs/document';

export interface AudiobookTextChapter {
  title: string;
  href: string;
  start?: number;
  end?: number;
}

export interface AudiobookMappingAnchor {
  href: string;
  fragment?: string;
}

export const collectAudiobookTextChapters = (
  _toc: TOCItem[],
): AudiobookTextChapter[] => [];

export const buildSequentialAudiobookMappings = (
  _toc: TOCItem[],
  _durations: number[],
): AudiobookMappingAnchor[][] => [];
