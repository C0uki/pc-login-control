// =====================================================
// 認証ユーティリティ
//   ・マスターパスワード（環境変数 MASTER_PASS_HASH）
//   ・users テーブル照合（SHA-256 ハッシュ比較）
// =====================================================

import { supabase } from './supabase';

const MASTER_PASS_HASH = process.env.MASTER_PASS_HASH ?? '';

export interface AuthResult {
  ok: boolean;
  userId?: string;
  userName?: string;
  message?: string;
}

/** ID + パスワードハッシュを検証。マスターにも対応。 */
export async function authenticateUser(
  userId: string | undefined,
  passwordHash: string | undefined,
): Promise<AuthResult> {
  if (!passwordHash) return { ok: false, message: 'パスワードが指定されていません' };

  if (MASTER_PASS_HASH && passwordHash === MASTER_PASS_HASH) {
    return { ok: true, userId: 'MASTER', userName: 'マスター' };
  }

  const { data, error } = await supabase
    .from('users')
    .select('user_id, user_name, hashed_password')
    .eq('user_id', (userId ?? '').trim())
    .maybeSingle();

  if (error) throw error;
  if (data && String(data.hashed_password).trim() === String(passwordHash).trim()) {
    return { ok: true, userId: data.user_id, userName: data.user_name };
  }
  return { ok: false, message: 'IDまたはパスワードが正しくありません' };
}

/** userId から表示名を取得（存在しなければ null） */
export async function lookupUserName(userId: string): Promise<string | null> {
  if (userId === 'MASTER') return 'マスター';
  const { data, error } = await supabase
    .from('users')
    .select('user_name')
    .eq('user_id', userId.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? (data.user_name as string) : null;
}
