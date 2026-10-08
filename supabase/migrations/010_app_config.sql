-- RESER · Config secreta en tabla (reemplaza app.reminder_secret por setting).
-- Supabase no permite ALTER DATABASE SET con parámetros custom desde el
-- SQL Editor, así que el secreto del cron vive en una tabla sin grants;
-- solo la función security definer puede leerla (y el cron corre como
-- postgres, que es superuser).

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;
-- Sin policies y sin grants: ni anon ni authenticated pueden leerla.
revoke all on public.app_config from public, anon, authenticated;

create or replace function public.get_app_secret(p_key text)
returns text
language sql
security definer set search_path = public
as $$
  select value from app_config where key = p_key;
$$;

revoke all on function public.get_app_secret(text) from public, anon, authenticated;

-- Reprogramar el cron para leer el secreto de la tabla
select cron.unschedule('send-reminders') where exists (
  select 1 from cron.job where jobname = 'send-reminders'
);

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://lhmpmzxvpkqlfnwvwglu.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', public.get_app_secret('reminder_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Después de correr esta migración, UNA sola vez en el SQL Editor:
--   insert into public.app_config (key, value)
--     values ('reminder_secret', '<el secreto de .env.local>')
--     on conflict (key) do update set value = excluded.value;
--
-- Verificación:
--   select public.get_app_secret('reminder_secret');  -- devuelve el secreto
--   -- con rol anon: permission denied
