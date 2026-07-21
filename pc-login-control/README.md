# PC Login Control System — セットアップ手順

> **React Native 版に再構築しました。** PC クライアントは React Native for Windows、
> 加えてスマホから PC ログインを承認できるモバイルアプリを追加しています。
> セットアップは [`react-native/README.md`](react-native/README.md) を参照してください。
> 旧 Electron 版は [`electron/`](electron/) に参照用として残しています。

## 構成概要

```
┌──────────────────────────┐   requestApproval /     ┌──────────────────────┐
│  pc-windows (Windows PC) │   checkApproval /login   │  Google Apps Script  │
│  React Native for Windows│ ───────────────────────▶ │  (Web API)           │
│  ・キオスクログイン      │ ◀── JSON { success,... } ─│                      │
│  ・ショートカット遮断    │                          └──────────┬───────────┘
└──────────────────────────┘                                     │ 読み書き
                                                      ┌──────────▼───────────┐
┌──────────────────────────┐   listRequests /         │  Google Spreadsheet  │
│  mobile (iOS / Android)  │   respondRequest /getLogs │  ・ユーザーマスター  │
│  React Native            │ ───────────────────────▶ │  ・利用ログ          │
│  ・PCログインを承認      │ ◀───────────────────────  │  ・認証リクエスト    │
│  ・利用ログ閲覧          │                          └──────────────────────┘
└──────────────────────────┘
```

---

## STEP 1: Google スプレッドシートの準備

1. Google スプレッドシートを新規作成
2. URLから **スプレッドシートID** をコピー
   - 例: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
3. `gas/Code.gs` の `SPREADSHEET_ID` に貼り付け

---

## STEP 2: Google Apps Script の設定

1. スプレッドシートの「拡張機能」→「Apps Script」を開く
2. `gas/Code.gs` の内容を貼り付けて保存
3. **初期セットアップ実行**
   - 関数 `setupSpreadsheet` を選択して実行（シートを自動作成）
4. **マスターパスワードの設定**
   - 任意のマスターパスワードの SHA-256 ハッシュを取得
   - PowerShell: `(Get-FileHash -Algorithm SHA256 -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes("あなたのPW")))).Hash.ToLower()`
   - 取得したハッシュを `MASTER_PASS_HASH` に設定
5. **Webアプリとしてデプロイ**
   - 「デプロイ」→「新しいデプロイ」→「Webアプリ」
   - 実行ユーザー: **自分**
   - アクセスできるユーザー: **全員**（認証はアプリ側で行います）
   - デプロイして **URL** をコピー

---

## STEP 3: Google フォームの設定（ユーザー登録用）

1. Google フォームを新規作成（3つの質問を追加）
   - 「ユーザーID」（記述式・短答）
   - 「ユーザー名」（記述式・短答）
   - 「パスワード」（記述式・短答）
2. フォームの回答先スプレッドシートを **STEP 1 のスプレッドシート** に設定
3. Apps Script で `onFormSubmit` トリガーを設定
   - 「トリガー」→「＋トリガーを追加」
   - 関数: `onFormSubmit`
   - イベントのソース: **スプレッドシートから**
   - イベントの種類: **フォーム送信時**

---

## STEP 4: React Native アプリの設定

PC クライアント（Windows）とモバイルアプリ（iOS / Android）のセットアップ手順は
[`react-native/README.md`](react-native/README.md) にまとめています。要点のみ:

1. 依存インストール

   ```bash
   cd react-native
   npm install
   ```

2. `react-native/packages/core/src/config.ts` の `GAS_URL` に STEP 2 の URL を貼り付け

   ```ts
   export const GAS_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
   ```

3. PC（Windows）クライアント

   ```bash
   cd pc-windows
   npx react-native-windows-init --overwrite --language cs   # 初回のみ
   npm run windows
   ```

4. モバイルアプリ

   ```bash
   cd mobile
   npm run android   # または npm run ios（macOS）
   ```

---

## STEP 5: 運用フロー

- **直接ログイン**: PC で ID + パスワードを入力してログイン（従来どおり）
- **スマホ承認**: PC で ID を入力 →「スマホで承認する」→ モバイルアプリで承認 → PC ログイン
- ログイン / ログアウトは「利用ログ」に記録され、モバイルアプリで閲覧可能

> PC の全画面キオスク化・スタートアップ登録・タスクマネージャー無効化は
> ネイティブモジュール（`react-native/pc-windows/windows-native/KioskModule.cs`）が担当します。
> 詳細と制限事項は同フォルダの README を参照してください。

---

## 注意事項

| 項目 | 内容 |
|------|------|
| 管理者権限 | タスクマネージャー無効化にはアプリの管理者実行が必要 |
| Ctrl+Alt+Del | OS レベルのため完全なブロックは不可（仕様上の限界） |
| ログ漏れ | 強制終了・電源断時のログアウト記録は保証されません |
| オフライン | インターネット未接続時はマスターパスワードのみ使用可能 |

---

## ファイル構成

```
pc-login-control/
├── README.md
├── gas/
│   └── Code.gs               ← Google Apps Script（バックエンド / 承認フロー対応）
├── react-native/             ← ★ React Native 版（現行）
│   ├── README.md             ← セットアップ手順
│   ├── packages/core/        ← 共通TS（API / crypto / types）
│   ├── pc-windows/           ← RN for Windows（キオスクログイン）
│   │   └── windows-native/   ← C# ネイティブモジュール（キオスク制御）
│   └── mobile/               ← RN モバイル（承認 / ログ閲覧）
└── electron/                 ← 旧 Electron 版（参照用）
    ├── main.js
    ├── preload.js
    └── renderer/{index.html,login.js}
```
