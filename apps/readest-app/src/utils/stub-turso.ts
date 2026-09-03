// Lite stub for tauri-plugin-turso — web platform has no native turso
export class Database {
  static load(_opts: string | Record<string, unknown>): Database { return new Database(); }
  async execute(): Promise<Record<string, unknown>> { return {}; }
  async select<T = unknown[]>(): Promise<T> { return [] as T; }
  async batch(): Promise<unknown[]> { return []; }
  close(): void {}
  path: string = '';
}
export type LoadOptions = string | Record<string, unknown>;
export type QueryResult = Record<string, unknown>;
