-- =====================================================================
--  메테오 법사 — Supabase 랭킹 스키마
--  Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run.
--  클라이언트는 테이블에 직접 접근하지 않고 아래 RPC 함수 3개만 호출한다(RLS로 직접 접근 차단).
--  수집 정보: 닉네임, 국가, 기록, 무작위 기기 ID(UUID) 뿐.
-- =====================================================================

create table if not exists public.scores (
  id           bigint generated always as identity primary key,
  nickname     text        not null check (char_length(nickname) between 2 and 12),
  country      char(2)     not null check (country ~ '^[A-Z]{2}$'),
  kills        bigint      not null check (kills >= 0),
  survive_sec  integer     not null check (survive_sec between 0 and 86400),
  level        integer     not null check (level between 1 and 500),
  max_combo    bigint      not null check (max_combo >= 0),
  meteor_skin  text        not null default 'fire'
               check (meteor_skin in ('fire', 'ice', 'poison', 'lightning', 'dark', 'gold')),
  hero         text        not null default 'mage'
               check (hero in ('mage', 'apprentice', 'pyromancer', 'icewitch', 'necromancer')),
  device_id    uuid        not null,
  season       integer     not null default 1,   -- 규칙이 바뀌면 올림(2026-11-20: 2). 시즌끼리 섞지 않음
  created_at   timestamptz not null default now()
);

-- 이전 버전 스키마에서 올리는 경우(이미 테이블이 있으면) hero 열만 추가
alter table public.scores add column if not exists hero text not null default 'mage'
  check (hero in ('mage', 'apprentice', 'pyromancer', 'icewitch', 'necromancer'));
alter table public.scores add column if not exists season integer not null default 1;
drop function if exists public.submit_score(text, text, bigint, integer, integer, bigint, text, uuid);
drop function if exists public.submit_score(text, text, bigint, integer, integer, bigint, text, uuid, text);
drop function if exists public.get_top(text, text, uuid);
drop function if exists public.get_my_rank(text, text, uuid);
drop function if exists public._scores_in_scope(text, text);

create index if not exists scores_kills_idx          on public.scores (kills desc, created_at asc);
create index if not exists scores_season_kills_idx   on public.scores (season, kills desc, created_at asc);
create index if not exists scores_created_idx        on public.scores (created_at desc);
create index if not exists scores_country_kills_idx  on public.scores (country, kills desc, created_at asc);
create index if not exists scores_device_created_idx on public.scores (device_id, created_at desc);

-- 직접 읽기/쓰기 금지: 정책을 하나도 만들지 않으면 anon 은 아무것도 못 한다.
alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;

-- ---------------------------------------------------------------------
-- 부정 방지 한도 (js/config.js 의 값과 맞춰 두세요) — 시즌 2 (2026-11-20)
--   spawn.curve (아래 _spawn_curve), spawn.perTickMax = 220, sim.tickRate = 30, sim.maxMobs = 60000
--   meteor.radius = 120, meteor.rangeCardPct = 0.15, items.lensPct = 0.06 × 5개
--   보스: 120초마다, 슬라임 왕 220마리 분열, 리치 6초마다 36마리 소환
-- ---------------------------------------------------------------------

-- 시간(초) → 필드 목표 몹 수 (js/config.js spawn.curve 와 같은 표, 선형 보간)
create or replace function public._spawn_target(p_t double precision)
returns double precision language sql immutable as $$
  with c(t, n) as (values (0, 60), (30, 160), (60, 300), (120, 900), (180, 2000), (270, 5000),
                          (360, 10000), (450, 18000), (540, 30000), (630, 40000), (720, 50000), (840, 60000)),
       seg as (select t, n, lead(t) over (order by t) t2, lead(n) over (order by t) n2 from c)
  select coalesce(
    (select n + (n2 - n) * (p_t - t) / (t2 - t) from seg where p_t >= t and p_t < t2),
    case when p_t < 0 then 60 else 60000 end)::double precision;
$$;

-- 그 생존 시간까지 잡을 수 있는 최대 몹 수.
-- 스폰은 틱마다 min(220, 목표 몹 수) 를 넘을 수 없다(목표까지만 채움) → 초마다 30 × min(220, 목표(t)) 를 더함
-- + 처음 필드 + 보스 분열·소환(넉넉하게) + 보스
create or replace function public.max_kills_possible(p_survive_sec integer)
returns bigint language sql immutable as $$
  select (coalesce((select sum(30 * least(220, public._spawn_target(s)))
                    from generate_series(0, greatest(p_survive_sec, 0)) s), 0)
          + public._spawn_target(greatest(p_survive_sec, 0))
          + (p_survive_sec / 120 + 1) * 400            -- 슬라임 왕 분열 + 리치 소환(보스가 살아 있는 동안) 여유
          + (p_survive_sec / 6) * 36
          + (p_survive_sec / 120 + 1))::bigint;
$$;

