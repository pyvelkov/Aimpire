create or replace function public.claim_next_agent_task(
  p_agent_type text default null
)
returns setof public.agent_tasks
language sql
as $$
  with next_task as (
    select t.id
    from public.agent_tasks as t
    where t.status = 'pending'
      and (
        p_agent_type is null
        or t.agent_type = p_agent_type
      )
    order by
      t.priority asc,
      t.created_at asc
    for update skip locked
    limit 1
  )
  update public.agent_tasks as t
  set
    status = 'in_progress',
    started_at = now()
  from next_task
  where t.id = next_task.id
  returning t.*;
$$;
