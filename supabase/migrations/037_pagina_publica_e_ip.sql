-- 037 · Página pública por negocio e IP real en el freno de reservas (auditoría del 2026-10-21).
--
-- 1) Las vistas públicas no obligaban a pedir un negocio: cualquiera podía listar los WhatsApp de todos los
--    profesionales de todos los negocios. Ahora la página de reservas pide todo junto con el enlace del negocio
--    (public_booking_page) y las vistas dejan de ser legibles desde afuera (la función las sigue usando).
-- 2) El freno de 20 reservas por hora por IP usaba el primer valor de x-forwarded-for, que lo escribe el visitante
--    (comprobado: con "X-Forwarded-For: 9.9.9.9" la IP pasaba a ser 9.9.9.9). Ahora usa cf-connecting-ip,
--    que pone Cloudflare, y como respaldo el último valor de x-forwarded-for.

create or replace function public.public_booking_page(p_slug text)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when b.slug is null then null else json_build_object(
    'business', to_json(b),
    'services', coalesce((select json_agg(s order by s.name) from public_services s where s.business_slug = p_slug), '[]'::json),
    'professionals', coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'whatsapp', r.whatsapp) order by r.created_at, r.id)
                               from public_resources r where r.business_slug = p_slug), '[]'::json),
    'offers', coalesce((select json_agg(json_build_object('resource_id', o.resource_id, 'service_id', o.service_id))
                        from public_resource_services o where o.business_slug = p_slug), '[]'::json)
  ) end
  from (select 1) as one
  left join public_businesses b on b.slug = p_slug
$$;

grant execute on function public.public_booking_page(text) to anon, authenticated;
revoke select on public.public_businesses, public.public_services, public.public_resources, public.public_resource_services from anon, authenticated;

-- Igual que la versión vigente (014 y siguientes), salvo cómo se toma la IP
create or replace function public.book_public_core(p_slug text, p_service_id uuid, p_starts_at timestamp with time zone, p_name text, p_email text default null::text, p_phone text default null::text, p_resource_id uuid default null::uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_business businesses%rowtype;
  v_service services%rowtype;
  v_resource_id uuid;
  v_resource_name text;
  v_client_id uuid;
  v_ends_at timestamptz;
  v_reservation_id uuid;
  v_local_start timestamp;
  v_slots_needed int;
  v_email_key text;
  v_ip_key text;
  v_attempts int;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'El correo electrónico es obligatorio';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'La reserva tiene que ser a futuro';
  end if;

  v_email_key := lower(btrim(p_email));
  -- IP real del visitante: cf-connecting-ip la pone Cloudflare; el último valor de x-forwarded-for queda de respaldo
  v_ip_key := nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    regexp_replace(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), '^.*,', '')
  )), '');

  select count(*) into v_attempts from book_rate_log
    where kind = 'email' and key = v_email_key and created_at > now() - interval '1 hour';
  if v_attempts >= 5 then
    raise exception 'Demasiadas reservas con ese email, probá más tarde';
  end if;

  if v_ip_key is not null then
    select count(*) into v_attempts from book_rate_log
      where kind = 'ip' and key = v_ip_key and created_at > now() - interval '1 hour';
    if v_attempts >= 20 then
      raise exception 'Demasiadas reservas desde esta conexión, probá más tarde';
    end if;
  end if;

  insert into book_rate_log (kind, key) values ('email', v_email_key);
  if v_ip_key is not null then
    insert into book_rate_log (kind, key) values ('ip', v_ip_key);
    delete from book_rate_log where kind = 'ip' and key = v_ip_key
      and created_at < now() - interval '1 day';
  end if;

  select * into v_business from businesses where slug = p_slug;
  if not found then
    raise exception 'Negocio no encontrado';
  end if;

  select * into v_service from services
    where id = p_service_id and business_id = v_business.id and is_active and booking_mode = 'online';
  if not found then
    raise exception 'Servicio no disponible';
  end if;

  v_local_start := p_starts_at at time zone v_business.timezone;
  if false
    or extract(second from v_local_start) <> 0 then
    raise exception 'Ese horario no está dentro de la disponibilidad del negocio';
  end if;

  if p_starts_at < now() + make_interval(hours => v_business.min_notice_hours) then
    raise exception 'Ya no se puede reservar con tan poca anticipación';
  end if;
  if (p_starts_at at time zone v_business.timezone)::date > (now() at time zone v_business.timezone)::date + v_business.max_advance_days then
    raise exception 'Todavía no se pueden reservar turnos para esa fecha';
  end if;
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_min);
  v_slots_needed := greatest(1, ceil(v_service.duration_min / 30.0))::int;

  v_resource_id := public.pick_resource(
    v_business.id, v_business.timezone, p_starts_at, v_ends_at, v_slots_needed, p_resource_id, v_service.id
  );
  select r.name into v_resource_name from resources r where r.id = v_resource_id;

  select id into v_client_id from clients
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

  return json_build_object(
    'id', v_reservation_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at,
    'resource_id', v_resource_id,
    'resource_name', v_resource_name
  );

exception
  when exclusion_violation then
    raise exception 'Ese horario acaba de ocuparse, elegí otro';
end;
$function$;
