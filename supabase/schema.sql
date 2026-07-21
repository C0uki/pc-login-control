-- =====================================================
-- PC Login Control — Supabase (PostgreSQL) スキーマ
--   GAS + スプレッドシートから移行したテーブル定義。
--   Supabase の SQL Editor に貼り付けて実行してください。
--
--   ・API（Vercel サーバーレス関数）は service_role キーで接続し、
--     RLS をバイパスして読み書きします。
--   ・RLS は有効化しつつポリシーを作らないことで、anon / authenticated
--     ロール（公開キー）からの直接アクセスを遮断します。
--   ・マスターパスワードは DB ではなく Vercel の環境変数
--     MASTER_PASS_HASH（SHA-256）で管理します。
-- =====================================================

-- ---------- ユーザーマスター ----------
create table if not exists public.users (
  user_id         text primary key,
  user_name       text not null default '',
  hashed_password text not null,                 -- SHA-256(小文字HEX)。クライアントで計算して送信
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- 利用ログ ----------
create table if not exists public.logs (
  id         bigint generated always as identity primary key,
  user_id    text not null,
  user_name  text not null default '',
  action     text not null,                       -- 'login' | 'logout' | 'login(mobile)' 等
  created_at timestamptz not null default now()
);
create index if not exists logs_user_id_idx    on public.logs (user_id);
create index if not exists logs_created_at_idx  on public.logs (created_at desc);

-- ---------- 認証リクエスト（モバイル承認フロー） ----------
create table if not exists public.approval_requests (
  request_id   uuid primary key default gen_random_uuid(),
  user_id      text not null,
  user_name    text not null default '',
  device_name  text not null default 'PC',
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'denied', 'expired')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists approval_requests_user_status_idx on public.approval_requests (user_id, status);
create index if not exists approval_requests_created_at_idx  on public.approval_requests (created_at desc);

-- ---------- RLS（公開キーからの直接アクセスを遮断） ----------
alter table public.users             enable row level security;
alter table public.logs              enable row level security;
alter table public.approval_requests enable row level security;
-- ポリシーは作成しません。service_role（Vercel API）のみアクセス可能です。

-- ---------- updated_at 自動更新（users） ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
