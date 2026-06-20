import { FileSystem, SaveLibraryBooksOptions } from '@/types/system';
import { Book } from '@/types/book';
import { getLibraryFilename } from '@/utils/book';
import { safeLoadJSON, safeSaveJSON } from './persistence';
import { isVaultActive, getVaultKey, getVaultUserId } from '@/utils/vaultState';
import { encryptToEnvelope, decryptFromEnvelope } from '@/libs/crypto/envelope';
import type { CipherEnvelope } from '@/types/replica';

const COVER_CONCURRENCY = 20;

async function processInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

// v8.4: 根据 vault 状态决定文件名
// vault 激活时用 per-user 文件名，否则用全局 library.json
function getEffectiveLibraryFilename(): string {
  const userId = getVaultUserId();
  if (isVaultActive() && userId) {
    return `library-${userId}.enc`;
  }
  return getLibraryFilename();
}

// v8.4: 加密读取 — 尝试解密 .enc 文件，失败则回退到明文
async function loadLibraryEncrypted(fs: FileSystem, filename: string): Promise<Book[]> {
  const vaultKey = getVaultKey();
  if (!vaultKey) return [];

  try {
    const txt = await fs.readFile(filename, 'Books', 'text');
    if (!txt || typeof txt !== 'string' || txt.trim().length === 0) return [];
    const envelope = JSON.parse(txt as string) as CipherEnvelope;
    const plain = await decryptFromEnvelope(envelope, vaultKey);
    return JSON.parse(plain) as Book[];
  } catch (err) {
    console.warn('Failed to decrypt library, trying backup:', err);
    // 尝试 .bak
    try {
      const bakTxt = await fs.readFile(`${filename}.bak`, 'Books', 'text');
      if (!bakTxt || typeof bakTxt !== 'string') return [];
      const envelope = JSON.parse(bakTxt as string) as CipherEnvelope;
      const plain = await decryptFromEnvelope(envelope, vaultKey);
      return JSON.parse(plain) as Book[];
    } catch {
      return [];
    }
  }
}

// v8.4: 加密写入
async function saveLibraryEncrypted(fs: FileSystem, filename: string, books: Book[]): Promise<void> {
  const vaultKey = getVaultKey();
  if (!vaultKey) throw new Error('Vault key not available for encrypted save');

  const plain = JSON.stringify(books);
  const envelope = await encryptToEnvelope(plain, vaultKey, 'vault');
  const jsonData = JSON.stringify(envelope);

  try {
    await fs.writeFile(`${filename}.bak`, 'Books', jsonData);
    await fs.writeFile(filename, 'Books', jsonData);
  } catch (error) {
    console.error(`Failed to save encrypted library ${filename}:`, error);
    throw error;
  }
}

export async function loadLibraryBooks(
  fs: FileSystem,
  generateCoverImageUrl: (book: Book) => Promise<string>,
): Promise<Book[]> {
  const libraryFilename = getEffectiveLibraryFilename();

  if (!(await fs.exists('', 'Books'))) {
    await fs.createDir('', 'Books', true);
  }

  let books: Book[];

  if (isVaultActive()) {
    // v8.4: 加密模式
    books = await loadLibraryEncrypted(fs, libraryFilename);
    // 如果加密文件为空，尝试读旧的全局明文 library.json（迁移场景）
    if (books.length === 0) {
      const oldBooks = await safeLoadJSON<Book[]>(fs, getLibraryFilename(), 'Books', []);
      if (oldBooks.length > 0) {
        books = oldBooks;
        // 立即加密写入新文件
        await saveLibraryEncrypted(fs, libraryFilename, oldBooks.map(({ coverImageUrl: _c, ...rest }) => rest));
      }
    }
  } else {
    // 明文模式（未登录）
    books = await safeLoadJSON<Book[]>(fs, libraryFilename, 'Books', []);
  }

  await processInBatches(books, COVER_CONCURRENCY, async (book) => {
    book.coverImageUrl = await generateCoverImageUrl(book);
    book.updatedAt ??= book.lastUpdated || Date.now();
  });

  return books;
}

export async function saveLibraryBooks(
  fs: FileSystem,
  books: Book[],
  options?: SaveLibraryBooksOptions,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const incoming = books.map(({ coverImageUrl, ...rest }) => rest);
  const libraryFilename = getEffectiveLibraryFilename();

  if (isVaultActive()) {
    // v8.4: 加密模式
    if (options?.replace) {
      await saveLibraryEncrypted(fs, libraryFilename, incoming);
      return;
    }
    // merge-floor: 读现有加密数据 → merge → 加密写回
    const existing = await loadLibraryEncrypted(fs, libraryFilename);
    const merged = new Map<string, Book>();
    for (const book of existing) merged.set(book.hash, book);
    for (const book of incoming) merged.set(book.hash, book);
    await saveLibraryEncrypted(fs, libraryFilename, Array.from(merged.values()));
    return;
  }

  // 明文模式（未登录）— 原逻辑不变
  if (options?.replace) {
    await safeSaveJSON(fs, libraryFilename, 'Books', incoming);
    return;
  }

  const existing = await safeLoadJSON<Book[]>(fs, libraryFilename, 'Books', []);
  const merged = new Map<string, Book>();
  for (const book of existing) merged.set(book.hash, book);
  for (const book of incoming) merged.set(book.hash, book);
  await safeSaveJSON(fs, libraryFilename, 'Books', Array.from(merged.values()));
}
