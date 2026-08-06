-- ============================================================
-- 六爻排盘 - Supabase 表结构
-- ============================================================
--
-- 在 Supabase 控制台的 SQL Editor 里整份执行（可重复执行，升级也走这一份）。
--
-- ── 存什么 ──
--
-- 这里存的是「起卦时的原始事实」，不是算出来的排盘结果。
--
--   · yao_values  —— 六个爻值（6/7/8/9），起卦的唯一原始输入
--   · day_ganzhi / shichen / xun_kong —— 起卦当时的干支文本快照
--
-- 为什么不存卦名、六亲、六神这些派生结果：
--   1. 排盘逻辑会修。本项目就出现过八卦位序、纳甲外卦、六神起例三处错误，
--      当时存下来的派生结果会把错误永久冻在库里；只存原始输入则重算即恢复正确。
--   2. cast_at 是 timestamptz，按它重算干支会随「查看设备」的时区漂移
--      —— 北京起的卦在纽约打开会变成前一天。所以干支必须在起卦那一刻定死存文本。
--
-- 卦名、纳甲、六亲、世应由 yao_values 纯函数推出；
-- 六神由 day_ganzhi 的天干推出；旬空直接用 xun_kong。全部在客户端重算。
--
-- ── 威胁模型 ──
--
-- anon key 是公开的（前端 SDK 必须带着它），而且允许自助注册。
-- 因此必须假设「任何人都能拿到一个合法的已登录身份」，防线全部落在这个文件里：
--
--   · RLS 策略      —— 每人只能读写自己的行
--   · 撤销 anon 授权 —— 未登录身份连表都碰不到，不依赖策略兜底
--   · 每用户配额     —— 挡住「注册一个号然后写爆你的免费额度」
--   · 无 UPDATE 策略 —— 卦例一旦落库不可篡改
--
-- 客户端的任何校验都不算数：请求可以被直接构造，只有这里的约束是真的。

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 卦例表
-- ------------------------------------------------------------

create table if not exists public.readings (
  id          uuid primary key default gen_random_uuid(),

  -- 由数据库按当前登录身份填入，客户端无法伪造成别人
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  -- 客户端生成的记录标识。用于让「补传本地卦例」这件事可重复执行：
  -- 多标签页同时登录、上传超时后重试，都不会在历史里留下重复条目。
  client_id   text,

  -- 起卦时刻。仅用于排序，干支一律以下面的文本快照为准
  cast_at     timestamptz not null,
  -- 起卦地的墙上时间「YYYY-MM-DD HH:mm」。timestamptz 只存瞬间不存时区，
  -- 按它渲染会显示成查看设备所在时区的时刻 —— 北京起的卦在纽约打开变成前一天。
  cast_at_local text not null,
  created_at  timestamptz not null default now(),

  -- 原始输入：初爻 → 上爻，取值 6(老阴)/7(少阳)/8(少阴)/9(老阳)
  yao_values  smallint[] not null,

  -- 起卦当时的干支快照
  day_ganzhi  text not null,          -- 如「壬子」
  shichen     text not null,          -- 如「申」
  xun_kong    text not null,          -- 如「寅卯」

  question    text,                   -- 占问之事，可为空
  mode        text not null default 'random',
  lang        text,                   -- 起卦时的界面语言

  constraint readings_yao_values_len check (array_length(yao_values, 1) = 6),
  -- <@ 判断「所有元素都属于该集合」。但数组里若混入 NULL，<@ 结果为 NULL，
  -- 而 CHECK 约束遇 NULL 视为通过 —— 所以必须另外把 NULL 挡掉
  constraint readings_yao_values_range check (
    yao_values <@ array[6, 7, 8, 9]::smallint[]
  ),
  constraint readings_yao_values_no_null check (
    array_position(yao_values, null) is null
  ),
  constraint readings_mode_valid check (mode in ('random', 'manual')),
  constraint readings_day_ganzhi_len check (char_length(day_ganzhi) = 2),
  constraint readings_shichen_len check (char_length(shichen) = 1),
  constraint readings_xun_kong_len check (char_length(xun_kong) = 2),
  constraint readings_cast_at_local_len check (char_length(cast_at_local) <= 32),
  constraint readings_lang_len check (lang is null or char_length(lang) <= 16),
  constraint readings_client_id_len check (client_id is null or char_length(client_id) <= 64),
  constraint readings_question_len check (question is null or char_length(question) <= 2000)
);

-- 升级路径：上面的 create 对已存在的表是空操作，新增列要单独补
alter table public.readings add column if not exists client_id text;
alter table public.readings alter column user_id set default auth.uid();

-- 历史列表按时间倒序翻页
create index if not exists readings_user_cast_at_idx
  on public.readings (user_id, cast_at desc);

-- 补传本地卦例的幂等键：同一用户的同一 client_id 只会留下一行。
-- 刻意不用 partial index（... where client_id is not null）—— 那样 ON CONFLICT
-- 无法推断出仲裁索引，upsert 会直接报错。普通唯一索引已经够用：
-- PostgreSQL 默认认为 NULL 互不相等，所以 client_id 为空的老数据不会互相冲突。
create unique index if not exists readings_user_client_id_key
  on public.readings (user_id, client_id);

