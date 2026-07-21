// =====================================================
// パスワードハッシュ
//   React Native には Node の crypto が無いため js-sha256 を使用。
//   既存の Electron 版 / GAS 側と同一（SHA-256 の小文字HEX, UTF-8）。
// =====================================================

import { sha256 } from 'js-sha256';

/** 平文パスワード → SHA-256（小文字HEX） */
export function hashPassword(password: string): string {
  return sha256(password);
}
