-- Optimistic compare-and-swap for the per-user state document.
-- Prevents two devices from blindly overwriting a newer save.
create or replace function public.save_user_app_state(
  p_payload jsonb,
  p_expected_updated_at timestamptz default null
)
returns table (
  saved boolean,
  current_payload jsonb,
  current_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
  v_updated_at timestamptz;
  v_saved boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A valid JSON object payload is required';
  end if;

  if p_expected_updated_at is null then
    insert into public.user_app_state (user_id, payload, updated_at)
    values (v_user_id, p_payload, clock_timestamp())
    on conflict (user_id) do nothing
    returning payload, updated_at into v_payload, v_updated_at;
    v_saved := found;
  else
    update public.user_app_state as state
       set payload = p_payload,
           updated_at = greatest(clock_timestamp(), state.updated_at + interval '1 microsecond')
     where state.user_id = v_user_id
       and state.updated_at = p_expected_updated_at
    returning state.payload, state.updated_at into v_payload, v_updated_at;
    v_saved := found;
  end if;

  if not v_saved then
    select state.payload, state.updated_at
      into v_payload, v_updated_at
      from public.user_app_state as state
     where state.user_id = v_user_id;
  end if;

  return query select v_saved, v_payload, v_updated_at;
end;
$$;

revoke all on function public.save_user_app_state(jsonb, timestamptz) from public;
revoke all on function public.save_user_app_state(jsonb, timestamptz) from anon;
grant execute on function public.save_user_app_state(jsonb, timestamptz) to authenticated;
