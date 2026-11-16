-- A retried add records once (Q-090, D-390, R-APP-250). The calls that create a record and
-- that nothing else makes idempotent take an optional client-generated id (p_client_id, a
-- uuid generated once per user action and sent again with every retry of it): add_transaction,
-- add_income, create_category, create_subscription, create_debt, create_account and
-- create_transfer. The first call with an id records it beside the rows it created; the same id
-- sent again by the same member, for the same budget and the same call with the same
-- arguments, creates nothing and answers the rows recorded the first time (as they are now; a
-- row deleted since is not answered). Any other use of a known id (another member, another
-- budget, another call, other arguments) is refused with request_reused, before anything is
-- written, and reveals nothing about the first request. Without an id the calls behave as
-- before. Retries of the other writes are already harmless: every edit, end, mark and
-- adjustment names the revision it read (record_changed on a retry), and an import chunk is
-- idempotent by batch and chunk.
--
-- Each call keeps its whole implementation, moved to the private schema under the same name;
-- the public function checks the id under the budget lock, calls it and records the ids.

-- ===========================================================================
-- The requests seen (one row per client id), kept 7 days
-- ===========================================================================
create table private.client_requests (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_id uuid not null references public.budgets (id) on delete cascade,
  kind text not null,
  digest text not null,
  record_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create index client_requests_user_idx on private.client_requests (user_id, created_at);
create index client_requests_budget_idx on private.client_requests (budget_id);
alter table private.client_requests enable row level security;
-- no policy: only the security definer functions below read or write it
revoke all on table private.client_requests from public, anon, authenticated, service_role;

-- What a request asked for (its arguments), to tell a retry from a reuse.
create function private.client_request_digest(p_args jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.md5(p_args::text)
$$;

-- The rows a retried request created, or null for a new id; request_reused for any other use
-- of a known id. Called under the budget lock.
create function private.client_request_replay(p_id uuid, p_budget_id uuid, p_kind text, p_digest text)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  r private.client_requests;
begin
  select q.* into r from private.client_requests as q where q.id = p_id;
  if r.id is null then
    return null;
  end if;
  if r.user_id is distinct from (select auth.uid()) or r.budget_id <> p_budget_id or r.kind <> p_kind or r.digest <> p_digest then
    raise exception 'request_reused' using errcode = 'P0001';
  end if;
  return r.record_ids;
end;
$$;

-- Record a request once its rows exist (the same id racing from another budget: request_reused,
-- and this call's rows go with its rollback). Older requests of the user are pruned.
create function private.client_request_record(p_id uuid, p_budget_id uuid, p_kind text, p_digest text, p_ids uuid[])
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  delete from private.client_requests as q
  where q.user_id = (select auth.uid()) and q.created_at < now() - interval '7 days';
  insert into private.client_requests (id, user_id, budget_id, kind, digest, record_ids)
  values (p_id, (select auth.uid()), p_budget_id, p_kind, p_digest, coalesce(p_ids, '{}'))
  on conflict (id) do nothing;
  if not found then
    raise exception 'request_reused' using errcode = 'P0001';
  end if;
end;
$$;

-- Before the id is looked at: a budget far behind answers catching_up without the lock (D-387),
-- then the budget lock, so a retry waits for the first call and finds what it recorded.
create function private.client_request_lock(p_budget_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform private.catch_up_gate(p_budget_id);
  perform private.lock_budget(p_budget_id);
end;
$$;

-- ===========================================================================
-- The calls: the implementation moves to private, the public function wraps it
-- ===========================================================================
alter function public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text, uuid, uuid) set schema private;
alter function public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid) set schema private;
alter function public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text) set schema private;
alter function public.create_subscription(uuid, text, bigint, public.subscription_cadence, uuid, date, uuid) set schema private;
alter function public.create_debt(uuid, text, bigint, uuid, bigint, numeric, uuid) set schema private;
alter function public.create_account(uuid, text, public.account_kind, text, uuid, uuid) set schema private;
alter function public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid) set schema private;

