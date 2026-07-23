# PC Login Control — バックエンド（Supabase + Vercel・マルチテナント）

**オーナーが1つの Supabase+Vercel を運用**し、**導入者は「組織(organization)」を作るだけ**で使える
SaaS 型バックエンドです。データは `org_id` でテナント分離します。

```
RN アプリ / 管理コンソール ──POST /api {orgId,…}──▶ Vercel ──service_role──▶ Supabase (org_id で分離)
```

- アクション: `createOrg` / `login` / `logout` / `requestApproval` / `checkApproval` / `listRequests` / `respondRequest` / `getLogs` / `register` / `listUsers` / `deleteUser` / `setRegistrationCode` / `selfRegister` / `health`
- デプロイURLの**ルート（`/`）に Web 管理コンソール**（組織作成・ログイン・管理）
- **API・管理コンソールとも TypeScript**（コンソールは `console/*.ts` → `console/*.js` に `tsc` でビルド）
- マスターパスワードは**組織ごと**に保持（環境変数 `MASTER_PASS_HASH` は廃止）

---

## 導入者（各組織の管理者）— クラウド操作は不要

1. オーナーから共有された **コンソールURL** を開く
2. 「**組織を作成**」→ 組織名＋管理者パスワード → 表示された **組織ID** を控える
3. 「組織にログイン」→ ユーザー登録・利用ログ・承認をブラウザで管理
4. PC/モバイルアプリに `API_URL`（固定）と `ORG_ID`（自組織）を設定して配布

Supabase / Vercel のアカウントや操作は不要です。

---

## オーナー — 初回セットアップ（一度だけ）

### 1. Supabase を用意
[Supabase](https://supabase.com/) でプロジェクトを作成し、**Project URL** と **service_role キー**
（Project Settings → API）を控えます。

### 2. Vercel にデプロイ（ボタン1つ）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FC0uki%2Fpc-login-control&root-directory=server&env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY&project-name=pc-login-control&repository-name=pc-login-control)

Vercel の画面で `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（組織作成を制限するなら任意で `SIGNUP_CODE`）
を入力します。Root Directory は `server`（ボタン経由なら自動設定）。

### 3. DB初期化（コンソールから）

`https://<あなたのapp>.vercel.app/` を開き、「**オーナー向け：初回セットアップ**」を展開 →
スキーマSQLをコピーして Supabase「SQL Editor」で実行。「再確認」で **DBテーブル** が緑になれば完了です。

以降は導入者にコンソールURLを共有するだけ。コンソールは静的ファイル（ビルド不要・
`crypto.subtle` 非依存）で **どの環境・ブラウザでも**動作します。ローカルの `index.html` から開く場合は、
右上 ⚙️ で API の URL を指定してください。

以降は手動で細かく設定したい人向けの詳細手順です。

---

## STEP 1: Supabase プロジェクト作成 & スキーマ適用

1. [Supabase](https://supabase.com/) で新規プロジェクトを作成
2. 「SQL Editor」を開き、[`../supabase/schema.sql`](../supabase/schema.sql) を貼り付けて実行
   - `organizations` / `users` / `logs` / `approval_requests` テーブルと RLS が作成されます
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
| `SIGNUP_CODE` | （任意）設定すると組織作成にこのコードが必要になります |

---

## STEP 3: Vercel へデプロイ

```bash
cd server
npm install
npx vercel            # 初回：プロジェクトをリンク
npx vercel env add SUPABASE_URL
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
# 任意: 組織作成を制限する場合のみ
npx vercel env add SIGNUP_CODE
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

## STEP 4: クライアント（RN）の設定

`react-native/packages/core/src/config.ts` を設定します。

```ts
export const API_URL = 'https://<owner-app>.vercel.app/api'; // オーナー共通の固定URL
export const ORG_ID  = 'あなたの組織ID';                      // 導入者ごと（setOrgId() で実行時上書きも可）
```

各リクエストには `ORG_ID` が自動付与され、組織スコープで処理されます。
関数の入出力は従来どおりで、画面コードの変更は不要です。

---

## ユーザー登録

登録方法は2つあります。

1. **管理者が登録**（コンソール「ユーザー」タブ）… ID・名前・初期パスワードを入力（`register`）
2. **利用者が自分で登録**（組織ごとの登録フォーム）
   - コンソール「ユーザー」タブの「登録フォーム」で**登録コード（合言葉）**を設定
   - 表示される **`/register.html?org=<組織ID>`** と登録コードを利用者に共有
   - 利用者はコード＋自分の情報を入力して登録（`selfRegister`）。コード未設定ならフォームは無効

API を直接使う場合（管理者登録）は、組織ID・組織マスターの資格情報を添えて `register` を呼びます。

```bash
curl -X POST https://<owner-app>.vercel.app/api -H 'Content-Type: application/json' -d '{
  "action":"register",
  "orgId":"<組織ID>",
  "userId":"MASTER",
  "passwordHash":"<組織マスターPWのSHA256>",
  "newUserId":"taro",
  "newUserName":"山田太郎",
  "newPasswordHash":"<新ユーザーPWのSHA256>"
}'
```

---

## 管理コンソールの開発（TypeScript）

管理コンソールも TypeScript です。ソースは `console/*.ts`、ブラウザ配信用の
`console/*.js` は次のコマンドで生成します（**`.js` は直接編集しない**）。

```bash
cd server
npm install
npm run build:console     # console/app.ts, console/sha256.ts → console/*.js
npm run typecheck         # API(api/lib) + コンソール(console) を型チェック
```

`tsc` はグローバルスクリプトとして出力するためバンドラー不要で、生成物は
そのまま Vercel が静的配信します（デプロイ構成は従来どおり）。
`console/sha256.ts` は `crypto.subtle` 非依存で、`node:crypto` と同一出力を検証済みです。

---

## セキュリティ補足

- `service_role` キーは Vercel 環境変数のみに保持し、クライアントには一切埋め込みません。
  組織マスターのハッシュは DB（`organizations`）にのみ保存されます。
- データは `org_id` でテナント分離されます（API は必ず `org_id` でスコープ）。
- 組織作成は既定で公開です。乱立を防ぐには `SIGNUP_CODE` を設定してください。
- パスワードはクライアントで SHA-256 化して送信します。より堅牢にする場合は
  「平文を HTTPS 送信 → サーバーで argon2/bcrypt」や Supabase Auth の採用を検討してください（クライアント改修が必要）。
