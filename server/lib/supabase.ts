// =====================================================
// Supabase サーバークライアント（service_role キー）
//   RLS をバイパスして読み書きします。キーはサーバー専用。
// =====================================================

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // デプロイ時に気づけるよう警告（リクエスト時に 500 になる）
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
}

export const supabase = createClient(url ?? '', serviceKey ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