-- R-TRANSACTION-001 and the rest as private.add_transaction; R-APP-250: p_client_id.
create function public.add_transaction(
  p_budget_id uuid,
  p_kind public.transaction_kind,
  p_amount bigint,
  p_date date,
  p_category_id uuid default null,
  p_description text default null,
  p_debt_id uuid default null,
  p_subscription_id uuid default null,
  p_client_id uuid default null
)
returns setof public.transaction_list
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.transaction_list;
begin
  if p_client_id is null then
    return query select * from private.add_transaction(p_budget_id, p_kind, p_amount, p_date, p_category_id, p_description,
                                                        p_debt_id, p_subscription_id);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_kind, p_amount, p_date, p_category_id, p_description,
                                                                         p_debt_id, p_subscription_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'add_transaction', v_digest);
  if v_ids is not null then
    return query select t.* from public.transaction_list as t where t.id = any (v_ids);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.add_transaction(p_budget_id, p_kind, p_amount, p_date, p_category_id, p_description,
                                                  p_debt_id, p_subscription_id) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'add_transaction', v_digest, v_ids);
end;
$$;

create function public.add_income(
  p_budget_id uuid,
  p_name text,
  p_amount bigint,
  p_pay_day integer,
  p_weekend_rule public.weekend_rule default 'nearest',
  p_user_id uuid default null,
  p_from_period_id uuid default null,
  p_account_id uuid default null,
  p_client_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  v_id uuid;
begin
  if p_client_id is null then
    return private.add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule, p_user_id, p_from_period_id, p_account_id);
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_amount, p_pay_day, p_weekend_rule, p_user_id,
                                                                         p_from_period_id, p_account_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'add_income', v_digest);
  if v_ids is not null then
    return v_ids[1];
  end if;
  v_id := private.add_income(p_budget_id, p_name, p_amount, p_pay_day, p_weekend_rule, p_user_id, p_from_period_id, p_account_id);
  perform private.client_request_record(p_client_id, p_budget_id, 'add_income', v_digest, array[v_id]);
  return v_id;
end;
$$;

create function public.create_category(
  p_budget_id uuid,
  p_name text,
  p_parent_id uuid default null,
  p_amount bigint default 0,
  p_cadence public.expectation_cadence default 'monthly',
  p_from_period_id uuid default null,
  p_other_name text default null,
  p_client_id uuid default null
)
returns setof public.category_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.category_overview;
begin
  if p_client_id is null then
    return query select * from private.create_category(p_budget_id, p_name, p_parent_id, p_amount, p_cadence, p_from_period_id, p_other_name);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_parent_id, p_amount, p_cadence, p_from_period_id, p_other_name));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_category', v_digest);
  if v_ids is not null then
    return query select c.* from public.category_overview as c where c.id = any (v_ids)
                 order by pg_catalog.array_position(v_ids, c.id);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.create_category(p_budget_id, p_name, p_parent_id, p_amount, p_cadence, p_from_period_id, p_other_name) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'create_category', v_digest, v_ids);
end;
$$;

create function public.create_subscription(
  p_budget_id uuid,
  p_name text,
  p_price bigint,
  p_cadence public.subscription_cadence,
  p_category_id uuid,
  p_first_charge_date date,
  p_from_period_id uuid default null,
  p_client_id uuid default null
)
returns setof public.subscription_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.subscription_overview;
begin
  if p_client_id is null then
    return query select * from private.create_subscription(p_budget_id, p_name, p_price, p_cadence, p_category_id, p_first_charge_date, p_from_period_id);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_price, p_cadence, p_category_id, p_first_charge_date, p_from_period_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_subscription', v_digest);
  if v_ids is not null then
    return query select s.* from public.subscription_overview as s where s.id = any (v_ids);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.create_subscription(p_budget_id, p_name, p_price, p_cadence, p_category_id, p_first_charge_date, p_from_period_id) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'create_subscription', v_digest, v_ids);
end;
$$;

