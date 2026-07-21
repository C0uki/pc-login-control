// =====================================================
// API クライアント（Vercel + Supabase バックエンド）
//   fetch ベース。GAS と同じアクションベースの契約なので、
//   バックエンド移行後も API_URL を差し替えるだけで動作する。
// =====================================================

import { API_URL, ORG_ID, REQUEST_TIMEOUT_MS, ONLINE_CHECK_URL } from './config';
import { hashPassword } from './crypto';
import type {
  LoginResult,
  BaseResult,
  RequestApprovalResult,
  CheckApprovalResult,
  ListRequestsResult,
  RespondRequestResult,
  GetLogsResult,
  RegisterResult,
  CreateOrgResult,
} from './types';

// 現在の組織ID（config の ORG_ID を既定値とし、実行時に上書き可能）
let currentOrgId = ORG_ID;

/** 組織IDを設定（初回起動時に組織コードを入力させる等） */
export function setOrgId(orgId: string): void {
  currentOrgId = orgId;
}

/** 現在の組織IDを取得 */
export function getOrgId(): string {
  return currentOrgId;
}

async function postToApi<T extends BaseResult>(
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // すべてのリクエストに組織IDを付与（payload 側で明示された場合はそちらを優先）
    const body = { orgId: currentOrgId, ...payload };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

// ------- 組織（セルフサービス登録） -------

/** 組織を作成して組織IDを取得（導入者/管理者向け） */
export function createOrg(
  orgName: string,
  masterPassword: string,
  signupCode?: string,
): Promise<CreateOrgResult> {
  return postToApi<CreateOrgResult>({
    action: 'createOrg',
    orgName,
    masterPasswordHash: hashPassword(masterPassword),
    signupCode,
  });
}

// ------- 認証 -------

/** ID + 平文パスワードでログイン（ハッシュ化はこの中で実施） */
export function login(userId: string, password: string): Promise<LoginResult> {
  return postToApi<LoginResult>({
    action: 'login',
    userId,
    passwordHash: hashPassword(password),
  });
}

/** 事前にハッシュ化済みの資格情報でログイン（保存済み資格情報の再利用など） */
export function loginWithHash(userId: string, passwordHash: string): Promise<LoginResult> {
  return postToApi<LoginResult>({ action: 'login', userId, passwordHash });
}

/** ログアウト記録 */
export function logout(userId: string, userName: string): Promise<BaseResult> {
  return postToApi<BaseResult>({ action: 'logout', userId, userName });
}

// ------- モバイル承認フロー（PC 側） -------

/** PC: 承認リクエストを作成 */
export function requestApproval(
  userId: string,
  deviceName: string,
): Promise<RequestApprovalResult> {
  return postToApi<RequestApprovalResult>({
    action: 'requestApproval',
    userId,
    deviceName,
  });
}

/** PC: 承認状態を確認 */
export function checkApproval(requestId: string): Promise<CheckApprovalResult> {
  return postToApi<CheckApprovalResult>({ action: 'checkApproval', requestId });
}

// ------- モバイル承認フロー（モバイル側） -------

/** モバイル: 保留中の承認リクエスト一覧 */
export function listRequests(
  userId: string,
  passwordHash: string,
): Promise<ListRequestsResult> {
  return postToApi<ListRequestsResult>({
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
  return postToApi<RespondRequestResult>({
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
  return postToApi<GetLogsResult>({ action: 'getLogs', userId, passwordHash, limit });
}

// ------- ユーザー登録（マスター権限） -------

/**
 * マスター権限で新規ユーザーを登録 / 更新（Google フォームの置き換え）。
 * @param admin   マスターの資格情報（userId は 'MASTER'、passwordHash はマスターPWのハッシュ）
 * @param newUser 登録するユーザー（password は平文。ここでハッシュ化して送信）
 */
export function register(
  admin: { userId: string; passwordHash: string },
  newUser: { userId: string; userName: string; password: string },
): Promise<RegisterResult> {
  return postToApi<RegisterResult>({
    action: 'register',
    userId: admin.userId,
    passwordHash: admin.passwordHash,
    newUserId: newUser.userId,
    newUserName: newUser.userName,
    newPasswordHash: hashPassword(newUser.password),
  });
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
