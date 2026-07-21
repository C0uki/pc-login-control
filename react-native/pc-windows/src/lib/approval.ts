// =====================================================
// モバイル承認フロー（PC 側）
//   1. requestApproval で承認リクエストを作成
//   2. checkApproval を一定間隔でポーリング
//   3. approved になったらユーザー情報を返す
// =====================================================

import {
  requestApproval,
  checkApproval,
  APPROVAL_POLL_INTERVAL_MS,
  APPROVAL_TIMEOUT_MS,
  type AuthUser,
} from '@pclc/core';

export type ProgressFn = (message: string) => void;

/** 承認完了までポーリングする。承認されれば AuthUser を返し、それ以外は例外を投げる。 */
export async function requestMobileApproval(
  userId: string,
  deviceName: string,
  onProgress?: ProgressFn,
  isCanceled?: () => boolean,
): Promise<AuthUser> {
  const req = await requestApproval(userId, deviceName);
  if (!req.success || !req.requestId) {
    throw new Error(req.message || '承認リクエストの作成に失敗しました');
  }
  onProgress?.(`${req.userName ?? userId} さんのスマホに承認リクエストを送信しました。承認をお待ちしています…`);

  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isCanceled?.()) throw new Error('キャンセルされました');
    await sleep(APPROVAL_POLL_INTERVAL_MS);
    if (isCanceled?.()) throw new Error('キャンセルされました');

    const res = await checkApproval(req.requestId);
    switch (res.status) {
      case 'approved':
        return { userId: res.userId ?? userId, userName: res.userName ?? '' };
      case 'denied':
        throw new Error('スマホ側で拒否されました。');
      case 'expired':
        throw new Error('承認リクエストの有効期限が切れました。');
      default:
        break; // pending: 継続
    }
  }
  throw new Error('承認がタイムアウトしました。もう一度お試しください。');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
