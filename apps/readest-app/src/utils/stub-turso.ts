// Lite stub for tauri-plugin-turso — web platform has no native turso
export interface QueryResult {
  rowsAffected?: number;
  rows?: unknown[];
  lastInsertRowid?: number | bigint;
  columns?: string[];
}
export class Database {
  static load(_opts?: string | Record<string, unknown>): Database { return new Database(); }
  async execute(_sql?: string, _params?: unknown[]): Promise<QueryResult> { return {}; }
  async select<T = unknown[]>(_sql?: string, _params?: unknown[]): Promise<T> { return [] as T; }
  async batch(_stmts?: unknown[]): Promise<QueryResult[]> { return []; }
  close(): void {}
  path: string = '';
}
export type LoadOptions = string | Record<string, unknown>;
