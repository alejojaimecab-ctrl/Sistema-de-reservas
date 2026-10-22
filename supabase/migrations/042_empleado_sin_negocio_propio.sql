-- 042 · Una cuenta de empleado no puede crear su propio negocio (2026-10-22).
-- Si lo hacía, la app la abría como dueña del negocio nuevo y dejaba de ver su agenda en el negocio donde trabaja.
-- Para su propio negocio tiene que usar otra cuenta (otro email).

create or replace function private.block_staff_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_members sm where sm.user_id = new.owner_id) then
    raise exception 'Esta cuenta es parte del equipo de un negocio. Para crear el tuyo, usá otra cuenta con otro email.';
  end if;
  return new;
end;
$$;

drop trigger if exists block_staff_business on public.businesses;
create trigger block_staff_business
  before insert on public.businesses
  for each row execute function private.block_staff_business();
