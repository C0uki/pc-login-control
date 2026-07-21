// =====================================================
// Vercel サーバーレス関数（エンドポイント: POST /api）
//   GAS の doPost と同じアクションベースの契約。
//   クライアント（@pclc/core）は API_URL をこの URL に向けるだけで動作します。
// =====================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle } from '../lib/handlers';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS（RN ネイティブfetchには不要だが、ブラウザ/テストからの利用に備える）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    res.status(200).json({ success: true, message: 'PC Login Control API (Vercel + Supabase) is running' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const result = await handle(body);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(200).json({ success: false, message: 'サーバーエラー: ' + message });
  }
}
