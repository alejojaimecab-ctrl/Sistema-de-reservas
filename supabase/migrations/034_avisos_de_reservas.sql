-- Avisos de reservas nuevas en el panel (sonido y notificación del sistema).
--
-- 1) De dónde vino cada reserva: 'public' (el cliente desde el enlace de reserva) o 'manual' (el dueño o un
--    profesional desde el panel). Solo las públicas avisan. El valor por defecto es 'public', así book_public_core
--    no cambia. Las reservas anteriores quedan como 'public': no se puede saber su origen y el aviso es solo para las nuevas.
alter table public.reservations add column if not exists source text not null default 'public';
alter table public.reservations drop constraint if exists reservations_source_check;
alter table public.reservations add constraint reservations_source_check check (source in ('public', 'manual'));
comment on column public.reservations.source is 'public: la hizo el cliente desde el enlace de reserva. manual: la cargó el dueño o un profesional desde el panel. Solo las públicas disparan el aviso en el panel.';

-- 2) Las reservas cargadas desde el panel se marcan como manuales (el resto es igual que en 029).
create or replace function public.create_owner_reservation(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_email text,
  p_phone text default null,
  p_resource_id uuid default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business businesses%rowtype;
  v_resource_id uuid;
  v_staff_resource_id uuid;
  v_service services%rowtype;
  v_client_id uuid;
  v_ends_at timestamptz;
  v_local_start timestamp;
  v_slots_needed int;
  v_reservation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para crear una reserva';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre del cliente es obligatorio';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'El correo electrónico es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'Elegí un horario futuro';
  end if;

  select * into v_business
    from businesses
    where id = p_business_id and owner_id = auth.uid();
  if not found then
    select sm.resource_id into v_staff_resource_id
      from staff_members sm
      where sm.user_id = auth.uid() and sm.business_id = p_business_id;
    if v_staff_resource_id is null then
      raise exception 'No tenés permiso sobre este negocio';
    end if;
    if p_resource_id is not null and p_resource_id <> v_staff_resource_id then
      raise exception 'Solo podés cargar turnos en tu propia agenda';
    end if;
    p_resource_id := v_staff_resource_id;
    select * into v_business from businesses where id = p_business_id;
  end if;

  select * into v_service
    from services
    where id = p_service_id and business_id = v_business.id and is_active and booking_mode = 'online';
  if not found then
    raise exception 'Elegí un servicio activo de este negocio';
  end if;

  v_local_start := p_starts_at at time zone v_business.timezone;
  if extract(second from v_local_start) <> 0 then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);
  v_slots_needed := greatest(1, ceil(v_service.duration_min / 30.0))::int;

  v_resource_id := public.pick_resource(
    v_business.id, v_business.timezone, p_starts_at, v_ends_at, v_slots_needed, p_resource_id, v_service.id
  );

  select id into v_client_id
    from clients
    where business_id = v_business.id and lower(email) = lower(btrim(p_email)) and lower(btrim(name)) = lower(btrim(p_name))
    limit 1;
  if v_client_id is null then
    insert into clients (business_id, name, email, phone)
      values (v_business.id, btrim(p_name), btrim(p_email), nullif(btrim(p_phone), ''))
      returning id into v_client_id;
  end if;

  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status, source)
    values (v_business.id, v_resource_id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed', 'manual')
    returning id into v_reservation_id;

  return json_build_object('id', v_reservation_id);
exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$function$;

-- 3) Tiempo real: el panel escucha las reservas nuevas. Realtime aplica el RLS de quien escucha, así que el dueño
--    recibe las de todo su negocio y cada profesional solo las suyas; anon no recibe nada (no puede leer reservations).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end;
$$;
