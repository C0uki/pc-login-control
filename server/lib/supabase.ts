// =====================================================
// Supabase サーバークライアント（service_role キー）
//   RLS をバイパスして読み書きします。キーはサーバー専用。
//   ※ 未設定でも import 時にクラッシュしないよう遅延初期化にしています
//     （環境変数が空だと createClient が throw し、関数全体が
//      FUNCTION_INVOCATION_FAILED になるのを防ぐ）。
// =====================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;
if (url && serviceKey) {
  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
}

/**
 * Supabase クライアントを取得。未設定なら分かりやすいエラーを投げます
 * （呼び出し側の try/catch で JSON エラーとして返るため、関数はクラッシュしません）。
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      'Supabase が未設定です。Vercel の環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定して再デプロイしてください。',
    );
  }
  return client;
}