-- 그 레벨·시간에 한 번에 잡을 수 있는 최대 수: 폭발 면적 / 넉넉한 밀도(몹 1마리당 25 단위²)와
-- 그 시각 필드 몹 수 중 작은 쪽. 반경은 모든 레벨업을 범위 카드로 + 확산의 렌즈 5개로 가정
create or replace function public.max_combo_possible(p_level integer, p_survive_sec integer default 86400)
returns bigint language sql immutable as $$
  select least(60000::bigint,
               ceil(pi() * power(120 * power(1.06, 5) * power(1.15, greatest(p_level, 1) - 1), 2) / 25)::bigint + 50,
               ceil(public._spawn_target(greatest(p_survive_sec, 0)) * 1.2)::bigint + 400);
$$;

-- 범위별 기록(같은 시즌만)
create or replace function public._scores_in_scope(p_scope text, p_country text, p_season integer)
returns setof public.scores language sql stable security definer set search_path = public as $$
  select * from public.scores
  where season = p_season and case p_scope
          when 'today'   then created_at >= date_trunc('day', now())
          when 'week'    then created_at >= date_trunc('week', now())
          when 'country' then country = upper(coalesce(p_country, ''))
          else true
        end;
$$;
revoke all on function public._scores_in_scope(text, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC 1: 기록 제출 → {id, rank}
-- ---------------------------------------------------------------------
create or replace function public.submit_score(
  p_nickname text, p_country text, p_kills bigint, p_survive_sec integer,
  p_level integer, p_max_combo bigint, p_meteor_skin text, p_device_id uuid, p_hero text default 'mage',
  p_season integer default 1
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_nick text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_id bigint;
  v_rank bigint;
begin
  -- 닉네임: 2~12자, 제어문자·꺾쇠·따옴표 금지
  if char_length(v_nick) < 2 or char_length(v_nick) > 12 or v_nick ~ '[[:cntrl:]<>"''`\\]' then
    raise exception 'invalid nickname';
  end if;
  if p_country is null or p_country !~ '^[A-Z]{2}$' then raise exception 'invalid country'; end if;
  if p_kills < 0 or p_max_combo < 0 or p_survive_sec < 0 or p_level < 1 then raise exception 'invalid values'; end if;
  -- 불가능한 기록 거부
  if p_kills > public.max_kills_possible(p_survive_sec) then raise exception 'impossible kills'; end if;
  if p_season is null or p_season < 1 or p_season > 100 then raise exception 'invalid season'; end if;
  if p_max_combo > p_kills or p_max_combo > public.max_combo_possible(p_level, p_survive_sec) then raise exception 'impossible combo'; end if;
  -- 기기당 분당 제출 횟수 제한(3회)
  if (select count(*) from public.scores
      where device_id = p_device_id and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'rate limited';
  end if;

  insert into public.scores (nickname, country, kills, survive_sec, level, max_combo, meteor_skin, hero, device_id, season)
  values (v_nick, p_country, p_kills, p_survive_sec, p_level, p_max_combo, coalesce(p_meteor_skin, 'fire'), coalesce(p_hero, 'mage'), p_device_id, p_season)
  returning id into v_id;

  -- 전체 순위(기기별 최고 기록 기준, 동점이면 먼저 등록한 기록이 위)
  select count(*) + 1 into v_rank from (
    select distinct on (device_id) device_id, kills, created_at
    from public.scores where device_id <> p_device_id and season = p_season
    order by device_id, kills desc, created_at asc
  ) b
  where b.kills > p_kills;

  return json_build_object('id', v_id, 'rank', v_rank);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC 2: 상위 100명 (기기별 최고 기록) — scope: today | week | all | country
-- ---------------------------------------------------------------------
create or replace function public.get_top(p_scope text, p_country text, p_device_id uuid, p_season integer default 1)
returns table (nickname text, country text, kills bigint, meteor_skin text, hero text, created_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.device_id) s.*
    from public._scores_in_scope(p_scope, p_country, p_season) s
    order by s.device_id, s.kills desc, s.created_at asc
  )
  select b.nickname, b.country::text, b.kills, b.meteor_skin, b.hero, b.created_at, (b.device_id = p_device_id)
  from best b
  order by b.kills desc, b.created_at asc
  limit 100;
$$;

-- ---------------------------------------------------------------------
-- RPC 3: 내 순위 → {rank, kills} 또는 null
-- ---------------------------------------------------------------------
create or replace function public.get_my_rank(p_scope text, p_country text, p_device_id uuid, p_season integer default 1)
returns json language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (s.device_id) s.device_id, s.kills, s.created_at
    from public._scores_in_scope(p_scope, p_country, p_season) s
    order by s.device_id, s.kills desc, s.created_at asc
  ), me as (
    select kills, created_at from best where device_id = p_device_id
  )
  select case when exists (select 1 from me) then
    json_build_object(
      'kills', (select kills from me),
      'rank', (select count(*) + 1 from best b, me
               where b.kills > me.kills or (b.kills = me.kills and b.created_at < me.created_at)))
  end;
$$;

grant execute on function public.submit_score(text, text, bigint, integer, integer, bigint, text, uuid, text, integer) to anon;
grant execute on function public.get_top(text, text, uuid, integer) to anon;
grant execute on function public.get_my_rank(text, text, uuid, integer) to anon;
