// Readest Lite — NativeDatabaseService stub.
// 原文件依赖 tauri-plugin-turso（src-tauri 子模块），web 构建不需要。
// 此 stub 仅在 web 平台保留类型占位，运行时不会被调用（environment.ts 仅在
// isTauriAppPlatform() 为 true 时才动态 import NativeAppService）。
import { DatabaseService, DatabaseExecResult, DatabaseRow } from '@/types/database';

export class NativeDatabaseService implements DatabaseService {
  private constructor() {
    // no-op
  }

  static async open(_path: string, _opts?: unknown): Promise<NativeDatabaseService> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async execute(_sql: string, _params?: unknown[]): Promise<DatabaseExecResult> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async select<T extends DatabaseRow = DatabaseRow>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async batch(_statements: string[]): Promise<void> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async close(): Promise<void> {
    throw new Error('NativeDatabaseService is not available in web build');
  }
}
