# ① バックエンド接続手順（オーナー・初回のみ）

このシステムを「動く状態」にするための、**オーナーが一度だけ**行う設定です。
所要 15〜20 分、基本ブラウザだけで完了します。導入者（各組織の管理者）はこの作業は不要です。

> 前提: リポジトリはすでに Vercel に接続され、`main` へのマージで自動デプロイされています。
> ここでやるのは「Supabase を用意して Vercel に繋ぐ」ことです。

---

## STEP A. Supabase を用意する

1. [supabase.com](https://supabase.com/) にログイン → **New project**
   - Name: 任意（例 `pc-login-control`）
   - Database Password: 任意（後で使わないが控えておく）
   - Region: 近い場所（例 Tokyo）
2. 作成後、左メニュー **Settings（歯車）→ API** を開く
3. 次の2つをコピーして控える
   - **Project URL**（`https://xxxx.supabase.co`）→ `SUPABASE_URL`
   - **Project API keys → `service_role`**（`secret` と表示される長い文字列）→ `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ `service_role` キーは**秘密鍵**です。GitHub 等に貼らないでください（Vercel の環境変数にだけ入れます）。

---

## STEP B. Vercel に環境変数を設定する

1. [vercel.com](https://vercel.com/) → プロジェクト **pc-login-control** を開く
2. **Settings → Environment Variables**
3. 次を追加（Environment は Production / Preview / Development すべてにチェック推奨）

   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | STEP A の Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | STEP A の service_role キー |
   | `SIGNUP_CODE` | （任意）組織作成を合言葉で制限したい場合のみ |

4. **Deployments** タブ → 最新デプロイの「…」→ **Redeploy**
   （環境変数は再デプロイで反映されます）

---

## STEP C. データベースを初期化する

1. `https://<あなたのapp>.vercel.app/` を開く（= Web 管理コンソール）
2. 一番下の「**オーナー向け：初回セットアップ**」を展開
3. 「**SQLをコピー**」を押す
4. Supabase に戻り、左メニュー **SQL Editor → New query** に貼り付けて **Run**
   - `organizations` / `users` / `logs` / `approval_requests` テーブルが作られます
5. コンソールに戻って「**再確認**」→ 導入状態がすべて緑になれば完了

   - 🟢 API 接続 / 🟢 環境変数(Supabase) / 🟢 DBテーブル

---

## 動作確認

コンソールで「**組織を作成**」→ 組織名と管理者パスワードを入れて作成 →
**組織ID** が表示されればバックエンドは正常です。そのまま「組織にログイン」で
ユーザー登録・ログ・承認が使えます。

---

## うまくいかないとき

| 症状 | 原因 / 対処 |
|------|-------------|
| API 接続が 🔴 | 右上 ⚙️ の URL を確認。通常は空欄（同一オリジン）でOK |
| 環境変数が 🔴 | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 未設定、または **Redeploy 忘れ** |
| DBテーブルが 🟡/🔴 | STEP C の SQL を未実行。SQL Editor で実行後に「再確認」 |
| 「組織が見つかりません」 | まだ組織未作成。先に「組織を作成」 |
| 401/500 が返る | service_role キーの貼り間違い（anon キーではなく service_role） |

次 → [② PC/スマホアプリのビルド手順](02-build-clients.md) / [③ 導入チェックリスト](03-checklist.md)