-- ------------------------------------------------------------
-- 每用户配额
-- ------------------------------------------------------------
--
-- anon key 公开 + 允许自助注册 = 任何人都能拿到合法身份往里写。
-- RLS 只保证「写进自己的行」，不限制写多少行。没有这道闸门，
-- 一个脚本就能把免费层的 500MB 塞满。
--
-- 单条记录约 0.5KB，1000 条约 0.5MB/人。要调整改下面的常量即可。
-- 这不能替代 Supabase 控制台里的注册频率限制，两者是不同层面的防护。

create or replace function public.enforce_readings_quota()
returns trigger
language plpgsql
security definer            -- 需要越过 RLS 才能数全这个用户的行
set search_path = ''        -- 防止 search_path 劫持
as $$
declare
  max_readings constant integer := 1000;
  existing_count integer;
begin
  select count(*) into existing_count
  from public.readings
  where user_id = new.user_id;

  if existing_count >= max_readings then
    raise exception '卦例数量已达上限（% 条），请先删除一些旧记录', max_readings
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 触发器函数不需要调用方持有 EXECUTE 权限，撤销掉以免被当普通函数调用
revoke all on function public.enforce_readings_quota() from public;

drop trigger if exists readings_quota on public.readings;
create trigger readings_quota
  before insert on public.readings
  for each row execute function public.enforce_readings_quota();

-- ------------------------------------------------------------
-- 行级安全
-- ------------------------------------------------------------

alter table public.readings enable row level security;

-- 未登录身份不该以任何形式碰到这张表。RLS 策略本身已经拦得住
-- （auth.uid() 为 NULL 时条件不成立），但少一层授权就少一次
-- 「将来误加宽松策略导致全表泄露」的机会。
revoke all on public.readings from anon;
grant select, insert, delete on public.readings to authenticated;

drop policy if exists "读取自己的卦例" on public.readings;
create policy "读取自己的卦例"
  on public.readings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "写入自己的卦例" on public.readings;
create policy "写入自己的卦例"
  on public.readings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "删除自己的卦例" on public.readings;
create policy "删除自己的卦例"
  on public.readings for delete
  to authenticated
  using (auth.uid() = user_id);

-- 刻意不开 UPDATE 策略。
-- 一是应用根本不改已有卦例（只有新增和删除）；
-- 二是卦例本该不可篡改 —— 起完卦还能回头改爻值或占问，记录就失去意义了。
-- 若将来要支持「补记占问」，只加一条限定 question 列的 UPDATE 策略，
-- 不要直接开放整行。
drop policy if exists "修改自己的卦例" on public.readings;


-- ============================================================
-- 用户资料
-- ============================================================
--
-- 用户本身由 Supabase Auth 存在 auth.users：邮箱、注册时间、最后登录、
-- 用哪个方式登录的，都在那里，不需要也不应该自建一张 users 表去重复它。
--
-- 但 auth.users 有两个限制，所以还需要这张 profiles：
--   1. 前端拿 anon key 读不到 auth schema，只能通过 auth.getUser() 拿自己那条，
--      没法在 SQL 里 join，也没法给应用加字段。
--   2. 昵称、头像这类「应用自己的」字段不该塞进 Auth 的元数据。
--
-- email 在这里是一份副本，由触发器与 auth.users 保持同步，方便直接查询；
-- 真实来源始终是 auth.users。

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,                    -- auth.users.email 的同步副本
  nickname    text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_nickname_len check (
    nickname is null or char_length(nickname) between 1 and 40
  ),
  constraint profiles_avatar_len check (
    avatar_url is null or char_length(avatar_url) <= 500
  )
);

-- ------------------------------------------------------------
-- 注册时自动建档
-- ------------------------------------------------------------
--
-- Google / GitHub 登录会带回昵称和头像，直接采用；邮箱登录则拿 @ 前缀兜底。
-- 邮箱变更时只同步 email 一列，不覆盖用户已经改过的昵称。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, nickname, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email      = excluded.email,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 由数据库维护：客户端只被授权改 nickname 一列，改不到这里
create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_profiles_updated_at() from public;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- 给建表之前就已注册的用户补档
insert into public.profiles (id, email, nickname, avatar_url)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'user_name',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 行级安全
-- ------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

-- 列级授权：只放开 nickname。RLS 策略管的是「哪些行」，管不了「哪些列」，
-- 不这样限制的话用户能把自己的 email 副本改成任意值，与 auth.users 脱节。
grant update (nickname) on public.profiles to authenticated;

drop policy if exists "读取自己的资料" on public.profiles;
create policy "读取自己的资料"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "修改自己的资料" on public.profiles;
create policy "修改自己的资料"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 刻意不开 INSERT / DELETE 策略：建档由触发器完成（SECURITY DEFINER 越过 RLS），
-- 注销由删除 auth.users 级联触发。用户无法凭空造出资料行。
