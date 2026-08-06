-- ============================================================
-- 六爻排盘 - 常用查询
-- ============================================================
--
-- 在 Supabase 控制台的 SQL Editor 里执行。
--
-- ── 用户存在哪里 ──
--
-- 本项目没有自建 public.users 表，因为 Supabase Auth 已经有了：auth.users。
-- 邮箱、注册时间、最后登录时间、用哪个方式登录的，全在那张表里，
-- 由 Supabase 自己维护。readings.user_id 就是外键指向它。
--
-- 控制台 Authentication → Users 可以直接看。用 SQL 看则如下
-- （SQL Editor 以 postgres 身份运行，能读 auth schema；
--   前端拿 anon key 读不到，只能通过 supabase.auth.getUser() 拿到自己那条）。


-- ------------------------------------------------------------
-- 用户列表
-- ------------------------------------------------------------

select
  email,
  created_at                             as 注册时间,
  last_sign_in_at                        as 最后登录,
  raw_app_meta_data ->> 'provider'       as 登录方式,   -- email / google / github
  email_confirmed_at is not null         as 邮箱已验证
from auth.users
order by created_at desc;


-- ------------------------------------------------------------
-- 总览
-- ------------------------------------------------------------

select
  (select count(*) from auth.users)                                        as 用户数,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days') as 近7天活跃,
  (select count(*) from public.readings)                                   as 卦例总数,
  (select count(*) from public.readings where question <> '')              as 填了占问的,
  (select round(avg(c), 1) from (
     select count(*) c from public.readings group by user_id
   ) t)                                                                    as 人均卦例;


-- ------------------------------------------------------------
-- 每个用户起了多少卦
-- ------------------------------------------------------------
-- 配额上限是 1000 条/人（见 schema.sql 的 enforce_readings_quota）。
-- 有人逼近上限时这里能看出来。

select
  u.email,
  count(r.id)        as 卦例数,
  max(r.cast_at)     as 最近一卦,
  u.created_at       as 注册时间
from auth.users u
left join public.readings r on r.user_id = u.id
group by u.id, u.email, u.created_at
order by count(r.id) desc;


-- ------------------------------------------------------------
-- 每日起卦量
-- ------------------------------------------------------------

select
  date_trunc('day', cast_at)::date as 日期,
  count(*)                          as 卦例数,
  count(distinct user_id)           as 起卦人数
from public.readings
where cast_at > now() - interval '30 days'
group by 1
order by 1 desc;


-- ------------------------------------------------------------
-- 起卦方式与语言分布
-- ------------------------------------------------------------

select mode as 起卦方式, count(*) from public.readings group by 1 order by 2 desc;
select coalesce(lang, '未知') as 语言, count(*) from public.readings group by 1 order by 2 desc;


-- ------------------------------------------------------------
-- 最常摇出的卦
-- ------------------------------------------------------------
-- 卦名在客户端由 yao_values 推算，数据库里没有存。
-- 这里按爻的阴阳还原出六位二进制（初爻在左），足够做分布统计。
-- 7/9 为阳记 1，6/8 为阴记 0。

select
  (select string_agg(case when v in (7, 9) then '1' else '0' end, '')
   from unnest(yao_values) with ordinality as t(v, ord)
   order by ord)                 as 本卦二进制,
  count(*)                       as 次数
from public.readings
group by 1
order by 2 desc
limit 20;


-- ------------------------------------------------------------
-- 删除某个用户及其全部数据
-- ------------------------------------------------------------
-- readings 上有 on delete cascade，删用户会连带删掉他的卦例。

-- delete from auth.users where email = 'someone@example.com';
