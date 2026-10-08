-- RESER · Recordatorios por email 1 hora antes del turno.
-- Requiere haber corrido hasta 007_slots_duracion_timezone.sql.
--
-- Piezas:
--   1) reservations.reminder_sent_at → marca qué turnos ya fueron recordados.
--   2) pg_cron + pg_net → cada 5 minutos llama a la Edge Function
--      send-reminders, que manda los emails por Resend.
--
-- Después de correr esta migración hace falta (una sola vez, SQL Editor):
--   alter database postgres set app.reminder_secret = '<un-secreto-largo>';
-- y en el CLI:
--   supabase functions deploy send-reminders
--   supabase secrets set RESEND_API_KEY=... REMINDER_SECRET=<el-mismo-secreto>
--     REMINDER_FROM="RESER <onboarding@resend.dev>"

-- 1) Marca de recordatorio enviado
alter table public.reservations
  add column if not exists reminder_sent_at timestamptz;

-- El cron consulta siempre por (confirmadas, no recordadas, en la ventana):
create index if not exists reservations_reminder_idx
  on public.reservations (starts_at)
  where status = 'confirmed' and reminder_sent_at is null;

-- 2) Extensiones para el scheduler y las llamadas HTTP
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Cron cada 5 minutos → Edge Function send-reminders.
--    La URL sale del propio proyecto; el secreto viaja en el header y la
--    función lo valida contra REMINDER_SECRET.
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
      'x-reminder-secret', current_setting('app.reminder_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verificación:
--   select * from cron.job where jobname = 'send-reminders';
--   -- Crear una reserva confirmada que empiece en ~60 min con email real
--   -- y esperar a la próxima corrida (o disparar a mano):
--   select net.http_post(
--     url := 'https://lhmpmzxvpkqlfnwvwglu.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-reminder-secret', current_setting('app.reminder_secret', true)
--     ),
--     body := '{}'::jsonb
--   );
--   select id, starts_at, reminder_sent_at from reservations
--     order by starts_at desc limit 5;
