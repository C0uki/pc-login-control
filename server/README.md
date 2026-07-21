# PC Login Control — バックエンド（Supabase + Vercel）

Google Apps Script + スプレッドシートから、**Supabase（PostgreSQL）+ Vercel（サーバーレスAPI）** へ移行したバックエンドです。

```
RN アプリ ──POST /api──▶ Vercel サーバーレス関数 ──service_role──▶ Supabase (Postgres)
```

- API は GAS の `doPost` と**同じアクションベースの契約**（`login` / `logout` / `requestApproval` / `checkApproval` / `listRequests` / `respondRequest` / `getLogs` / `register` / `health` / `listUsers` / `deleteUser`）
- そのため RN 側は `API_URL` を差し替えるだけで動作します
- デプロイURLの**ルート（`/`）には Web 管理コンソール**が付属します

---

## 🚀 かんたん導入（GUI 中心）

コード編集なしで導入できます。

### 1. Supabase を用意
[Supabase](https://supabase.com/) でプロジェクトを作成し、**Project URL** と **service_role キー**
（Project Settings → API）を控えます。DBテーブルは後述の管理コンソールから作成できます。

### 2. Vercel にデプロイ（ボタン1つ）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FC0uki%2Fpc-login-control&root-directory=server&env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,MASTER_PASS_HASH&project-name=pc-login-control&repository-name=pc-login-control)

ボタンを押すとリポジトリが複製され、Vercel の画面で環境変数
（`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `MASTER_PASS_HASH`）の入力を求められます。
`MASTER_PASS_HASH` は次の管理コンソール②で生成できます（先に手元で生成 → 入力）。

> Root Directory は `server` を指定してください（ボタン経由なら自動設定されます）。

### 3. 管理コンソールで初期設定・運用（ブラウザだけ）

デプロイ完了後、`https://<あなたのapp>.vercel.app/` を開くと **管理コンソール** が表示されます。

1. **① 導入状態** … API接続 / 環境変数 / マスターPW / DBテーブルの状態を信号表示
2. **② マスターPWハッシュ生成** … 平文を入れると SHA-256 を生成 → Vercel の `MASTER_PASS_HASH` に設定
3. **③ データベース初期化** … 表示されるSQLをコピーし、Supabaseの「SQL Editor」で実行（初回のみ）
4. **④ 管理者ログイン** … マスターPWでログインし、**ユーザー登録/削除・利用ログ・承認**を画面操作

このコンソールは静的ファイル（ビルド不要）で、`crypto.subtle` に依存しないため
**どの環境・ブラウザでも**動作します。ローカルの `index.html` から開く場合は、
右上 ⚙️ でデプロイ後の `…/api` を指定してください。

以降は「手動で細かく設定したい人向け」の詳細手順です。

---

## STEP 1: Supabase プロジェクト作成 & スキーマ適用

1. [Supabase](https://supabase.com/) で新規プロジェクトを作成
2. 「SQL Editor」を開き、[`../supabase/schema.sql`](../supabase/schema.sql) を貼り付けて実行
   - `users` / `logs` / `approval_requests` テーブルと RLS が作成されます
3. 「Project Settings → API」から以下を控える
   - **Project URL**（`SUPABASE_URL`）
   - **service_role** キー（`SUPABASE_SERVICE_ROLE_KEY`）※秘密鍵。公開厳禁

> RLS を有効化しつつポリシーを作らないため、匿名キー（anon）からテーブルへ
> 直接アクセスはできません。API は service_role キーでのみ読み書きします。

---

## STEP 2: 環境変数

`.env.example` を複製して値を設定します（ローカルは `vercel dev` が読み込みます）。

```bash
cd server
cp .env.example .env
```

| 変数 | 内容 |
|------|------|
| `SUPABASE_URL` | Supabase の Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（サーバー専用の秘密鍵） |
| `MASTER_PASS_HASH` | マスターパスワードの SHA-256（`printf '%s' 'PW' \| sha256sum`） |

---

## STEP 3: Vercel へデプロイ

```bash
cd server
npm install
npx vercel            # 初回：プロジェクトをリンク
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add MASTER_PASS_HASH
npx vercel deploy --prod
```

デプロイ後の URL に `/api` を付けたもの（例: `https://your-app.vercel.app/api`）が
API エンドポイントです。ブラウザで開くと `... is running` が返れば OK。

ローカル動作確認:

```bash
npm run dev           # vercel dev（http://localhost:3000/api）
curl -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -d '{"action":"login","userId":"","passwordHash":"<マスターPWのSHA256>"}'
```

---

## STEP 4: クライアント（RN）を新 API に向ける

`react-native/packages/core/src/config.ts` の `API_URL` を Vercel の URL に変更します。

```ts
export const API_URL = 'https://your-app.vercel.app/api';
```

RN 側のコードはこれ以外の変更不要です（関数の入出力は GAS 版と同一）。

---

## ユーザー登録（Google フォームの置き換え）

GAS 版の Google フォーム連携は廃止し、**マスター権限の `register` API** に置き換えました。

- API 経由（`@pclc/core` の `register()`、またはcurl）:

  ```bash
  curl -X POST https://your-app.vercel.app/api -H 'Content-Type: application/json' -d '{
    "action":"register",
    "userId":"MASTER",
    "passwordHash":"<マスターPWのSHA256>",
    "newUserId":"taro",
    "newUserName":"山田太郎",
    "newPasswordHash":"<新ユーザーPWのSHA256>"
  }'
  ```

- または Supabase ダッシュボードの Table Editor で `users` に直接追加
  （`hashed_password` は平文PWの SHA-256 小文字HEX）

---

## 既存データの移行（スプレッドシート → Supabase）

1. スプレッドシートの「ユーザーマスター」を CSV エクスポート
   （列: `user_id`, `user_name`, `hashed_password`）
2. Supabase「Table Editor → users → Import data from CSV」で取り込み
3. 「利用ログ」も残したい場合は `logs`（`user_id`, `user_name`, `action`, `created_at`）へ同様に取り込み

ハッシュ方式（SHA-256）は GAS 版と同一のため、**既存ユーザーのパスワードはそのまま利用可能**です。

---

## セキュリティ補足

- `service_role` キーと `MASTER_PASS_HASH` は Vercel 環境変数のみに保持し、クライアントには一切埋め込みません。
- パスワードは従来同様クライアントで SHA-256 化して送信します（既存資産との互換のため）。
  より堅牢にする場合は「平文をHTTPS送信 → サーバーで argon2/bcrypt」への変更、または Supabase Auth の採用を検討してください（クライアント改修が必要）。
