-- RESER · El primer profesional de cada negocio lleva el nombre del dueño (no "Principal").
-- Se crea solo al dar de alta el negocio (trigger on_business_created). En un negocio de una
-- sola persona el nombre casi no se ve; si hay más profesionales, "Principal" confundía.
-- Los negocios que ya existen no se tocan: el dueño lo renombra o desactiva desde Equipo.

create or replace function public.handle_new_business()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  select nullif(btrim(p.full_name), '') into v_name from public.profiles p where p.id = new.owner_id;
  insert into public.resources (business_id, name)
    values (new.id, coalesce(left(v_name, 60), 'Principal'));
  return new;
end;
$$;
