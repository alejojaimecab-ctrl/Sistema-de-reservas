-- RESER · Cuentas para los profesionales (empleados) del negocio.
--
-- El dueño (businesses.owner_id) sigue teniendo acceso a todo. Un profesional con cuenta (staff_members)
-- queda vinculado a su fila de resources y solo puede:
--   · ver su agenda y sus reservas, con el nombre y el email de sus clientes;
--   · marcar sus turnos como atendido / no vino y cancelarlos;
--   · cargar reservas a mano, solo en su propia agenda;
--   · editar sus horarios (availability), pero no sus días libres (time_off: solo los ve);
--   · ver los servicios y sus precios.
-- No ve estadísticas del negocio, ni a los demás profesionales y sus reservas, ni puede tocar servicios,
-- equipo, días libres ni la configuración.
--
-- El dueño invita con un enlace (/unirme/<token>, vale 7 días); el profesional crea su cuenta o entra con la
-- suya y acepta. Idempotente: se puede volver a correr.

-- 1) Tablas -------------------------------------------------------------------------------------------------

create table if not exists public.staff_members (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  email text, -- copia del email de la cuenta al aceptar: el dueño ve con qué cuenta quedó vinculado
  created_at timestamptz not null default now()
);
create index if not exists staff_members_business_id_idx on public.staff_members (business_id);

create table if not exists public.staff_invites (
  token uuid primary key default gen_random_uuid(),
  resource_id uuid not null unique references public.resources(id) on delete cascade, -- una invitación vigente por profesional
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists staff_invites_business_id_idx on public.staff_invites (business_id);

alter table public.staff_members enable row level security;
alter table public.staff_invites enable row level security;

-- Se crean solo con las funciones de abajo; desde la app se leen y se borran (quitar acceso / anular invitación).
revoke all on public.staff_members, public.staff_invites from anon, authenticated;
grant select, delete on public.staff_members, public.staff_invites to authenticated;

-- 2) Helpers para las políticas ------------------------------------------------------------------------------
-- En un esquema que la API no expone. Son security definer para leer staff_members sin pasar por sus propias
-- políticas (si no, businesses → staff_members → businesses sería una recursión infinita).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.staff_resource_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select sm.resource_id from public.staff_members sm where sm.user_id = (select auth.uid())
$$;

create or replace function private.staff_business_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select sm.business_id from public.staff_members sm where sm.user_id = (select auth.uid())
$$;

revoke all on function private.staff_resource_ids(), private.staff_business_ids() from public;
grant execute on function private.staff_resource_ids(), private.staff_business_ids() to authenticated;

-- 3) Políticas ------------------------------------------------------------------------------------------------
-- Las del dueño ("own ...") no cambian. Estas se suman (permisivas): el profesional ve lo suyo y nada más.

drop policy if exists "owner staff_members" on public.staff_members;
create policy "owner staff_members" on public.staff_members for all to authenticated
  using (business_id in (select b.id from public.businesses b where b.owner_id = (select auth.uid())));
drop policy if exists "staff own membership" on public.staff_members;
create policy "staff own membership" on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "owner staff_invites" on public.staff_invites;
create policy "owner staff_invites" on public.staff_invites for all to authenticated
  using (business_id in (select b.id from public.businesses b where b.owner_id = (select auth.uid())));

drop policy if exists "staff read business" on public.businesses;
create policy "staff read business" on public.businesses for select to authenticated
  using (id in (select private.staff_business_ids()));

drop policy if exists "staff read own resource" on public.resources;
create policy "staff read own resource" on public.resources for select to authenticated
  using (id in (select private.staff_resource_ids()));

drop policy if exists "staff read services" on public.services;
create policy "staff read services" on public.services for select to authenticated
  using (business_id in (select private.staff_business_ids()));

drop policy if exists "staff read own resource_services" on public.resource_services;
create policy "staff read own resource_services" on public.resource_services for select to authenticated
  using (resource_id in (select private.staff_resource_ids()));

drop policy if exists "staff own availability" on public.availability;
create policy "staff own availability" on public.availability for all to authenticated
  using (resource_id in (select private.staff_resource_ids()))
  with check (resource_id in (select private.staff_resource_ids()));

-- Ve los días libres del negocio entero y los suyos; no los crea ni los borra.
drop policy if exists "staff read time_off" on public.time_off;
create policy "staff read time_off" on public.time_off for select to authenticated
  using (
    business_id in (select private.staff_business_ids())
    and (resource_id is null or resource_id in (select private.staff_resource_ids()))
  );

-- Solo lectura: los cambios de estado y las cancelaciones pasan por funciones que validan el permiso.
drop policy if exists "staff read own reservations" on public.reservations;
create policy "staff read own reservations" on public.reservations for select to authenticated
  using (resource_id in (select private.staff_resource_ids()));

drop policy if exists "staff read own clients" on public.clients;
create policy "staff read own clients" on public.clients for select to authenticated
  using (exists (
    select 1 from public.reservations r
    where r.client_id = clients.id and r.resource_id in (select private.staff_resource_ids())
  ));

-- 4) Invitaciones ---------------------------------------------------------------------------------------------

