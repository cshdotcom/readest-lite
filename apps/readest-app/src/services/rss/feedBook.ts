import { md5 } from '@/utils/md5';
import { buildFeedBookUrl, parseFeedBookUrl } from './feedBookUrl';
import { generateCoverSvg } from '@/services/send/conversion/coverGenerator';
import { getCoverFilename } from '@/utils/book';
import { fetchFeedFavicon } from './favicon';
import type { ParsedFeed } from '@/types/rss';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { EpubImage } from '@/services/send/conversion/types';

// The classic feed icon (Wikimedia Commons "Generic Feed-icon.svg" geometry):
// orange gradient rounded square with the white broadcast dot and two arcs.
// Used as the fallback when the site favicon can't be fetched.
const RSS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="a" x1="0.085" y1="0.085" x2="0.915" y2="0.915"><stop offset="0" stop-color="#E3702D"/><stop offset="0.1071" stop-color="#EA7D31"/><stop offset="0.3503" stop-color="#F69537"/><stop offset="0.5" stop-color="#FB9E3A"/><stop offset="0.7016" stop-color="#EA7C31"/><stop offset="0.8866" stop-color="#DE642B"/><stop offset="1" stop-color="#D95B29"/></linearGradient></defs><rect width="256" height="256" rx="55" fill="#CC5D15"/><rect x="12" y="12" width="232" height="232" rx="44" fill="url(#a)"/><circle cx="68" cy="189" r="24" fill="#FFF"/><path d="M160 213h-34a82 82 0 0 0-82-82V97a116 116 0 0 1 116 116z" fill="#FFF"/><path d="M184 213A140 140 0 0 0 44 73V38a175 175 0 0 1 175 175z" fill="#FFF"/></svg>`;

export function feedBookHash(feedUrl: string): string {
  return md5(buildFeedBookUrl(feedUrl));
}

/**
 * Build the RSS feed book cover SVG. When `favicon` is provided it is
 * embedded as the cover avatar (replacing the generic RSS orange icon);
 * otherwise the default RSS icon is used.
 *
 * v8.18.3: callers usually pass a fetched site favicon (see fetchFeedFavicon).
 * Manual cover overrides (user-uploaded) are saved to Books/<hash>/cover.png
 * and bypass this function entirely.
 */
export function generateFeedCoverSvg(
  feedUrl: string,
  title: string,
  favicon?: { bytes: ArrayBuffer; mime: string } | null,
): EpubImage {
  const fallbackIconBytes = new TextEncoder().encode(RSS_ICON_SVG);
  let siteName = '';
  try {
    siteName = new URL(feedUrl).hostname.replace(/^www\./, '');
  } catch {
    siteName = '';
  }
  return generateCoverSvg({
    title,
    siteName,
    favicon: favicon ?? {
      bytes: fallbackIconBytes.buffer as ArrayBuffer,
      mime: 'image/svg+xml',
    },
  });
}

// Rasterize the generated SVG cover to PNG. The shelf stores covers as
// Books/<hash>/cover.png and the Android WebView will not render SVG bytes
// served under a .png name, so we draw the SVG onto a canvas first (the
// same approach importBook uses for embedded covers).
export async function rasterizeCoverSvg(svg: EpubImage, scale = 2): Promise<ArrayBuffer> {
  const blob = new Blob([svg.bytes], { type: svg.mime || 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load cover SVG'));
      img.src = url;
    });
    const w = img.naturalWidth || 600;
    const h = img.naturalHeight || 900;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/png',
      );
    });
    return await pngBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

type FeedCoverWriter = Pick<
  AppService,
  'exists' | 'createDir' | 'writeFile' | 'generateCoverImageUrl'
>;

/**
 * Make sure Books/<hash>/cover.png holds the generated RSS cover and return its
 * display URL. The image is derived purely from the feed URL and title, so a
 * peer that receives the subscription over sync regenerates the identical cover
 * locally — a feed book has no files in cloud storage to download (#5307).
 *
 * v8.18.3: when the user has not manually set a cover, we attempt to fetch
 * the site favicon (via /api/proxy/resource when proxyEnabled) and embed it
 * in the generated SVG. A failure (offline, no favicon reachable) leaves
 * the default RSS orange icon — the cover still generates and the shelf
 * shows something instead of nothing.
 *
 * Best-effort: a failure leaves the shelf's title-only fallback cover.
 */
export async function ensureFeedBookCover(
  appService: FeedCoverWriter,
  book: Book,
): Promise<string | undefined> {
  try {
    const feedUrl = book.metadata?.feedUrl ?? (book.url ? parseFeedBookUrl(book.url).feedUrl : '');
    const coverFilename = getCoverFilename(book);
    if (!(await appService.exists(coverFilename, 'Books'))) {
      // v8.18.3: try to fetch site favicon. Best-effort — null means we
      // fall back to the default RSS orange icon.
      let favicon: { bytes: ArrayBuffer; mime: string } | null = null;
      if (feedUrl) {
        try {
          favicon = await fetchFeedFavicon(feedUrl);
        } catch (e) {
          console.warn('favicon fetch failed for', feedUrl, e);
        }
      }
      const pngBytes = await rasterizeCoverSvg(generateFeedCoverSvg(feedUrl, book.title, favicon));
      await appService.createDir(book.hash, 'Books', true);
      await appService.writeFile(coverFilename, 'Books', pngBytes);
    }
    return await appService.generateCoverImageUrl(book);
  } catch (e) {
    console.warn('Failed to generate feed book cover:', e);
    return undefined;
  }
}

export function createFeedBook(feedUrl: string, parsed: ParsedFeed): Book {
  const now = Date.now();
  return {
    hash: feedBookHash(feedUrl),
    url: buildFeedBookUrl(feedUrl),
    format: 'EPUB',
    title: parsed.title,
    author: '',
    metadata: { title: parsed.title, author: '', language: '', feedUrl },
    createdAt: now,
    updatedAt: now,
    downloadedAt: now,
    uploadedAt: null,
    deletedAt: null,
  };
}
