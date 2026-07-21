// =====================================================
// 認証ユーティリティ（マルチテナント）
//   ・組織(organizations)ごとのマスターパスワード
//   ・users テーブル照合（org_id + user_id でスコープ）
// =====================================================

import { supabase } from './supabase';

export interface OrgRow {
  org_id: string;
  name: string;
  master_pass_hash: string;
}

export interface AuthResult {
  ok: boolean;
  orgId?: string;
  orgName?: string;
  userId?: string;
  userName?: string;
  message?: string;
}

/** 組織を取得（存在しなければ null） */
export async function getOrg(orgId: string | undefined): Promise<OrgRow | null> {
  const id = (orgId ?? '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('organizations')
    .select('org_id, name, master_pass_hash')
    .eq('org_id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as OrgRow) ?? null;
}

/** 組織スコープで ID + パスワードハッシュを検証。組織マスターにも対応。 */
export async function authenticateUser(
  orgId: string | undefined,
  userId: string | undefined,
  passwordHash: string | undefined,
): Promise<AuthResult> {
  if (!(orgId ?? '').trim()) return { ok: false, message: '組織IDが必要です' };
  if (!passwordHash) return { ok: false, message: 'パスワードが指定されていません' };

  const org = await getOrg(orgId);
  if (!org) return { ok: false, message: '組織が見つかりません' };

  // 組織マスターパスワード
  if (passwordHash === org.master_pass_hash) {
    return { ok: true, orgId: org.org_id, orgName: org.name, userId: 'MASTER', userName: 'マスター' };
  }

  const { data, error } = await supabase
    .from('users')
    .select('user_id, user_name, hashed_password')
    .eq('org_id', org.org_id)
    .eq('user_id', (userId ?? '').trim())
    .maybeSingle();
  if (error) throw error;

  if (data && String(data.hashed_password).trim() === String(passwordHash).trim()) {
    return { ok: true, orgId: org.org_id, orgName: org.name, userId: data.user_id, userName: data.user_name };
  }
  return { ok: false, message: 'IDまたはパスワードが正しくありません' };
}

/** 組織内の userId から表示名を取得（存在しなければ null） */
export async function lookupUserName(orgId: string, userId: string): Promise<string | null> {
  if (userId === 'MASTER') return 'マスター';
  const { data, error } = await supabase
    .from('users')
    .select('user_name')
    .eq('org_id', orgId)
    .eq('user_id', userId.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? (data.user_name as string) : null;
}
