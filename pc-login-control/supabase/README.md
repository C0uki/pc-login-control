# Supabase（データベース）

PC Login Control のデータストア。GAS 版のスプレッドシート（ユーザーマスター / 利用ログ / 認証リクエスト）を PostgreSQL テーブルへ移行したものです。

| テーブル | 対応（旧スプレッドシート） | 主なカラム |
|----------|---------------------------|-----------|
| `users` | ユーザーマスター | `user_id`(PK), `user_name`, `hashed_password` |
| `logs` | 利用ログ | `user_id`, `user_name`, `action`, `created_at` |
| `approval_requests` | 認証リクエスト | `request_id`(uuid), `user_id`, `device_name`, `status`, `created_at`, `responded_at` |

## 適用方法

1. Supabase プロジェクトの **SQL Editor** を開く
2. [`schema.sql`](schema.sql) を貼り付けて実行

RLS は有効・ポリシーなし（service_role のみアクセス可）。API（`../server`）が
service_role キーで接続します。詳細なセットアップは [`../server/README.md`](../server/README.md) を参照してください。
