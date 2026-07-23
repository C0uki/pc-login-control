// =====================================================
// アクションハンドラー（マルチテナント / SaaS）
//   すべての操作は org_id でスコープされます。
//   レスポンス形状はクライアント互換のため従来どおり。
// =====================================================

import { getSupabase } from './supabase';
import { authenticateUser, lookupUserName, getOrg } from './auth';
import type { ApiResult, RequestData, ApprovalStatus } from './types';

const APPROVAL_TTL_SEC = 120;

export async function handle(data: RequestData): Promise<ApiResult> {
  switch (data.action) {
    // --- サインアップ / ヘルス（組織不要） ---
    case 'createOrg':       return handleCreateOrg(data);
    case 'health':          return handleHealth();
    // --- 認証 ---
    case 'login':           return handleLogin(data);
    case 'logout':          return handleLogout(data);
    // --- モバイル承認フロー ---
    case 'requestApproval': return handleRequestApproval(data);
    case 'checkApproval':   return handleCheckApproval(data);
    case 'listRequests':    return handleListRequests(data);
    case 'respondRequest':  return handleRespondRequest(data);
    // --- ログ / ユーザー管理（管理コンソール） ---
    case 'getLogs':         return handleGetLogs(data);
    case 'register':        return handleRegister(data);
    case 'listUsers':       return handleListUsers(data);
    case 'deleteUser':      return handleDeleteUser(data);
    case 'setRegistrationCode': return handleSetRegistrationCode(data);
    // --- 組織ごとの登録フォーム（自己登録・認証不要） ---
    case 'selfRegister':    return handleSelfRegister(data);
    default:                return fail('不正なアクションです');
  }
}

// ---------- 組織作成（セルフサービス登録） ----------

async function handleCreateOrg(data: RequestData): Promise<ApiResult> {
  // 任意: サインアップコードによる制限（オーナーが SIGNUP_CODE を設定した場合）
  const requiredCode = process.env.SIGNUP_CODE;
  if (requiredCode && (data.signupCode ?? '') !== requiredCode) {
    return fail('サインアップコードが正しくありません');
  }

  const name = (data.orgName ?? '').trim();
  const masterHash = (data.masterPasswordHash ?? '').trim();
  if (!name) return fail('組織名が必要です');
  if (!masterHash) return fail('マスターパスワードが必要です');

  const { data: org, error } = await getSupabase()
    .from('organizations')
    .insert({ name, master_pass_hash: masterHash })
    .select('org_id, name')
    .single();
  if (error) throw error;

  return ok('組織を作成しました', { orgId: org.org_id, orgName: org.name });
}

// ---------- login / logout ----------

async function handleLogin(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  await recordLog(auth.orgId!, auth.userId!, auth.userName ?? '', 'login');
  const extra: Record<string, unknown> = {
    orgId: auth.orgId,
    orgName: auth.orgName,
    userId: auth.userId,
    userName: auth.userName,
  };
  // マスターには登録フォームの合言葉の現状も返す（コンソール表示用）
  if (auth.userId === 'MASTER') extra.registrationCode = auth.registrationCode ?? '';
  return ok(auth.userId === 'MASTER' ? 'マスターで認証しました' : 'ログイン成功', extra);
}

async function handleLogout(data: RequestData): Promise<ApiResult> {
  const orgId = (data.orgId ?? '').trim();
  if (!orgId) return fail('組織IDが必要です');
  if (!data.userId) return fail('ユーザー情報がありません');
  await recordLog(orgId, data.userId, data.userName ?? '', 'logout');
  return ok('ログアウト記録完了');
}

// ---------- モバイル承認フロー ----------

async function handleRequestApproval(data: RequestData): Promise<ApiResult> {
  const orgId = (data.orgId ?? '').trim();
  const userId = (data.userId ?? '').trim();
  const deviceName = (data.deviceName ?? 'PC').trim();
  if (!orgId) return fail('組織IDが必要です');
  if (!userId) return fail('ユーザーIDが必要です');

  const userName = await lookupUserName(orgId, userId);
  if (userName === null) return fail('登録されていないユーザーIDです');

  const { data: inserted, error } = await getSupabase()
    .from('approval_requests')
    .insert({ org_id: orgId, user_id: userId, user_name: userName, device_name: deviceName, status: 'pending' })
    .select('request_id')
    .single();
  if (error) throw error;

  return ok('承認リクエストを送信しました', {
    requestId: inserted.request_id,
    userName,
    expiresInSec: APPROVAL_TTL_SEC,
  });
}

