// CRDT 合并函数（替代 Postgres PL/pgSQL 的 crdt_merge_replica / crdt_merge_fields /
// crdt_compute_updated_at / hlc_max）。
// 与 src/libs/crdt.ts 客户端版本语义等价。
// 参考 docker/volumes/db/migrations/004_crdt_merge_replica_fn.sql + 005_replica_manifest_cursor_updated_at.sql。

// HLC 字符串格式：`${physicalMs:13-hex}-${counter:8-hex}-${deviceId}`
// 字典序 = 时间序（13-hex 物理时间在前）。

// 重用 types/replica.ts 的类型，避免重复定义造成类型不兼容
import type { ReplicaRow, Hlc, FieldEnvelope, FieldsObject, Manifest } from '@/types/replica';
export type { ReplicaRow, Hlc, FieldEnvelope, FieldsObject, Manifest };

export const hlcMax = (a: string | null, b: string | null): string | null => {
  if (a == null) return b;
  if (b == null) return a;
  return a >= b ? a : b;
};

// FieldEnvelope 已从 @/types/replica 导入，无需重复定义

// 判断对象是否为 cipher envelope（{c,i,s,alg,h}）
const isCipherEnvelope = (v: unknown): boolean =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { c?: unknown }).c === 'string' &&
  typeof (v as { i?: unknown }).i === 'string' &&
  typeof (v as { s?: unknown }).s === 'string' &&
  typeof (v as { alg?: unknown }).alg === 'string' &&
  typeof (v as { h?: unknown }).h === 'string';

// 字段级 LWW 合并：保留双方字段，按 envelope.t 取大者；HLC 相等按 envelope.s 字典序取大者。
export const crdtMergeFields = (
  local: Record<string, FieldEnvelope> | null,
  remote: Record<string, FieldEnvelope> | null,
): Record<string, FieldEnvelope> => {
  const result: Record<string, FieldEnvelope> = { ...(local ?? {}) };
  if (!remote) return result;
  for (const [k, rEnv] of Object.entries(remote)) {
    const lEnv = result[k];
    if (!lEnv) {
      result[k] = rEnv;
      continue;
    }
    if (rEnv.t > lEnv.t) {
      result[k] = rEnv;
    } else if (rEnv.t === lEnv.t) {
      const lS = lEnv.s ?? '';
      const rS = rEnv.s ?? '';
      if (rS > lS) result[k] = rEnv;
    }
  }
  return result;
};

// 计算 row 的 updated_at_ts = max(field HLCs, deleted_at)
export const crdtComputeUpdatedAt = (
  fields: Record<string, FieldEnvelope> | null,
  deletedAt: string | null,
): string => {
  let result = deletedAt ?? '0000000000000-00000000-';
  if (fields) {
    for (const env of Object.values(fields)) {
      if (env.t && env.t > result) result = env.t;
    }
  }
  return result;
};

export interface ReplicaMergeInput {
  userId: string;
  kind: string;
  replicaId: string;
  fieldsJsonb: Record<string, FieldEnvelope>;
  manifestJsonb: Manifest | null;
  deletedAtTs: string | null;
  reincarnation: string | null;
  updatedAtTs: string;
  schemaVersion: number;
}

// 完整行合并（与 migration 005 等价）。
// `local` 为 null 表示 INSERT；否则为 UPDATE。
export const crdtMergeReplica = (
  local: ReplicaRow | null,
  remote: ReplicaMergeInput,
): ReplicaRow => {
  if (!local) {
    return {
      user_id: remote.userId,
      kind: remote.kind,
      replica_id: remote.replicaId,
      fields_jsonb: remote.fieldsJsonb ?? {},
      manifest_jsonb: remote.manifestJsonb,
      deleted_at_ts: remote.deletedAtTs,
      reincarnation: remote.reincarnation,
      updated_at_ts: remote.updatedAtTs,
      schema_version: remote.schemaVersion,
    };
  }

  const mergedFields = crdtMergeFields(local.fields_jsonb, remote.fieldsJsonb);
  const mergedDeletedAt = hlcMax(local.deleted_at_ts, remote.deletedAtTs);

  // reincarnation 合并（migration 005）
  let reincarnation: string | null;
  const mergedMax = mergedDeletedAt;
  if (local.reincarnation === null && remote.reincarnation === null) {
    reincarnation = null;
  } else if (local.reincarnation !== null && remote.reincarnation === null) {
    reincarnation =
      mergedMax === null || local.updated_at_ts > mergedMax ? local.reincarnation : null;
  } else if (local.reincarnation === null && remote.reincarnation !== null) {
    reincarnation =
      mergedMax === null || remote.updatedAtTs > mergedMax ? remote.reincarnation : null;
  } else if (remote.updatedAtTs > local.updated_at_ts) {
    reincarnation =
      mergedMax === null || remote.updatedAtTs > mergedMax ? remote.reincarnation : null;
  } else {
    reincarnation =
      mergedMax === null || local.updated_at_ts > mergedMax ? local.reincarnation : null;
  }

  // manifest 合并（migration 005）：远端 null 不覆盖本地
  let manifest: ReplicaRow['manifest_jsonb'];
  if (remote.manifestJsonb === null) {
    manifest = local.manifest_jsonb;
  } else if (local.manifest_jsonb === null) {
    manifest = remote.manifestJsonb;
  } else if (remote.updatedAtTs > local.updated_at_ts) {
    manifest = remote.manifestJsonb;
  } else {
    manifest = local.manifest_jsonb;
  }

  const schemaVersion = Math.max(local.schema_version, remote.schemaVersion);

  // updated_at_ts = max(local, remote, computed)
  const computed = crdtComputeUpdatedAt(mergedFields, mergedDeletedAt);
  const updatedAtTs = hlcMax(hlcMax(local.updated_at_ts, remote.updatedAtTs), computed)!;

  return {
    user_id: local.user_id,
    kind: local.kind,
    replica_id: local.replica_id,
    fields_jsonb: mergedFields,
    manifest_jsonb: manifest,
    deleted_at_ts: mergedDeletedAt,
    reincarnation,
    updated_at_ts: updatedAtTs,
    schema_version: schemaVersion,
  };
};

// replica_keys_forget 的字段剥离逻辑（migration 010）
export const stripCipherEnvelopes = (
  fields: Record<string, FieldEnvelope>,
): Record<string, FieldEnvelope> => {
  const result: Record<string, FieldEnvelope> = {};
  for (const [k, env] of Object.entries(fields)) {
    if (!isCipherEnvelope(env.v)) {
      result[k] = env;
    }
  }
  return result;
};
