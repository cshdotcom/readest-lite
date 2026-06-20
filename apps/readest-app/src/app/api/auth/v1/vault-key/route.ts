// v8.4: Vault 密钥 API
// GET  /api/auth/v1/vault-key — 获取当前用户的加密 vault 密钥 K_enc
// PUT  /api/auth/v1/vault-key — 存储加密的 vault 密钥 K_enc（登出时调用）
//
// K_enc 是用密码派生 KE 加密的随机 AES 密钥 K 的 CipherEnvelope JSON
// 客户端需要密码才能解密 K_enc → K，服务端只存密文
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';

// GET — 获取 K_enc
export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const dbUser = await prismaClient.user.findUnique({
    where: { id: user.id },
    select: { encryptedVaultKey: true },
  });

  return NextResponse.json({
    encryptedVaultKey: dbUser?.encryptedVaultKey ?? null,
  });
}

// PUT — 存储 K_enc（登出加密后调用）
export async function PUT(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { encryptedVaultKey } = await req.json();

    if (typeof encryptedVaultKey !== 'string') {
      return NextResponse.json({ error: 'encryptedVaultKey must be a string' }, { status: 400 });
    }

    await prismaClient.user.update({
      where: { id: user.id },
      data: { encryptedVaultKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Vault key PUT error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to store vault key' },
      { status: 500 },
    );
  }
}

// DELETE — 清除 K_enc（改密码时调用，用户需重新设置 vault）
export async function DELETE(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    await prismaClient.user.update({
      where: { id: user.id },
      data: { encryptedVaultKey: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Vault key DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear vault key' },
      { status: 500 },
    );
  }
}
