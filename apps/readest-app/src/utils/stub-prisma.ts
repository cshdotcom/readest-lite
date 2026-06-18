// Stub for @prisma/client in client bundle (web build only).
// 服务端构建使用真实 @prisma/client；客户端构建通过 next.config.mjs 的
// turbopack resolveAlias 把 '@prisma/client' 指向此文件。
//
// 关键：PrismaClient 用 any 类型，避免 TS 在客户端 type check 时把所有字段
// 推断为 never（因为客户端代码不实际调用 PrismaClient，但 import 类型时
// TS 会用 stub 的类型签名做检查）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PrismaClient: any = class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(..._args: any[]) {}
  $connect(): Promise<void> { return Promise.resolve(); }
  $disconnect(): Promise<void> { return Promise.resolve(); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Prisma: any = {};