async function handleCheckApproval(data: RequestData): Promise<ApiResult> {
  const orgId = (data.orgId ?? '').trim();
  const requestId = (data.requestId ?? '').trim();
  if (!orgId) return fail('組織IDが必要です');
  if (!requestId) return fail('requestId が必要です');

  const { data: row, error } = await getSupabase()
    .from('approval_requests')
    .select('*')
    .eq('org_id', orgId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return fail('リクエストが見つかりません', { status: 'expired' });

  return ok('OK', {
    status: effectiveStatus(row.status, row.created_at),
    userId: row.user_id,
    userName: row.user_name,
  });
}

async function handleListRequests(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const cutoff = new Date(Date.now() - APPROVAL_TTL_SEC * 1000).toISOString();
  let query = getSupabase()
    .from('approval_requests')
    .select('*')
    .eq('org_id', auth.orgId as string)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });
  if (auth.userId !== 'MASTER') query = query.eq('user_id', auth.userId as string);

  const { data: rows, error } = await query;
  if (error) throw error;

  const requests = (rows ?? []).map((r) => ({
    requestId: r.request_id,
    userId: r.user_id,
    userName: r.user_name,
    deviceName: r.device_name,
    status: 'pending' as ApprovalStatus,
    createdAt: toIso(r.created_at),
  }));
  return ok('OK', { requests });
}

async function handleRespondRequest(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const requestId = (data.requestId ?? '').trim();
  const decision = (data.decision ?? '').trim();
  if (!requestId) return fail('requestId が必要です');
  if (decision !== 'approve' && decision !== 'deny') {
    return fail('decision は approve か deny を指定してください');
  }

  const { data: row, error } = await getSupabase()
    .from('approval_requests')
    .select('*')
    .eq('org_id', auth.orgId as string)
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return fail('リクエストが見つかりません');

  const isMaster = auth.userId === 'MASTER';
  if (!isMaster && String(row.user_id).trim() !== String(auth.userId).trim()) {
    return fail('このリクエストに応答する権限がありません');
  }
  if (effectiveStatus(row.status, row.created_at) !== 'pending') {
    return fail('このリクエストは既に処理済みか期限切れです');
  }

  const newStatus = decision === 'approve' ? 'approved' : 'denied';
  const { error: updErr } = await getSupabase()
    .from('approval_requests')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('org_id', auth.orgId as string)
    .eq('request_id', requestId);
  if (updErr) throw updErr;

  if (newStatus === 'approved') {
    await recordLog(auth.orgId!, row.user_id, row.user_name, 'login(mobile)');
  }
  return ok(newStatus === 'approved' ? '承認しました' : '拒否しました', { status: newStatus });
}

// ---------- ログ ----------

async function handleGetLogs(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
  let query = getSupabase()
    .from('logs')
    .select('created_at, user_id, user_name, action')
    .eq('org_id', auth.orgId as string)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (auth.userId !== 'MASTER') query = query.eq('user_id', auth.userId as string);

  const { data: rows, error } = await query;
  if (error) throw error;

  const logs = (rows ?? []).map((r) => ({
    timestamp: toIso(r.created_at),
    userId: r.user_id,
    userName: r.user_name,
    action: r.action,
  }));
  return ok('OK', { logs });
}

// ---------- ユーザー管理（組織マスター権限） ----------

async function handleRegister(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok || auth.userId !== 'MASTER') return fail('管理者(マスター)権限が必要です');

  const newUserId = (data.newUserId ?? '').trim();
  const newUserName = (data.newUserName ?? '').trim();
  const newPasswordHash = (data.newPasswordHash ?? '').trim();
  if (!newUserId || !newPasswordHash) return fail('ユーザーIDとパスワードが必要です');
  if (newUserId === 'MASTER') return fail('MASTER は予約済みIDです');

  const { error } = await getSupabase()
    .from('users')
    .upsert(
      { org_id: auth.orgId, user_id: newUserId, user_name: newUserName, hashed_password: newPasswordHash },
      { onConflict: 'org_id,user_id' },
    );
  if (error) throw error;
  return ok('ユーザーを登録しました', { userId: newUserId });
}

