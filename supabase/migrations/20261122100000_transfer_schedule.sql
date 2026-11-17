-- Step 7, the occurrence model (D-420): create_transfer takes a fixed-day transfer's cadence and
-- first date (R-ACCOUNT-300). Its retry guard (D-390) comes from the client-request migration,
-- which runs after step 7's, so the full signature is set up here: the guarded public call over
-- step 7's private.create_transfer_core. Nothing else changes.

drop function public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid, uuid);
drop function private.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid);

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
  p_cadence public.subscription_cadence default null,
  p_first_date date default null,
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
  v_id uuid;
begin
  if p_client_id is null then
    v_id := private.create_transfer_core(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
      p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id, p_cadence, p_first_date);
    return query select * from public.transfer_overview as t where t.id = v_id;
    return;
  end if;
  v_digest := private.client_request_digest(pg_catalog.jsonb_build_array(p_name, p_from_account_id, p_to_account_id, p_amount,
    p_schedule, p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id, p_cadence,
    p_first_date));
  -- like every guarded call: membership, the catch-up gate, the lock, membership again, then the
  -- request id; a replay answers a current member only rows of this budget (D-390)
  perform private.client_request_lock(p_budget_id);
  v_ids := private.client_request_replay(p_client_id, p_budget_id, 'create_transfer', v_digest);
  if v_ids is not null then
    return query select t.* from public.transfer_overview as t where t.id = any (v_ids) and t.budget_id = p_budget_id;
    return;
  end if;
  v_id := private.create_transfer_core(p_budget_id, p_name, p_from_account_id, p_to_account_id, p_amount, p_schedule,
    p_offset_days, p_day_of_month, p_income_id, p_is_automatic, p_category_id, p_from_period_id, p_cadence, p_first_date);
  perform private.client_request_record(p_client_id, p_budget_id, 'create_transfer', v_digest, array[v_id]);
  return query select * from public.transfer_overview as t where t.id = v_id;
end;
$$;

revoke all on function
  private.create_transfer_core(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid,
                               uuid, public.subscription_cadence, date),
  public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid,
                         public.subscription_cadence, date, uuid)
from public, anon, authenticated;

grant execute on function
  public.create_transfer(uuid, text, uuid, uuid, bigint, public.transfer_schedule, integer, integer, uuid, boolean, uuid, uuid,
                         public.subscription_cadence, date, uuid)
to authenticated;
