# PC Login Control — React Native 版

Electron 版を **React Native** で再構築したモノレポです。

- **`pc-windows`** … React Native for Windows 製のキオスク・ログインクライアント（Electron 版の移植）
- **`mobile`** … React Native (iOS / Android) 製のモバイル承認アプリ（スマホから PC ログインを承認 / ログ閲覧）
- **`packages/core`** … 両アプリ共通の TypeScript（API クライアント / SHA-256 / 型）
- バックエンドは従来どおり **Google Apps Script**（`../gas/Code.gs`）

```
┌──────────────────────────┐   ①requestApproval    ┌──────────────────────┐
│  pc-windows (Windows PC) │ ───────────────────▶  │  Google Apps Script  │
│  ・キオスクログイン画面  │ ◀── ④checkApproval ──  │  (Web API)           │
│  ・ショートカット遮断    │                        └─────────┬────────────┘
└──────────────────────────┘                                 │ 読み書き
                                                   ┌─────────▼────────────┐
┌──────────────────────────┐   ②listRequests       │  Google Spreadsheet  │
│  mobile (iOS / Android)  │ ───────────────────▶  │  ・ユーザーマスター  │
│  ・承認 / 拒否           │ ◀── ③respondRequest ─  │  ・利用ログ          │
│  ・利用ログ閲覧          │                        │  ・認証リクエスト    │
└──────────────────────────┘                        └──────────────────────┘
```

---

## 0. 前提

| 対象 | 必要なもの |
|------|-----------|
| 共通 | Node.js 18+ / npm 9+（workspaces 対応） |
| pc-windows | Windows 10/11・Visual Studio 2022（C++/UWP・.NET デスクトップ）・[RNW 開発環境](https://microsoft.github.io/react-native-windows/docs/rnw-dependencies) |
| mobile | Android Studio（Android）・Xcode + CocoaPods（iOS / macOS） |

> Linux 環境では JS/TS の編集・型チェックまで可能ですが、
> ネイティブビルド（Windows / iOS）は各 OS 上で行ってください。

---

## 1. 依存関係のインストール

```bash
cd react-native
npm install          # workspaces 一括インストール
```

## 2. バックエンド URL の設定

`packages/core/src/config.ts` の `GAS_URL` を、デプロイした GAS の URL に変更します。

```ts
export const GAS_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

（GAS 側のセットアップは [`../README.md`](../README.md) の STEP 1〜3 を参照。
`Code.gs` は本 README の承認フロー用エンドポイントを追加済みです。）

型チェックだけ先に確認する場合:

```bash
npm run typecheck
```

---

## 3. pc-windows（Windows キオスク）

このフォルダは JS/TS ソースのみを含みます。ネイティブ（`windows/`）は
以下で生成します。

```bash
cd react-native/pc-windows

# windows/ ネイティブプロジェクトを生成（C#）
npx react-native-windows-init --overwrite --language cs

# ネイティブモジュール KioskModule.cs を組み込む
#   windows-native/KioskModule.cs → windows/PCLoginControl/ へコピー
#   詳細は windows-native/README.md を参照
```

起動:

```bash
npm run windows            # デバッグ実行
npm run windows:release    # リリース（x64）
```

キオスク挙動・管理者権限マニフェスト・キーボードフックの組み込みは
[`windows-native/README.md`](pc-windows/windows-native/README.md) を参照してください。

---

## 4. mobile（iOS / Android 承認アプリ）

このフォルダも JS/TS ソースのみです。ネイティブ（`android/` `ios/`）は
同一 RN バージョンで生成して取り込みます。

```bash
cd react-native/mobile

# 同じRNバージョンで雛形を生成し、android/ ios/ を取り込む
npx @react-native-community/cli@0.76.5 init PCLoginMobile \
    --version 0.76.5 --skip-install --directory .tmp-native
cp -R .tmp-native/android ./android
cp -R .tmp-native/ios ./ios
rm -rf .tmp-native
# ※ app.json の name（PCLoginMobile）と生成物の名前を合わせてください

# iOS の場合は Pods
cd ios && pod install && cd ..
```

起動:

```bash
npm start                  # Metro
npm run android            # Android 実行
npm run ios                # iOS 実行（macOS）
```

---

## 5. 使い方（モバイル承認フロー）

1. **モバイル**アプリでユーザー（またはマスター）としてログイン
2. **PC**（pc-windows）でユーザーIDを入力し「📱 スマホで承認する」をタップ
3. **モバイル**の「承認」タブに PC のログイン要求が表示される → **承認**
4. **PC** が承認を検知してログイン（バックグラウンドへ）
5. ログイン/ログアウトは GAS の「利用ログ」に記録され、**モバイル**の「利用ログ」タブで確認できる

従来どおり、PC 側で **ID + パスワード直接ログイン** も利用できます。

---

## ディレクトリ構成

```
react-native/
├── package.json                # workspaces ルート
├── packages/core/              # 共通TS（API / crypto / types）
│   └── src/{api,crypto,types,config,index}.ts
├── pc-windows/                 # RN for Windows（キオスク）
│   ├── src/{App,theme}.tsx
│   ├── src/screens/LoginScreen.tsx
│   ├── src/lib/approval.ts
│   ├── src/native/KioskModule.ts
│   └── windows-native/KioskModule.cs   # C# ネイティブモジュール
└── mobile/                     # RN モバイル（承認アプリ）
    ├── src/{App,theme}.tsx
    ├── src/context/AuthContext.tsx
    └── src/screens/{Login,Main,Approvals,Logs}Screen.tsx
```