create function public.create_debt(
  p_budget_id uuid,
  p_name text,
  p_principal bigint,
  p_category_id uuid,
  p_monthly_payment bigint,
  p_interest_rate numeric default null,
  p_from_period_id uuid default null,
  p_client_id uuid default null
)
returns setof public.debt_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.debt_overview;
begin
  if p_client_id is null then
    return query select * from private.create_debt(p_budget_id, p_name, p_principal, p_category_id, p_monthly_payment, p_interest_rate, p_from_period_id);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_principal, p_category_id, p_monthly_payment, p_interest_rate, p_from_period_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_debt', v_digest);
  if v_ids is not null then
    return query select d.* from public.debt_overview as d where d.id = any (v_ids);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.create_debt(p_budget_id, p_name, p_principal, p_category_id, p_monthly_payment, p_interest_rate, p_from_period_id) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'create_debt', v_digest, v_ids);
end;
$$;

create function public.create_account(
  p_budget_id uuid,
  p_name text,
  p_kind public.account_kind,
  p_bank_label text default null,
  p_user_id uuid default null,
  p_from_period_id uuid default null,
  p_client_id uuid default null
)
returns setof public.account_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.account_overview;
begin
  if p_client_id is null then
    return query select * from private.create_account(p_budget_id, p_name, p_kind, p_bank_label, p_user_id, p_from_period_id);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_kind, p_bank_label, p_user_id, p_from_period_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_account', v_digest);
  if v_ids is not null then
    return query select a.* from public.account_overview as a where a.id = any (v_ids);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.create_account(p_budget_id, p_name, p_kind, p_bank_label, p_user_id, p_from_period_id) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'create_account', v_digest, v_ids);
end;
$$;

create function public.create_transfer(
  p_budget_id uuid,
  p_name text,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount bigint,
  p_schedule public.transfer_schedule,
  p_offset_days integer default null,
  p_day_of_month integer default null,
  p_income_id uuid default null,
  p_is_automatic boolean default false,
  p_category_id uuid default null,
  p_from_period_id uuid default null,
  p_client_id uuid default null
)
returns setof public.transfer_overview
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_digest text;
  v_ids uuid[];
  r public.transfer_overview;
begin
  if p_client_id is null then
    return query select * from private.create_transfer(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
                                                        p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id);
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
                                                                         p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id));
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_transfer', v_digest);
  if v_ids is not null then
    return query select t.* from public.transfer_overview as t where t.id = any (v_ids);
    return;
  end if;
  v_ids := '{}';
  for r in select * from private.create_transfer(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
                                                  p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id) loop
    v_ids := v_ids || r.id;
    return next r;
  end loop;
  perform private.client_request_record(p_client_id, p_budget_id, 'create_transfer', v_digest, v_ids);
end;
$$;

-- ===========================================================================
-- Privileges: the moved implementations are internal; the new public calls for signed-in users
-- ===========================================================================
revoke all on function
  private.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text, uuid, uuid),
  private.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid),
  private.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text),
  private.create_subscription(uuid, text, bigint, public.subscription_cadence, uuid, date, uuid),
  private.create_debt(uuid, text, bigint, uuid, bigint, numeric, uuid),
  private.create_account(uuid, text, public.account_kind, text, uuid, uuid),
  private.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid),
  private.client_request_digest(jsonb),
  private.client_request_replay(uuid, uuid, text, text),
  private.client_request_record(uuid, uuid, text, text, uuid[]),
  private.client_request_lock(uuid),
  public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text, uuid, uuid, uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid, uuid),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text, uuid),
  public.create_subscription(uuid, text, bigint, public.subscription_cadence, uuid, date, uuid, uuid),
  public.create_debt(uuid, text, bigint, uuid, bigint, numeric, uuid, uuid),
  public.create_account(uuid, text, public.account_kind, text, uuid, uuid, uuid),
  public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.add_transaction(uuid, public.transaction_kind, bigint, date, uuid, text, uuid, uuid, uuid),
  public.add_income(uuid, text, bigint, integer, public.weekend_rule, uuid, uuid, uuid, uuid),
  public.create_category(uuid, text, uuid, bigint, public.expectation_cadence, uuid, text, uuid),
  public.create_subscription(uuid, text, bigint, public.subscription_cadence, uuid, date, uuid, uuid),
  public.create_debt(uuid, text, bigint, uuid, bigint, numeric, uuid, uuid),
  public.create_account(uuid, text, public.account_kind, text, uuid, uuid, uuid),
  public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid, uuid)
to authenticated;
