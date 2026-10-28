-- 046: la página de cancelar suma el enlace y el teléfono del negocio, para que el cliente pueda volver a reservar
-- o comunicarse (antes terminaba en "Ir a RESER"). Los dos ya son públicos en la página de reservas (public_businesses).
create or replace function public.get_reservation_by_token(p_token uuid)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v record;
begin
  select r.starts_at, r.ends_at, r.status, b.name as business_name, b.slug as business_slug, b.phone as business_phone,
         b.cancel_min_hours, s.name as service_name, res.name as professional_name
    into v
    from reservations r
    join businesses b on b.id = r.business_id
    join services s on s.id = r.service_id
    join resources res on res.id = r.resource_id
    where r.cancel_token = p_token;
  if not found then
    raise exception 'No encontramos esa reserva';
  end if;

  return json_build_object(
    'business_name', v.business_name,
    'business_slug', v.business_slug,
    'business_phone', v.business_phone,
    'service_name', v.service_name,
    'professional_name', v.professional_name,
    'starts_at', v.starts_at,
    'ends_at', v.ends_at,
    'status', v.status,
    'cancel_min_hours', v.cancel_min_hours,
    'can_cancel', v.status = 'confirmed'
      and v.starts_at > now() + make_interval(hours => v.cancel_min_hours)
  );
end;
$$;

revoke all on function public.get_reservation_by_token(uuid) from public;
grant execute on function public.get_reservation_by_token(uuid) to anon, authenticated;

-- El enlace del negocio se usa para armar links (cancelar, compartir): la base exige la misma forma que arma la app
-- (slugify + slugProblem: minúsculas, números y guiones, de 3 a 40). Sin esto, "/evil.com" por la API sería un link a otro sitio.
alter table public.businesses drop constraint if exists businesses_slug_format;
alter table public.businesses add constraint businesses_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
