-- RESER · Eliminar un profesional sin perder sus reservas.
--
-- reservations.resource_id no tiene ON DELETE CASCADE (a propósito: el historial no se borra). Por eso:
--   · si el profesional nunca tuvo reservas, se borra de verdad (con sus horarios y servicios asignados);
--   · si tiene historial, se "archiva": deleted_at + is_active = false. Deja de aparecer en Equipo, en la página
--     de reservas y en los filtros, pierde el acceso al panel, y sus reservas pasadas siguen mostrando su nombre.
-- No se puede eliminar si tiene turnos confirmados a futuro (hay que cancelarlos antes: no hay reprogramación)
-- ni si es el último profesional activo. Idempotente.

alter table public.resources add column if not exists deleted_at timestamptz;

-- Un profesional archivado nunca vuelve a estar activo (ni por error desde la API).
alter table public.resources drop constraint if exists resources_deleted_inactive_check;
alter table public.resources add constraint resources_deleted_inactive_check check (deleted_at is null or not is_active);

-- Los servicios nuevos no se asignan a profesionales archivados.
create or replace function public.assign_new_service_resources()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.resource_services (resource_id, service_id, business_id)
    select r.id, new.id, new.business_id from public.resources r
    where r.business_id = new.business_id and r.deleted_at is null
    on conflict do nothing;
  return new;
end;
$$;

create or replace function public.delete_professional(p_resource_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_resource resources%rowtype;
  v_future int;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para eliminar un profesional';
  end if;

  select r.* into v_resource
    from resources r join businesses b on b.id = r.business_id
    where r.id = p_resource_id and b.owner_id = auth.uid() and r.deleted_at is null
    for update of r;
  if not found then
    raise exception 'No encontramos ese profesional';
  end if;

  if v_resource.is_active and not exists (
    select 1 from resources r
    where r.business_id = v_resource.business_id and r.id <> v_resource.id and r.is_active
  ) then
    raise exception 'Tiene que quedar al menos un profesional activo';
  end if;

  select count(*) into v_future
    from reservations
    where resource_id = v_resource.id and status = 'confirmed' and starts_at > now();
  if v_future > 0 then
    raise exception 'Tiene % % por delante. Cancelalos desde Reservas antes de eliminarlo', v_future,
      case when v_future = 1 then 'turno confirmado' else 'turnos confirmados' end;
  end if;

  if not exists (select 1 from reservations where resource_id = v_resource.id) then
    delete from resources where id = v_resource.id; -- en cascada: horarios, servicios, días libres, acceso
    return json_build_object('mode', 'deleted');
  end if;

  update resources set deleted_at = now(), is_active = false where id = v_resource.id;
  delete from availability where resource_id = v_resource.id;
  delete from resource_services where resource_id = v_resource.id;
  delete from time_off where resource_id = v_resource.id;
  delete from staff_members where resource_id = v_resource.id;
  delete from staff_invites where resource_id = v_resource.id;
  return json_build_object('mode', 'archived');
end;
$$;

revoke all on function public.delete_professional(uuid) from public, anon, authenticated;
grant execute on function public.delete_professional(uuid) to authenticated;

comment on column public.resources.deleted_at is 'Profesional eliminado que tenía reservas: se conserva para el historial (ver migración 030).';
