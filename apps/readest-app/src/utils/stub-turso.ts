// Lite stub for tauri-plugin-turso — web platform has no native turso
export interface QueryResult {
  rowsAffected: number;
  lastInsertRowid: number | bigint;
  lastInsertId: number;
  rows?: unknown[];
  columns?: string[];
}
export class Database {
  static load(_opts?: string | Record<string, unknown>): Database { return new Database(); }
  async execute(_sql?: string, _params?: unknown[]): Promise<QueryResult> {
    return { rowsAffected: 0, lastInsertRowid: 0, lastInsertId: 0 };
  }
  async select<T = unknown[]>(_sql?: string, _params?: unknown[]): Promise<T> {
    return [] as T;
  }
  async batch(_stmts?: unknown[]): Promise<QueryResult[]> { return []; }
  close(_path?: string): void {}
  path: string = '';
}
export type LoadOptions = string | Record<string, unknown>;
