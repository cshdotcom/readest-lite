import { useCallback, useEffect, useRef } from 'react';
import { Book } from '@/types/book';
import { useSync } from '@/hooks/useSync';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import { SYNC_BOOKS_INTERVAL_SEC } from '@/services/constants';
import { throttle } from '@/utils/throttle';
import { debounce } from '@/utils/debounce';
import { eventDispatcher } from '@/utils/event';

export const useBooksSync = () => {
  const _ = useTranslation();
  const { user } = useAuth();
  const { appService } = useEnv();
  const { library, isSyncing, libraryLoaded } = useLibraryStore();
  const { setLibrary, setIsSyncing, setSyncProgress } = useLibraryStore();
  const { useSyncInited, syncedBooks, syncBooks, lastSyncedAtBooks } = useSync();
  const isPullingRef = useRef(false);

  // v8.3.0: 用户切换检测
  // - prevUserIdRef 记录上次的 user.id
  // - replaceModeRef 标记下次 updateLibrary 走 replace 模式（不 merge）
  // - didInitialPushRef 标记登录后是否已 push 过一次未同步的书
  const prevUserIdRef = useRef<string | null>(null);
  const replaceModeRef = useRef(false);
  const didInitialPushRef = useRef(false);

  const getNewBooks = useCallback(() => {
    if (!user) return {};
    const library = useLibraryStore.getState().library;
    const newBooks = library
      .filter(
        (book) =>
          !book.syncedAt ||
          lastSyncedAtBooks < book.updatedAt ||
          lastSyncedAtBooks < (book.deletedAt ?? 0),
      )
      // book.filePath is a device-local absolute path used by the in-place
      // import flow to point at a file outside Books/<hash>/. It is
      // meaningless on any other device, so strip it before pushing to the
      // cloud — peers always rehydrate via the hash-keyed copy that
      // cloudService.downloadBook lands under Books/<hash>/. Keeping the
      // source device's path in the cloud record would be dead data at
      // best, and would become an active footgun if isBookAvailable ever
      // got its branch order swapped (it currently checks Books/<hash>
      // before falling back to filePath; flipping that order would make
      // peers chase a non-existent path instead of downloading).
      .map(({ filePath: _filePath, ...rest }): Book => rest);
    return {
      books: newBooks,
      lastSyncedAt: lastSyncedAtBooks,
    };
  }, [user, lastSyncedAtBooks]);

  const pullLibrary = useCallback(
    async (fullRefresh = false, verbose = false) => {
      if (!user) return;
      if (isPullingRef.current) return;
      try {
        isPullingRef.current = true;
        const library = useLibraryStore.getState().library;
        const since = (libraryLoaded && library.length === 0) || fullRefresh ? 0 : undefined;
        const syncedBooksCount = await syncBooks([], 'pull', since);
        if (verbose) {
          eventDispatcher.dispatch('toast', {
            type: 'info',
            message: _('{{count}} book(s) synced', { count: syncedBooksCount }),
          });
        }
      } finally {
        isPullingRef.current = false;
      }
    },
    [_, user, libraryLoaded, syncBooks],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleAutoSync = useCallback(
    throttle(
      async () => {
        if (isPullingRef.current) return;
        const newBooks = getNewBooks();
        if (!newBooks.lastSyncedAt) return;
        isPullingRef.current = true;
        try {
          await syncBooks(newBooks.books, 'both');
        } finally {
          isPullingRef.current = false;
        }
      },
      SYNC_BOOKS_INTERVAL_SEC * 1000,
      { emitLast: true },
    ),
    [syncBooks],
  );

  useEffect(() => {
    if (!user) return;
    if (isPullingRef.current) return;
    handleAutoSync();
  }, [user, library, handleAutoSync]);

  const pushLibrary = useCallback(async () => {
    if (!user) return;
    const newBooks = getNewBooks();
    if (newBooks.lastSyncedAt) {
      await syncBooks(newBooks?.books, 'push');
    }
  }, [user, syncBooks, getNewBooks]);

  useEffect(() => {
    if (!user || !useSyncInited || !libraryLoaded) return;
    pullLibrary();
  }, [user, useSyncInited, libraryLoaded, pullLibrary]);

  // v8.4: 用户切换检测 — 检测 user.id 变化时清空 library + 触发全量 pull replace
  // v8.4 改动：不再清磁盘（加密文件 library-<userId>.enc 按 userId 隔离，自动不串号）
  // 只清内存 state，让 pullLibrary 走 since=0 全量拉新账号的书
  // 场景：登出账号 A → 登录账号 B
  //   - prevUserIdRef.current = A, user.id = B → 检测到切换
  //   - 清空 library state（内存）
  //   - 不清磁盘（A 的 library-A.enc 保留，B 用 library-B.enc）
  //   - 设 replaceModeRef = true，让下次 updateLibrary 走 replace（不 merge）
  //   - 重置 didInitialPushRef，让登录后 push effect 重新触发
  // 场景：未登录 → 登录（prevUserIdRef.current = null）
  //   - 不清 library（保留未登录时导入的书，让它们 push 到当前账号）
  // 场景：首次安装（prevUserIdRef.current = null）
  //   - 不清 library（正常流程）
  useEffect(() => {
    const prevId = prevUserIdRef.current;
    const currId = user?.id ?? null;
    if (prevId === currId) return;
    prevUserIdRef.current = currId;

    if (prevId !== null && currId !== null && prevId !== currId) {
      // 账号切换（A → B）：只清内存 state（磁盘加密文件按 userId 隔离）
      useLibraryStore.getState().setLibrary([]);
      replaceModeRef.current = true;
      didInitialPushRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // v8.3.0: 登录后显式 push 未同步的书
  // 解决"未登录时导入书 → 登录后自动同步"的时序问题
  // pullLibrary 完成后 lastSyncedAtBooks > 0，pushLibrary 的守卫通过，push 未同步书
  useEffect(() => {
    if (!user || !useSyncInited || !libraryLoaded) return;
    if (didInitialPushRef.current) return;
    if (lastSyncedAtBooks === 0) return; // 等 pull 完成设了 cursor 再 push
    didInitialPushRef.current = true;
    pushLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, useSyncInited, libraryLoaded, lastSyncedAtBooks]);

  const updateLibrary = useCallback(async () => {
    if (!syncedBooks?.length) return;

    // v8.3.0: replace 模式 — 用户切换账号时，直接用 syncedBooks 替换整个 library
    // 不走 merge 逻辑，防止上个账号的书被保留
    if (replaceModeRef.current) {
      replaceModeRef.current = false;
      syncedBooks.sort((a, b) => a.updatedAt - b.updatedAt);
      const newLibrary = await Promise.all(
        syncedBooks.map(async (book) => {
          if (book.uploadedAt && !book.coverDownloadedAt) {
            book.coverImageUrl = await appService?.generateCoverImageUrl(book);
          }
          book.syncedAt = Date.now();
          return book;
        }),
      );
      // 批量下载封面
      const needsCover = newLibrary.filter(
        (book) => !book.deletedAt && book.uploadedAt && !book.coverDownloadedAt,
      );
      if (needsCover.length > 0) {
        setIsSyncing(true);
        try {
          const batchSize = 10;
          for (let i = 0; i < needsCover.length; i += batchSize) {
            const batch = needsCover.slice(i, i + batchSize);
            await appService?.downloadBookCovers(batch);
            setSyncProgress(Math.min((i + batchSize) / needsCover.length, 1));
          }
        } finally {
          setIsSyncing(false);
        }
      }
      setLibrary(newLibrary);
      appService?.saveLibraryBooks(newLibrary, { replace: true });
      return;
    }

    // Process old books first so that when we update the library the order is preserved
    syncedBooks.sort((a, b) => a.updatedAt - b.updatedAt);
    const bookHashesInSynced = new Set(syncedBooks.map((book) => book.hash));
    const liveLibrary = useLibraryStore.getState().library;
    const oldBooks = liveLibrary.filter((book) => bookHashesInSynced.has(book.hash));
    const oldBooksNeedsDownload = oldBooks.filter((book) => {
      return !book.deletedAt && book.uploadedAt && !book.coverDownloadedAt;
    });

    const processOldBook = async (oldBook: Book) => {
      const matchingBook = syncedBooks.find((newBook) => newBook.hash === oldBook.hash);
      if (matchingBook) {
        if (!matchingBook.deletedAt && matchingBook.uploadedAt && !oldBook.coverDownloadedAt) {
          oldBook.coverImageUrl = await appService?.generateCoverImageUrl(oldBook);
        }
        const mergedBook =
          matchingBook.updatedAt >= oldBook.updatedAt
            ? { ...oldBook, ...matchingBook, syncedAt: Date.now() }
            : { ...matchingBook, ...oldBook, syncedAt: Date.now() };
        return mergedBook;
      }
      return oldBook;
    };

    const oldBooksBatchSize = 100;
    for (let i = 0; i < oldBooksNeedsDownload.length; i += oldBooksBatchSize) {
      const batch = oldBooksNeedsDownload.slice(i, i + oldBooksBatchSize);
      await appService?.downloadBookCovers(batch);
    }

    const updatedLibrary = await Promise.all(liveLibrary.map(processOldBook));
    setLibrary(updatedLibrary);
    appService?.saveLibraryBooks(updatedLibrary);

    const bookHashesInLibrary = new Set(updatedLibrary.map((book) => book.hash));
    const newBooks = syncedBooks.filter(
      (newBook) =>
        !bookHashesInLibrary.has(newBook.hash) && newBook.uploadedAt && !newBook.deletedAt,
    );

    const processNewBook = async (newBook: Book) => {
      newBook.coverImageUrl = await appService?.generateCoverImageUrl(newBook);
      newBook.syncedAt = Date.now();
      updatedLibrary.push(newBook);
    };

    if (newBooks.length > 0) {
      setIsSyncing(true);
    }
    try {
      const batchSize = 10;
      for (let i = 0; i < newBooks.length; i += batchSize) {
        const batch = newBooks.slice(i, i + batchSize);
        await appService?.downloadBookCovers(batch);
        await Promise.all(batch.map(processNewBook));
        const progress = Math.min((i + batchSize) / newBooks.length, 1);
        setSyncProgress(progress);
        setLibrary([...updatedLibrary]);
        appService?.saveLibraryBooks(updatedLibrary);
      }
    } catch (err) {
      console.error('Error updating new books:', err);
    } finally {
      if (newBooks.length > 0) {
        setIsSyncing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedBooks]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdateLibrary = useCallback(
    debounce(() => updateLibrary(), 10000),
    [updateLibrary],
  );

  useEffect(() => {
    // Defer processing synced books until the library has been loaded from
    // disk. Otherwise updateLibrary runs against an empty `library`
    // closure, treats every synced book as new, and the resulting
    // `setLibrary([only sync books])` can race with initLibrary's
    // `setLibrary([disk books])` — the empty-merged save can land on disk
    // afterwards and overwrite the loaded snapshot. The synced books stay
    // queued in `syncedBooks` state; this effect re-fires when
    // libraryLoaded flips to true and processes them then.
    if (!libraryLoaded) return;
    if (isSyncing) {
      debouncedUpdateLibrary();
    } else {
      updateLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedBooks, updateLibrary, debouncedUpdateLibrary, libraryLoaded]);

  return { pullLibrary, pushLibrary };
};
