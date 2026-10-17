-- RESER · Servicios con precio variable y servicios que se coordinan por WhatsApp.
--
-- services.price_mode:   'fixed' (precio fijo) | 'from' (desde $X) | 'ask' (a consultar)
-- services.booking_mode: 'online' (turno con horario en RESER) | 'whatsapp' (se coordina por
--                        WhatsApp: no usa la agenda de RESER, el profesional organiza ahí sus horarios)
-- resources.whatsapp:    número del profesional; es el que se abre al consultar un servicio por WhatsApp.
--
-- Un servicio 'whatsapp' NO se puede reservar online: public_slots no devuelve horarios y las
-- funciones de reserva (pública y del dueño) lo rechazan. Las funciones existentes se parchean
-- sobre su definición actual (si un reemplazo no encuentra su texto, falla toda la migración).

-- 1) Columnas -----------------------------------------------------------------------------
alter table public.services add column if not exists price_mode text not null default 'fixed';
alter table public.services add column if not exists booking_mode text not null default 'online';
alter table public.services drop constraint if exists services_price_mode_check;
alter table public.services
  add constraint services_price_mode_check check (price_mode in ('fixed', 'from', 'ask'));
alter table public.services drop constraint if exists services_booking_mode_check;
alter table public.services
  add constraint services_booking_mode_check check (booking_mode in ('online', 'whatsapp'));

alter table public.resources add column if not exists whatsapp text;
alter table public.resources drop constraint if exists resources_whatsapp_length_check;
alter table public.resources
  add constraint resources_whatsapp_length_check check (char_length(coalesce(whatsapp, '')) <= 40);

-- 2) Vistas públicas (se agregan columnas al final) ---------------------------------------------
create or replace view public.public_services as
select s.id, b.slug as business_slug, s.name, s.duration_min, s.price, s.price_mode, s.booking_mode
from public.services s
join public.businesses b on b.id = s.business_id
where s.is_active;

create or replace view public.public_resources as
select r.id, b.slug as business_slug, r.name, r.created_at, r.whatsapp
from public.resources r
join public.businesses b on b.id = r.business_id
where r.is_active;

-- 3) Los servicios por WhatsApp no se reservan online ------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.public_slots(text, uuid, date, uuid)'::regprocedure);
  v_new := replace(v_def,
    's.business_id = v_business.id and s.is_active',
    's.business_id = v_business.id and s.is_active and s.booking_mode = ''online''');
  if v_new = v_def then raise exception 'No se pudo actualizar public_slots'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.book_public_core(text, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'where id = p_service_id and business_id = v_business.id and is_active;',
    'where id = p_service_id and business_id = v_business.id and is_active and booking_mode = ''online'';');
  if v_new = v_def then raise exception 'No se pudo actualizar book_public_core'; end if;
  execute v_new;

  v_def := pg_get_functiondef('public.create_owner_reservation(uuid, uuid, timestamptz, text, text, text, uuid)'::regprocedure);
  v_new := replace(v_def,
    'where id = p_service_id and business_id = v_business.id and is_active;',
    'where id = p_service_id and business_id = v_business.id and is_active and booking_mode = ''online'';');
  if v_new = v_def then raise exception 'No se pudo actualizar create_owner_reservation'; end if;
  execute v_new;
end;
$$;
