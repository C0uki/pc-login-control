-- =====================================================
-- PC Login Control — Supabase (PostgreSQL) スキーマ【マルチテナント版】
--   オーナーが1つの Supabase+Vercel を運用し、導入者は「組織(organization)」
--   を作るだけで利用する SaaS 型。データは org_id でテナント分離します。
--
--   ・API（Vercel）は service_role キーで接続し、org_id でスコープします。
--   ・RLS は有効化・ポリシーなし（service_role のみアクセス可）。
--   ・マスターパスワードは組織ごとに organizations.master_pass_hash で管理。
--     （旧: 環境変数 MASTER_PASS_HASH は不要になりました）
-- =====================================================

-- ---------- 組織（テナント） ----------
create table if not exists public.organizations (
  org_id           uuid primary key default gen_random_uuid(),
  name             text not null,
  master_pass_hash text not null,                 -- 組織管理者(マスター)PWの SHA-256
  created_at       timestamptz not null default now()
);

-- ---------- ユーザーマスター（組織ごと） ----------
create table if not exists public.users (
  org_id          uuid not null references public.organizations(org_id) on delete cascade,
  user_id         text not null,
  user_name       text not null default '',
  hashed_password text not null,                 -- SHA-256(小文字HEX)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- ---------- 利用ログ ----------
create table if not exists public.logs (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(org_id) on delete cascade,
  user_id    text not null,
  user_name  text not null default '',
  action     text not null,
  created_at timestamptz not null default now()
);
create index if not exists logs_org_created_idx on public.logs (org_id, created_at desc);

-- ---------- 認証リクエスト（モバイル承認フロー） ----------
create table if not exists public.approval_requests (
  request_id   uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(org_id) on delete cascade,
  user_id      text not null,
  user_name    text not null default '',
  device_name  text not null default 'PC',
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'denied', 'expired')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists approval_requests_org_idx on public.approval_requests (org_id, status, created_at desc);

-- ---------- RLS（公開キーからの直接アクセスを遮断） ----------
alter table public.organizations     enable row level security;
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
