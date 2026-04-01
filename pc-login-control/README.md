# PC Login Control System — セットアップ手順

## 構成概要

```
┌─────────────────────┐        HTTPS POST         ┌──────────────────────┐
│  Electron App (PC)  │ ─────────────────────────▶ │  Google Apps Script  │
│  ・全画面キオスク   │                             │  (Web API)           │
│  ・ショートカット   │ ◀─ JSON { success, ... } ─  │                      │
│    ブロック         │                             └──────────┬───────────┘
└─────────────────────┘                                        │ 読み書き
                                                    ┌──────────▼───────────┐
                                                    │  Google Spreadsheet  │
                                                    │  ・ユーザーマスター  │
                                                    │  ・利用ログ          │
                                                    └──────────────────────┘
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

## STEP 4: Electron アプリの設定

1. `electron/main.js` の `GAS_URL` に STEP 2 でコピーした URL を貼り付け

   ```js
   const GAS_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
   ```

2. 依存パッケージのインストール

   ```bash
   cd electron
   npm install
   ```

3. 動作確認（開発起動）

   ```bash
   npm start
   ```

4. **Windows 用インストーラーのビルド**

   ```bash
   npm run build
   ```
   
   `dist/` フォルダに `.exe` インストーラーが生成されます。

---

## STEP 5: PC へのインストール

1. ビルドした `.exe` を対象 PC で **管理者として実行**
2. インストール完了後、自動的にスタートアップ登録されます
3. 次回 PC 起動時から認証画面が表示されます

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
│   └── Code.gs          ← Google Apps Script（バックエンド）
└── electron/
    ├── package.json
    ├── main.js           ← メインプロセス（ウィンドウ制御）
    ├── preload.js        ← セキュアな API ブリッジ
    └── renderer/
        ├── index.html    ← ログイン画面
        └── login.js      ← ログイン画面のロジック
```
