// =====================================================
// GAS API クライアント
//   fetch ベース（RN の fetch はリダイレクトを自動追従するため
//   Electron 版のような手動リダイレクト処理は不要）。
//   Content-Type は text/plain として送信し、GAS 側は
//   e.postData.contents を JSON.parse する。
// =====================================================

import { GAS_URL, REQUEST_TIMEOUT_MS, ONLINE_CHECK_URL } from './config';
import { hashPassword } from './crypto';
import type {
  LoginResult,
  BaseResult,
  RequestApprovalResult,
  CheckApprovalResult,
  ListRequestsResult,
  RespondRequestResult,
  GetLogsResult,
} from './types';

async function postToGAS<T extends BaseResult>(
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('レスポンスのパースに失敗しました: ' + text.slice(0, 200));
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('タイムアウトしました。ネットワークを確認してください。');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ------- 認証 -------

/** ID + 平文パスワードでログイン（ハッシュ化はこの中で実施） */
export function login(userId: string, password: string): Promise<LoginResult> {
  return postToGAS<LoginResult>({
    action: 'login',
    userId,
    passwordHash: hashPassword(password),
  });
}

/** 事前にハッシュ化済みの資格情報でログイン（保存済み資格情報の再利用など） */
export function loginWithHash(userId: string, passwordHash: string): Promise<LoginResult> {
  return postToGAS<LoginResult>({ action: 'login', userId, passwordHash });
}

/** ログアウト記録 */
export function logout(userId: string, userName: string): Promise<BaseResult> {
  return postToGAS<BaseResult>({ action: 'logout', userId, userName });
}

// ------- モバイル承認フロー（PC 側） -------

/** PC: 承認リクエストを作成 */
export function requestApproval(
  userId: string,
  deviceName: string,
): Promise<RequestApprovalResult> {
  return postToGAS<RequestApprovalResult>({
    action: 'requestApproval',
    userId,
    deviceName,
  });
}

/** PC: 承認状態を確認 */
export function checkApproval(requestId: string): Promise<CheckApprovalResult> {
  return postToGAS<CheckApprovalResult>({ action: 'checkApproval', requestId });
}

// ------- モバイル承認フロー（モバイル側） -------

/** モバイル: 保留中の承認リクエスト一覧 */
export function listRequests(
  userId: string,
  passwordHash: string,
): Promise<ListRequestsResult> {
  return postToGAS<ListRequestsResult>({
    action: 'listRequests',
    userId,
    passwordHash,
  });
}

/** モバイル: 承認 / 拒否 */
export function respondRequest(
  userId: string,
  passwordHash: string,
  requestId: string,
  decision: 'approve' | 'deny',
): Promise<RespondRequestResult> {
  return postToGAS<RespondRequestResult>({
    action: 'respondRequest',
    userId,
    passwordHash,
    requestId,
    decision,
  });
}

// ------- ログ -------

/** モバイル: 利用ログを取得 */
export function getLogs(
  userId: string,
  passwordHash: string,
  limit = 50,
): Promise<GetLogsResult> {
  return postToGAS<GetLogsResult>({ action: 'getLogs', userId, passwordHash, limit });
}

// ------- オンライン判定 -------

/** インターネット接続の簡易チェック */
export async function checkOnline(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(ONLINE_CHECK_URL, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
