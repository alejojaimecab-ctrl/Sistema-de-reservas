-- RESER · Datos públicos del negocio (teléfono, dirección, logo) y limpieza de logs.

-- 1) Datos de contacto ---------------------------------------------------------------------
alter table public.businesses add column if not exists phone text;
alter table public.businesses add column if not exists address text;
alter table public.businesses add column if not exists logo_path text;
alter table public.businesses drop constraint if exists businesses_contact_length_check;
alter table public.businesses
  add constraint businesses_contact_length_check check (
    char_length(coalesce(phone, '')) <= 40
    and char_length(coalesce(address, '')) <= 160
    and char_length(coalesce(logo_path, '')) <= 200
  );

create or replace view public.public_businesses as
select slug, name, cancel_min_hours, min_notice_hours, max_advance_days, phone, address, logo_path
from public.businesses;

-- 2) Logos: bucket público de solo lectura; cada dueño escribe solo en la carpeta de su
--    negocio (<business_id>/archivo). Solo imágenes raster (nada de SVG: puede llevar scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-logos', 'business-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owners read own logos" on storage.objects;
create policy "owners read own logos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (select id::text from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owners upload own logos" on storage.objects;
create policy "owners upload own logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (select id::text from public.businesses where owner_id = auth.uid())
  );

drop policy if exists "owners delete own logos" on storage.objects;
create policy "owners delete own logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (select id::text from public.businesses where owner_id = auth.uid())
  );

-- 3) Privacidad: el log anti-abuso (emails e IPs de quienes reservan) se purga a diario.
--    Los límites miran solo la última hora, así que 2 días sobra.
select cron.unschedule('purge-book-rate-log')
  where exists (select 1 from cron.job where jobname = 'purge-book-rate-log');

select cron.schedule(
  'purge-book-rate-log',
  '17 4 * * *',
  $$ delete from public.book_rate_log where created_at < now() - interval '2 days' $$
);
