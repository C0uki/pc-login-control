# Supabase（データベース・マルチテナント）

PC Login Control のデータストア。オーナーが1つ運用し、各組織（`org_id`）でデータを分離します。

| テーブル | 役割 | 主なカラム |
|----------|------|-----------|
| `organizations` | 組織（テナント） | `org_id`(PK/uuid), `name`, `master_pass_hash` |
| `users` | ユーザーマスター | `(org_id, user_id)`(PK), `user_name`, `hashed_password` |
| `logs` | 利用ログ | `org_id`, `user_id`, `user_name`, `action`, `created_at` |
| `approval_requests` | 認証リクエスト | `request_id`(uuid), `org_id`, `user_id`, `device_name`, `status`, `created_at`, `responded_at` |

## 適用方法

1. Supabase プロジェクトの **SQL Editor** を開く
2. [`schema.sql`](schema.sql) を貼り付けて実行

RLS は有効・ポリシーなし（service_role のみアクセス可）。API（`../server`）が
service_role キーで接続します。詳細なセットアップは [`../server/README.md`](../server/README.md) を参照してください。
