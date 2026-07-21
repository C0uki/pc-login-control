# ② PC / スマホアプリのビルド手順

バックエンド（[①](01-backend-setup.md)）が動いたら、クライアントアプリをビルドします。
**ネイティブビルドは各OSの実機/環境が必要**で、ここが一番の作業になります。

- **PC キオスク**（React Native for Windows）→ Windows が必要
- **スマホ承認アプリ**（React Native）→ Android は Windows/Mac/Linux、iOS は Mac が必要

---

## 0. 共通: 接続先の設定

`react-native/packages/core/src/config.ts` を編集します。

```ts
export const API_URL = 'https://<あなたのapp>.vercel.app/api'; // Vercel の API（末尾 /api）
export const ORG_ID  = '（管理コンソールで作成した組織ID）';
```

その後、依存をインストール:

```bash
cd react-native
npm install
```

---

## 1. PC キオスクアプリ（Windows）

### 前提
- Windows 10 / 11
- Visual Studio 2022（「C++ によるデスクトップ開発」「.NET デスクトップ開発」「ユニバーサル Windows プラットフォーム開発」）
- [RNW の開発環境](https://microsoft.github.io/react-native-windows/docs/rnw-dependencies)（`npx react-native-windows-init` が要求）

### 手順
```bash
cd react-native/pc-windows

# 初回のみ: windows/ ネイティブプロジェクトを生成（C#）
npx react-native-windows-init --overwrite --language cs
```

生成後、キオスク制御のネイティブモジュールを組み込みます:

1. `pc-windows/windows-native/KioskModule.cs` を
   `windows/PCLoginControl/` へコピー
2. `windows/PCLoginControl/ReactPackageProvider.cs` に `packageBuilder.AddAttributedModules();` があることを確認
3. `app.manifest` に管理者権限を設定
   ```xml
   <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
   ```
   （詳細は `pc-windows/windows-native/README.md`）

### 実行 / ビルド
```bash
npm run windows            # デバッグ実行
npm run windows:release    # リリース（x64）
```

### 注意
- タスクマネージャー無効化・スタートアップ登録には**管理者実行**が必要
- **Ctrl+Alt+Del は OS 仕様上ブロック不可**（仕様上の限界）
- 強制終了・電源断時のログアウト記録は保証されません

---

## 2. スマホ承認アプリ（Android）

### 前提
- Android Studio（SDK / エミュレータ or 実機）

### 手順
```bash
cd react-native/mobile

# 初回のみ: android/ ios/ を同じRNバージョンで生成して取り込む
npx @react-native-community/cli@0.76.5 init PCLoginMobile \
    --version 0.76.5 --skip-install --directory .tmp-native
cp -R .tmp-native/android ./android
rm -rf .tmp-native

npm start                  # Metro（別ターミナル）
npm run android            # 実行（エミュレータ or USB接続の実機）
```

### リリース APK（配布用）
```bash
cd android && ./gradlew assembleRelease
# 生成物: android/app/build/outputs/apk/release/app-release.apk
```

---

## 3. スマホ承認アプリ（iOS・Mac のみ）

```bash
cd react-native/mobile
# android/ios を生成（上記と同様に init → ios をコピー）
cd ios && pod install && cd ..
npm run ios                # シミュレータ実行
```

実機配布は Xcode で署名（Apple Developer アカウント）が必要です。

---

## 4. 配布とオンボーディング

- 各組織には **その組織の `ORG_ID` を設定したビルド**を配布します
  （`ORG_ID` を変えて再ビルド、または将来的に初回起動で組織コード入力にする拡張も可能）
- ユーザーには**ユーザーID + 初期パスワード**（管理コンソールで登録したもの）を伝える
- スマホ承認を使う場合は、承認する本人のスマホにアプリを入れてログインしておく

前 → [① バックエンド接続手順](01-backend-setup.md) / 次 → [③ 導入チェックリスト](03-checklist.md)