-- El dueño crea (o renueva) el enlace de invitación de un profesional. Devuelve el token.
create or replace function public.create_staff_invite(p_resource_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_resource resources%rowtype;
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para invitar a un profesional';
  end if;

  select r.* into v_resource
    from resources r join businesses b on b.id = r.business_id
    where r.id = p_resource_id and b.owner_id = auth.uid();
  if not found then
    raise exception 'No encontramos ese profesional';
  end if;
  if exists (select 1 from staff_members where resource_id = p_resource_id) then
    raise exception 'Ese profesional ya tiene una cuenta vinculada';
  end if;

  delete from staff_invites where resource_id = p_resource_id;
  insert into staff_invites (resource_id, business_id)
    values (p_resource_id, v_resource.business_id)
    returning token into v_token;
  return json_build_object('token', v_token);
end;
$$;

-- Lo que muestra la página /unirme/<token> antes de aceptar (también sin sesión).
create or replace function public.get_staff_invite(p_token uuid)
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
      'business_name', b.name,
      'professional_name', r.name,
      'logo_path', b.logo_path,
      'expired', i.expires_at < now()
    ) into v_result
    from staff_invites i
    join businesses b on b.id = i.business_id
    join resources r on r.id = i.resource_id
    where i.token = p_token;
  if v_result is null then
    raise exception 'Esta invitación ya no es válida';
  end if;
  return v_result;
end;
$$;

create or replace function public.accept_staff_invite(p_token uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_invite staff_invites%rowtype;
  v_current staff_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para aceptar la invitación';
  end if;

  select * into v_invite from staff_invites where token = p_token for update;
  if not found then
    raise exception 'Esta invitación ya no es válida';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Esta invitación venció. Pedile al dueño del negocio un enlace nuevo';
  end if;
  if exists (select 1 from businesses where owner_id = auth.uid()) then
    raise exception 'Esta cuenta ya es dueña de un negocio en RESER. Para sumarte como profesional usá otra cuenta';
  end if;

  select * into v_current from staff_members where user_id = auth.uid();
  if found then
    if v_current.resource_id = v_invite.resource_id then
      delete from staff_invites where token = p_token;
      return json_build_object('business_id', v_current.business_id);
    end if;
    raise exception 'Esta cuenta ya forma parte de otro equipo en RESER';
  end if;
  if exists (select 1 from staff_members where resource_id = v_invite.resource_id) then
    raise exception 'Ese profesional ya tiene una cuenta vinculada';
  end if;

  insert into staff_members (resource_id, business_id, user_id, email)
    values (v_invite.resource_id, v_invite.business_id, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()));
  delete from staff_invites where token = p_token;
  return json_build_object('business_id', v_invite.business_id);
end;
$$;

-- 5) Reservas: el profesional opera sobre su propia agenda --------------------------------------------------

-- Atendido / no vino / deshacer, para el dueño y para el profesional del turno.
create or replace function public.set_reservation_status(p_reservation_id uuid, p_status text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para actualizar un turno';
  end if;
  if p_status is null or p_status not in ('confirmed', 'completed', 'no_show') then
    raise exception 'Estado de turno inválido';
  end if;

  select r.* into v_res
    from reservations r
    join businesses b on b.id = r.business_id
    where r.id = p_reservation_id
      and (b.owner_id = auth.uid() or r.resource_id in (select private.staff_resource_ids()))
    for update of r;
  if not found then
    raise exception 'No encontramos ese turno';
  end if;
  if v_res.status = 'cancelled' then
    raise exception 'Ese turno está cancelado';
  end if;
  if p_status <> 'confirmed' and v_res.starts_at > now() then
    raise exception 'Todavía no llegó el horario de ese turno';
  end if;

  update reservations set status = p_status where id = v_res.id;
  return json_build_object('status', p_status);
end;
$$;

create or replace function public.cancel_reservation_owner(p_reservation_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión para cancelar un turno';
  end if;

  select r.* into v_res
    from reservations r
    join businesses b on b.id = r.business_id
    where r.id = p_reservation_id
      and (b.owner_id = auth.uid() or r.resource_id in (select private.staff_resource_ids()))
    for update of r;
  if not found then
    raise exception 'No encontramos ese turno';
  end if;

  if v_res.status = 'cancelled' then
    return json_build_object('status', 'cancelled');
  end if;
  if v_res.status in ('completed', 'no_show') then
    raise exception 'Ese turno ya está marcado como atendido';
  end if;

  -- 'owner' = lo canceló el negocio (el dueño o el profesional): se le avisa al cliente.
  update reservations set status = 'cancelled', cancelled_by = 'owner' where id = v_res.id;
  return json_build_object('status', 'cancelled');
end;
$$;

-- Igual que antes para el dueño; un profesional solo puede cargar turnos en su propia agenda.
create or replace function public.create_owner_reservation(p_business_id uuid, p_service_id uuid, p_starts_at timestamp with time zone, p_name text, p_email text, p_phone text default null::text, p_resource_id uuid default null::uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
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

  insert into reservations (business_id, resource_id, client_id, service_id, starts_at, ends_at, status)
    values (v_business.id, v_resource_id, v_client_id, v_service.id, p_starts_at, v_ends_at, 'confirmed')
    returning id into v_reservation_id;

  return json_build_object('id', v_reservation_id);
exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$$;

-- 6) Permisos de las funciones (las nuevas no quedan expuestas por defecto) ---------------------------------

revoke all on function public.create_staff_invite(uuid), public.accept_staff_invite(uuid),
  public.set_reservation_status(uuid, text), public.get_staff_invite(uuid) from public, anon, authenticated;
grant execute on function public.create_staff_invite(uuid), public.accept_staff_invite(uuid),
  public.set_reservation_status(uuid, text) to authenticated;
grant execute on function public.get_staff_invite(uuid) to anon, authenticated;

comment on table public.staff_members is 'Profesionales con cuenta propia: cada uno ve y opera solo su agenda (ver migración 029).';
comment on table public.staff_invites is 'Enlaces de invitación para que un profesional cree o vincule su cuenta (vencen a los 7 días).';
