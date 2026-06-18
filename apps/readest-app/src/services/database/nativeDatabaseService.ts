// Readest Lite — NativeDatabaseService stub.
// 原文件依赖 tauri-plugin-turso（src-tauri 子模块），web 构建不需要。
// 此 stub 仅在 web 平台保留类型占位，运行时不会被调用（environment.ts 仅在
// isTauriAppPlatform() 为 true 时才动态 import NativeAppService）。
import { DatabaseService } from '@/types/database';

export class NativeDatabaseService implements DatabaseService {
  private constructor() {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  static async open(_path: string, _opts?: unknown): Promise<NativeDatabaseService> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async exec(_sql: string, _params?: unknown[]): Promise<unknown> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async query(_sql: string, _params?: unknown[]): Promise<unknown[]> {
    throw new Error('NativeDatabaseService is not available in web build');
  }

  async close(): Promise<void> {
    throw new Error('NativeDatabaseService is not available in web build');
  }
}
