// =====================================================
// キオスク制御ネイティブモジュール（React Native for Windows / C#）への橋渡し
//
//   実体は windows-native/KioskModule.cs（Microsoft.ReactNative）です。
//   ネイティブモジュール未登録の環境（開発時 / 他プラットフォーム）でも
//   JS 側がクラッシュしないよう no-op フォールバックを用意しています。
// =====================================================

import { NativeModules, Platform } from 'react-native';

export interface KioskNative {
  /** キオスク開始：タスクマネージャー無効化 + スタートアップ登録 + キーボードフック導入 */
  enableKioskMode(): Promise<boolean>;
  /** キオスク解除：タスクマネージャー再有効化 + フック解除 */
  disableKioskMode(): Promise<boolean>;
  /** ウィンドウを最小化してバックグラウンドへ */
  minimizeToBackground(): Promise<boolean>;
  /** Windows スタートアップへ登録 */
  registerStartup(): Promise<boolean>;
  /** 端末名（コンピューター名）を取得 */
  getDeviceName(): Promise<string>;
}

const noop: KioskNative = {
  enableKioskMode: async () => false,
  disableKioskMode: async () => false,
  minimizeToBackground: async () => false,
  registerStartup: async () => false,
  getDeviceName: async () => 'PC',
};

const native = (NativeModules as { KioskModule?: KioskNative }).KioskModule;

if (!native && Platform.OS === 'windows') {
  // 開発中はまだネイティブ側が組み込まれていない場合があるため警告のみ
  // eslint-disable-next-line no-console
  console.warn(
    '[KioskModule] ネイティブモジュールが見つかりません。' +
      'windows-native/KioskModule.cs をプロジェクトに追加してください。',
  );
}

const KioskModule: KioskNative = native ?? noop;

export default KioskModule;
