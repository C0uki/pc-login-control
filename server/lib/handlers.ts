// =====================================================
// アクションハンドラー（GAS の doPost 相当）
//   既存クライアントとの互換のため、レスポンス形状は GAS 版と同一。
// =====================================================

import { supabase } from './supabase';
import { authenticateUser, lookupUserName } from './auth';
import type { ApiResult, RequestData, ApprovalStatus } from './types';

const APPROVAL_TTL_SEC = 120;

export async function handle(data: RequestData): Promise<ApiResult> {
  switch (data.action) {
    case 'login':           return handleLogin(data);
    case 'logout':          return handleLogout(data);
    case 'requestApproval': return handleRequestApproval(data);
    case 'checkApproval':   return handleCheckApproval(data);
    case 'listRequests':    return handleListRequests(data);
    case 'respondRequest':  return handleRespondRequest(data);
    case 'getLogs':         return handleGetLogs(data);
    case 'register':        return handleRegister(data);
    default:                return fail('不正なアクションです');
  }
}

// ---------- login / logout ----------

async function handleLogin(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  await recordLog(auth.userId!, auth.userName ?? '', 'login');
  return ok(auth.userId === 'MASTER' ? 'マスターパスワードで認証しました' : 'ログイン成功', {
    userId: auth.userId,
    userName: auth.userName,
  });
}

async function handleLogout(data: RequestData): Promise<ApiResult> {
  if (!data.userId) return fail('ユーザー情報がありません');
  await recordLog(data.userId, data.userName ?? '', 'logout');
  return ok('ログアウト記録完了');
}

// ---------- モバイル承認フロー ----------

async function handleRequestApproval(data: RequestData): Promise<ApiResult> {
  const userId = (data.userId ?? '').trim();
  const deviceName = (data.deviceName ?? 'PC').trim();
  if (!userId) return fail('ユーザーIDが必要です');

  const userName = await lookupUserName(userId);
  if (userName === null) return fail('登録されていないユーザーIDです');

  const { data: inserted, error } = await supabase
    .from('approval_requests')
    .insert({ user_id: userId, user_name: userName, device_name: deviceName, status: 'pending' })
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
  const requestId = (data.requestId ?? '').trim();
  if (!requestId) return fail('requestId が必要です');

  const { data: row, error } = await supabase
    .from('approval_requests')
    .select('*')
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
  const auth = await authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const cutoff = new Date(Date.now() - APPROVAL_TTL_SEC * 1000).toISOString();
  let query = supabase
    .from('approval_requests')
    .select('*')
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
  const auth = await authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const requestId = (data.requestId ?? '').trim();
  const decision = (data.decision ?? '').trim();
  if (!requestId) return fail('requestId が必要です');
  if (decision !== 'approve' && decision !== 'deny') {
    return fail('decision は approve か deny を指定してください');
  }

  const { data: row, error } = await supabase
    .from('approval_requests')
    .select('*')
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
  const { error: updErr } = await supabase
    .from('approval_requests')
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq('request_id', requestId);
  if (updErr) throw updErr;

  if (newStatus === 'approved') {
    await recordLog(row.user_id, row.user_name, 'login(mobile)');
  }
  return ok(newStatus === 'approved' ? '承認しました' : '拒否しました', { status: newStatus });
}

// ---------- ログ ----------

async function handleGetLogs(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok) return fail(auth.message ?? '認証に失敗しました');

  const limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
  let query = supabase
    .from('logs')
    .select('created_at, user_id, user_name, action')
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

// ---------- ユーザー登録（マスター権限、Google フォームの置き換え） ----------

async function handleRegister(data: RequestData): Promise<ApiResult> {
  const auth = await authenticateUser(data.userId, data.passwordHash);
  if (!auth.ok || auth.userId !== 'MASTER') return fail('管理者(マスター)権限が必要です');

  const newUserId = (data.newUserId ?? '').trim();
  const newUserName = (data.newUserName ?? '').trim();
  const newPasswordHash = (data.newPasswordHash ?? '').trim();
  if (!newUserId || !newPasswordHash) return fail('ユーザーIDとパスワードが必要です');
  if (newUserId === 'MASTER') return fail('MASTER は予約済みIDです');

  const { error } = await supabase
    .from('users')
    .upsert(
      { user_id: newUserId, user_name: newUserName, hashed_password: newPasswordHash },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
  return ok('ユーザーを登録しました', { userId: newUserId });
}

// ---------- helpers ----------

async function recordLog(userId: string, userName: string, action: string): Promise<void> {
  await supabase.from('logs').insert({ user_id: userId, user_name: userName ?? '', action });
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