async function handleListUsers(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok || auth.userId !== 'MASTER') return fail('管理者(マスター)権限が必要です');

  const { data: rows, error } = await getSupabase()
    .from('users')
    .select('user_id, user_name, created_at')
    .eq('org_id', auth.orgId as string)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const users = (rows ?? []).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    createdAt: toIso(r.created_at),
  }));
  return ok('OK', { users });
}

async function handleDeleteUser(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok || auth.userId !== 'MASTER') return fail('管理者(マスター)権限が必要です');

  const target = (data.targetUserId ?? '').trim();
  if (!target) return fail('対象ユーザーIDが必要です');
  if (target === 'MASTER') return fail('MASTER は削除できません');

  const { error } = await getSupabase()
    .from('users')
    .delete()
    .eq('org_id', auth.orgId as string)
    .eq('user_id', target);
  if (error) throw error;
  return ok('ユーザーを削除しました', { userId: target });
}

/** 登録フォームの合言葉を設定/解除（マスター権限） */
async function handleSetRegistrationCode(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.orgId, data.userId, data.passwordHash);
  if (!auth.ok || auth.userId !== 'MASTER') return fail('管理者(マスター)権限が必要です');

  const code = (data.registrationCode ?? '').trim();
  const { error } = await getSupabase()
    .from('organizations')
    .update({ registration_code: code || null })
    .eq('org_id', auth.orgId as string);
  if (error) throw error;
  return ok(code ? '登録コードを設定しました' : '登録フォームを無効にしました', { registrationCode: code });
}

// ---------- 組織ごとの登録フォーム（自己登録・認証不要） ----------

async function handleSelfRegister(data: RequestData): Promise<ApiResult> {
  const orgId = (data.orgId ?? '').trim();
  if (!orgId) return fail('組織IDが必要です');

  const org = await getOrg(orgId);
  if (!org) return fail('組織が見つかりません');

  const code = (org.registration_code ?? '').trim();
  if (!code) return fail('この組織はフォーム登録が無効です。管理者にご連絡ください。');
  if ((data.registrationCode ?? '').trim() !== code) return fail('登録コードが正しくありません。');

  const userId = (data.userId ?? '').trim();
  const userName = (data.userName ?? '').trim();
  const passwordHash = (data.passwordHash ?? '').trim();
  if (!userId || !passwordHash) return fail('ユーザーIDとパスワードは必須です。');
  if (userId === 'MASTER') return fail('このユーザーIDは使用できません。');

  // 既存IDは上書きさせない（他人のパスワードを変えられないように）
  const { data: existing, error: exErr } = await getSupabase()
    .from('users')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) return fail('そのユーザーIDは既に登録されています。管理者にご連絡ください。');

  const { error } = await getSupabase()
    .from('users')
    .insert({ org_id: orgId, user_id: userId, user_name: userName, hashed_password: passwordHash });
  if (error) throw error;
  return ok('登録が完了しました。', { userId });
}

// ---------- ヘルス（導入状態・認証不要） ----------

async function handleHealth(): Promise<ApiResult> {
  const envConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const signupCodeRequired = Boolean(process.env.SIGNUP_CODE);
  let tablesReady = false;
  let dbError: string | undefined;

  if (envConfigured) {
    try {
      const { error } = await getSupabase()
        .from('organizations')
        .select('org_id', { head: true, count: 'exact' });
      if (error) dbError = error.message;
      else tablesReady = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }
  return { success: true, message: 'OK', envConfigured, tablesReady, signupCodeRequired, dbError };
}

// ---------- helpers ----------

async function recordLog(orgId: string, userId: string, userName: string, action: string): Promise<void> {
  await getSupabase().from('logs').insert({ org_id: orgId, user_id: userId, user_name: userName ?? '', action });
}

function ok(message: string, extra?: Record<string, unknown>): ApiResult {
  return { success: true, message, ...(extra ?? {}) };
}
function fail(message: string, extra?: Record<string, unknown>): ApiResult {
  return { success: false, message, ...(extra ?? {}) };
}

function effectiveStatus(status: string, createdAt: string): ApprovalStatus {
  if (status === 'pending' && isExpired(createdAt)) return 'expired';
  return status as ApprovalStatus;
}
function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > APPROVAL_TTL_SEC * 1000;
}
function toIso(d: string): string {
  const date = new Date(d);
  return isNaN(date.getTime()) ? String(d) : date.toISOString();
}
