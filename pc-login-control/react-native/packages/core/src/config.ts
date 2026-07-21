// =====================================================
// 共通設定
//   GAS_URL は「Webアプリとしてデプロイ」した際のURLに書き換えてください。
//   （gas/Code.gs をデプロイして取得）
// =====================================================

export const GAS_URL =
  'https://script.google.com/macros/s/AKfycbzn-2grPqgOAoEQ29NCwTOewDZ8v5u8mQeeQ4jKJsHQz3TZFJ_g5Pe0cSdgx1PD2FFW/exec';

/** GAS へのリクエストタイムアウト(ms) */
export const REQUEST_TIMEOUT_MS = 10_000;

/** モバイル承認のポーリング間隔(ms) */
export const APPROVAL_POLL_INTERVAL_MS = 2_500;

/** モバイル承認の待機タイムアウト(ms) */
export const APPROVAL_TIMEOUT_MS = 120_000;

/** オンライン判定に使う軽量エンドポイント（204を返す） */
export const ONLINE_CHECK_URL = 'https://www.google.com/generate_204';
