-- ============================================================
-- 六爻排盘 - Supabase 表结构
-- ============================================================
--
-- 在 Supabase 控制台的 SQL Editor 里整份执行即可（可重复执行）。
--
-- 设计要点：这里存的是「起卦时的原始事实」，不是算出来的排盘结果。
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

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 卦例表
-- ------------------------------------------------------------

create table if not exists public.readings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

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
  constraint readings_yao_values_range check (
    yao_values <@ array[6, 7, 8, 9]::smallint[]
  ),
  constraint readings_mode_valid check (mode in ('random', 'manual')),
  constraint readings_day_ganzhi_len check (char_length(day_ganzhi) = 2),
  constraint readings_xun_kong_len check (char_length(xun_kong) = 2),
  constraint readings_question_len check (question is null or char_length(question) <= 2000)
);

-- 历史列表按时间倒序翻页
create index if not exists readings_user_cast_at_idx
  on public.readings (user_id, cast_at desc);

-- ------------------------------------------------------------
-- 行级安全：每个人只能看见和操作自己的卦例
-- ------------------------------------------------------------

alter table public.readings enable row level security;

drop policy if exists "读取自己的卦例" on public.readings;
create policy "读取自己的卦例"
  on public.readings for select
  using (auth.uid() = user_id);

drop policy if exists "写入自己的卦例" on public.readings;
create policy "写入自己的卦例"
  on public.readings for insert
  with check (auth.uid() = user_id);

drop policy if exists "修改自己的卦例" on public.readings;
create policy "修改自己的卦例"
  on public.readings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "删除自己的卦例" on public.readings;
create policy "删除自己的卦例"
  on public.readings for delete
  using (auth.uid() = user_id);

-- user_id 不允许伪造：即使客户端漏传也由服务端补上当前登录用户
alter table public.readings
  alter column user_id set default auth.uid();
